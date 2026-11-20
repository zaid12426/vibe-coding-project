require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const Conversation = require('./models/Conversation');
const { streamReply, providerName } = require('./llm');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// The Vibe Check: each tone becomes a system instruction sent to the AI API.
// ---------------------------------------------------------------------------
const BASE_INSTRUCTION = 'You are a helpful AI assistant.';
const TONE_INSTRUCTIONS = {
  professional:
    'Respond in a professional, formal tone. Use clear structure, precise language and complete sentences. Avoid slang and emojis.',
  casual:
    'Respond in a casual, friendly, conversational tone, like chatting with a friend. Contractions and light humour are fine; an emoji now and then is okay.',
  concise:
    'Respond as concisely as possible. Give only the essential answer in as few words as needed: no preamble, no filler, no repetition. Use short bullet points only if they help.',
};

function buildSystemInstruction(tone) {
  return `${BASE_INSTRUCTION} ${TONE_INSTRUCTIONS[tone]}`;
}

// ---------------------------------------------------------------------------
// History endpoints (used by the sidebar)
// ---------------------------------------------------------------------------
app.get('/api/conversations', async (req, res) => {
  const list = await Conversation.find({}, { title: 1, updatedAt: 1, createdAt: 1 })
    .sort({ updatedAt: -1 })
    .lean();
  res.json(list);
});

app.get('/api/conversations/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const convo = await Conversation.findById(req.params.id).lean();
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });
  res.json(convo);
});

app.delete('/api/conversations/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  await Conversation.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Chat endpoint: streams the AI reply back using Server-Sent Events (SSE)
// ---------------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const { conversationId, message } = req.body || {};
  const tone = TONE_INSTRUCTIONS[req.body?.tone] ? req.body.tone : 'professional';

  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  // 1. Find the existing thread, or start a new one.
  let convo = null;
  if (conversationId) {
    if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ error: 'Invalid id' });
    convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
  } else {
    convo = new Conversation({ title: message.trim().slice(0, 40) });
  }

  // 2. Build the message history for the AI (previous turns + new prompt).
  const history = [];
  for (const ex of convo.exchanges) {
    history.push({ role: 'user', content: ex.userPrompt });
    if (ex.aiResponse) history.push({ role: 'assistant', content: ex.aiResponse });
  }
  history.push({ role: 'user', content: message });

  // 3. Open the SSE stream to the browser.
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Tell the client which thread this belongs to (needed for new chats).
  send('meta', { conversationId: convo._id, title: convo.title, tone });

  // Stop generating if the user closes the tab.
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  // 4. Stream the reply, forwarding each chunk to the browser.
  let fullResponse = '';
  try {
    await streamReply({
      system: buildSystemInstruction(tone),
      messages: history,
      signal: abort.signal,
      onText: (text) => {
        fullResponse += text;
        send('delta', { text });
      },
    });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('AI API error:', err.message);
      send('error', { message: 'The AI service returned an error: ' + err.message });
    }
  }

  // 5. Persist: timestamp + user prompt + AI response (+ tone used).
  if (fullResponse) {
    convo.exchanges.push({ userPrompt: message, aiResponse: fullResponse, tone, timestamp: new Date() });
    await convo.save();
  }

  if (!abort.signal.aborted) {
    send('done', { conversationId: convo._id });
    res.end();
  }
});

// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai-chat-assistant';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AI provider: ${providerName()}`);
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });

module.exports = { app, buildSystemInstruction };

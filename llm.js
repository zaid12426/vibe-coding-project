// Wraps the AI provider so server.js doesn't care whether it's Claude or OpenAI.
// Set AI_PROVIDER=anthropic or AI_PROVIDER=openai in .env.

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

function providerName() {
  const p = (process.env.AI_PROVIDER || '').toLowerCase();
  if (p === 'anthropic' || p === 'openai') return p;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

/**
 * Streams a reply from the AI.
 * @param {object} opts
 * @param {string} opts.system    system instruction (includes the tone modifier)
 * @param {Array}  opts.messages  [{ role: 'user' | 'assistant', content }]
 * @param {Function} opts.onText  called with each text chunk as it arrives
 * @param {AbortSignal} opts.signal
 */
async function streamReply({ system, messages, onText, signal }) {
  const provider = providerName();

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = client.messages.stream(
      {
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 1024,
        system, // <- tone-specific system instruction
        messages,
      },
      { signal }
    );
    stream.on('text', onText);
    await stream.finalMessage();
    return;
  }

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await client.chat.completions.create(
      {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        stream: true,
        messages: [{ role: 'system', content: system }, ...messages], // <- tone as system message
      },
      { signal }
    );
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) onText(text);
    }
    return;
  }

  throw new Error('No API key set. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to your .env file.');
}

module.exports = { streamReply, providerName };

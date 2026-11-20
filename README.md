# AI Chat Assistant

A chat interface with real-time streaming responses, a conversation history sidebar backed by MongoDB, and a **Tone Toggle** (Professional / Casual / Concise) that changes the AI's style instantly.

## Features

| Requirement | How it's done |
|---|---|
| **Chat interface** | Scrollable view with separate bubbles for the user (right, blue) and the AI (left, dark), each with a timestamp |
| **Streaming view** | The backend streams the AI reply over **Server-Sent Events (SSE)**; the frontend types it out **character by character** with a blinking cursor |
| **History sidebar** | Lists past threads (newest first); click one to reload it, ✕ to delete, "+ New chat" to start fresh |
| **API integration** | Works with the **Claude (Anthropic)** or **OpenAI** API, chosen with one setting in `.env` |
| **Persistence** | MongoDB stores each conversation with its exchanges: `timestamp`, `userPrompt`, `aiResponse` and the `tone` used |
| **Tone Toggle (Vibe Check)** | The selected tone is sent with every message; the backend turns it into a **system instruction** for the AI request, so the next reply changes style immediately |

## Tech stack

- **Frontend:** HTML, CSS, vanilla JavaScript (no build step)
- **Backend:** Node.js, Express
- **Database:** MongoDB with Mongoose
- **AI:** `@anthropic-ai/sdk` or `openai`

## Project structure

```
├── server.js              # Express server, API routes, tone → system instruction
├── llm.js                 # Streams replies from Claude or OpenAI
├── models/
│   └── Conversation.js    # MongoDB schema
└── public/
    ├── index.html         # Layout: sidebar, chat, tone toggle, input box
    ├── style.css          # Styling
    └── app.js             # Streaming, typewriter effect, history, tone toggle
```

## How the Tone Toggle works

```
User clicks "Casual"  →  frontend sends { message, tone: "casual" }
                      →  server.js picks TONE_INSTRUCTIONS.casual
                      →  sends it as the `system` prompt to the AI API
                      →  the reply streams back in a casual style
```

The tone is stored with each exchange, so reopening an old chat shows which tone each reply used.

## Data model

```js
Conversation {
  title: String,
  exchanges: [
    { userPrompt: String, aiResponse: String, tone: String, timestamp: Date }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

## API endpoints

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Send `{ conversationId?, message, tone }`; streams the reply (SSE events: `meta`, `delta`, `done`, `error`) |
| `GET` | `/api/conversations` | List threads for the sidebar |
| `GET` | `/api/conversations/:id` | Get one thread with all its exchanges |
| `DELETE` | `/api/conversations/:id` | Delete a thread |

## Running locally

**Requirements:** Node.js 18+, a MongoDB database (local, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster), and an Anthropic or OpenAI API key.

```bash
git clone <this-repo-url>
cd ai-chat-assistant
npm install
cp .env.example .env      # on Windows: copy .env.example .env
```

Edit `.env`: set `MONGODB_URI`, `AI_PROVIDER`, and the matching API key. Then:

```bash
npm start
```

Open **http://localhost:3000**.

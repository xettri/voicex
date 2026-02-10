
import express from 'express';

import { Ollama } from 'ollama';
import dotenv from 'dotenv';


dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

app.use(express.json());

const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

app.post('/chat/completions/stream', async (req, res) => {
  const { messages, model = 'hammerai/mythomax-l2:latest' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await ollama.chat({
      model: model,
      messages: messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.message.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Ollama Error:', error);
    res.status(500).json({ error: 'LLM Stream Error' });
  }
});

const server = app.listen(port, () => {
  console.log(`LLM Service (Ollama) listening on port ${port}`);
});

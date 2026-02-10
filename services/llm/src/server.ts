import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/chat/completions/stream', async (req, res) => {
  const { messages, model = 'gpt-4o-mini' } = req.body;

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('OpenAI Error:', error);
    res.status(500).json({ error: 'LLM Stream Error' });
  }
});

const server = app.listen(port, () => {
  console.log(`LLM Service listening on port ${port}`);
});

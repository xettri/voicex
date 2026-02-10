import express from 'express';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3006;

app.use(express.json());

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || ''
});
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const index = pinecone.index(process.env.PINECONE_INDEX || 'voicex-kb');

app.post('/query', async (req, res) => {
  const { query, workspaceId, topK = 3 } = req.body;

  try {
    // Generate embedding for query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });
    const vector = embeddingResponse.data[0].embedding;

    // Query Pinecone
    const searchResponse = await index.query({
      vector,
      topK,
      includeMetadata: true,
      filter: {
        workspace_id: workspaceId // Multi-tenancy isolation
      }
    });

    const matches = searchResponse.matches.map(match => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata
    }));

    res.json({ results: matches });

  } catch (error) {
    console.error('KB Retrieval Error:', error);
    res.status(500).json({ error: 'Retrieval Failed' });
  }
});

const server = app.listen(port, () => {
  console.log(`KB Retriever Service listening on port ${port}`);
});

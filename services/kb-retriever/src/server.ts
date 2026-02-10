
import express from 'express';
import { connect } from '@lancedb/lancedb';
import { pipeline } from '@xenova/transformers';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const port = process.env.PORT || 3006;

app.use(express.json());

// Initialize LanceDB and Transformers
const DB_PATH = path.join(__dirname, '../../../data/lancedb');
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

let db: any;
let table: any;
let embedder: any;

(async () => {
  try {
    db = await connect(DB_PATH);
    embedder = await pipeline('feature-extraction', EMBEDDING_MODEL);

    // Ensure table exists
    const tableNames = await db.tableNames();
    if (!tableNames.includes('knowledge_base')) {
      // Create table with dummy data to init schema
      // Schema: vector (384), text, workspace_id, metadata
      // LanceDB implicitly infers schema from first insert
      // So we wait for first insert or create empty if possible (v0.4+)
      // For now, let's create on first ingest
      console.log('Table "knowledge_base" does not exist yet. Will be created on ingestion.');
    } else {
      table = await db.openTable('knowledge_base');
    }

    console.log(`LanceDB connected at ${DB_PATH} using ${EMBEDDING_MODEL}`);
  } catch (e) {
    console.error('LanceDB Init Error', e);
  }
})();


async function generateEmbedding(text: string): Promise<number[]> {
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}


app.post('/ingest', async (req, res) => {
  const { text, workspaceId, metadata = {} } = req.body;

  try {
    const vector = await generateEmbedding(text);

    const record = {
      id: uuidv4(),
      vector,
      text,
      workspace_id: workspaceId,
      metadata: JSON.stringify(metadata)
    };

    if (!table) {
      table = await db.createTable('knowledge_base', [record]);
    } else {
      await table.add([record]);
    }

    res.json({ status: 'ok', id: record.id });
  } catch (e) {
    console.error('Ingest Error', e);
    res.status(500).json({ error: 'Ingest Failed' });
  }
});


app.post('/query', async (req, res) => {
  const { query, workspaceId, topK = 3 } = req.body;

  try {
    if (!table) {
      return res.json({ results: [] });
    }

    const vector = await generateEmbedding(query);

    // API for vector search might vary by lancedb version
    const results = await table.search(vector)
      .where(`workspace_id = '${workspaceId}'`)
      .limit(topK)
      .execute();

    res.json({ results });

  } catch (error) {
    console.error('KB Retrieval Error:', error);
    res.status(500).json({ error: 'Retrieval Failed' });
  }
});

const server = app.listen(port, () => {
  console.log(`KB Retriever Service (LanceDB+Xenova) listening on port ${port}`);
});

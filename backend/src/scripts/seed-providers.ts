/**
 * Seed the provider_registry collection.
 *
 * Strictly additive — only inserts entries that don't already exist.
 * Safe to run multiple times.
 */

import 'dotenv/config';
import { MongoClient, type Db } from 'mongodb';
import type { ProviderRegistry } from '../db/schema.js';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/voicex';

function log(msg: string) {
  console.log(`[seed-providers] ${msg}`);
}
function added(msg: string) {
  console.log(`[seed-providers]   + ${msg}`);
}
function skipped(msg: string) {
  console.log(`[seed-providers]   - ${msg}`);
}

const REGISTRY: Omit<ProviderRegistry, '_id' | 'createdAt'>[] = [
  // --- LLM ---
  {
    category: 'llm',
    providerKey: 'openai',
    displayName: 'OpenAI',
    requiresKey: true,
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    settings: [
      { key: 'apiKey', label: 'API Key', type: 'string', required: true, placeholder: 'sk-...' },
      { key: 'baseUrl', label: 'Base URL (optional)', type: 'string', required: false, placeholder: 'https://api.openai.com/v1' },
    ],
  },
  {
    category: 'llm',
    providerKey: 'groq',
    displayName: 'Groq',
    requiresKey: true,
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    settings: [
      { key: 'apiKey', label: 'API Key', type: 'string', required: true, placeholder: 'gsk_...' },
    ],
  },
  {
    category: 'llm',
    providerKey: 'ollama',
    displayName: 'Ollama (self-hosted)',
    requiresKey: false,
    models: ['llama3.2:3b', 'llama3.2:1b', 'mistral', 'phi3'],
    settings: [
      { key: 'baseUrl', label: 'Base URL', type: 'string', required: true, placeholder: 'http://localhost:11434' },
    ],
  },
  // --- TTS ---
  {
    category: 'tts',
    providerKey: 'elevenlabs',
    displayName: 'ElevenLabs',
    requiresKey: true,
    models: ['eleven_monolingual_v1', 'eleven_multilingual_v2', 'eleven_turbo_v2'],
    settings: [
      { key: 'apiKey', label: 'API Key', type: 'string', required: true, placeholder: 'xi-...' },
    ],
  },
  {
    category: 'tts',
    providerKey: 'openai',
    displayName: 'OpenAI TTS',
    requiresKey: true,
    models: ['tts-1', 'tts-1-hd'],
    settings: [
      { key: 'apiKey', label: 'API Key', type: 'string', required: true, placeholder: 'sk-...' },
    ],
  },
  {
    category: 'tts',
    providerKey: 'edge',
    displayName: 'Edge TTS (free)',
    requiresKey: false,
    models: ['edge-tts'],
    settings: [],
  },
  // --- STT ---
  {
    category: 'stt',
    providerKey: 'deepgram',
    displayName: 'Deepgram',
    requiresKey: true,
    models: ['nova-2', 'nova-2-general', 'nova-2-meeting'],
    settings: [
      { key: 'apiKey', label: 'API Key', type: 'string', required: true, placeholder: 'dg-...' },
    ],
  },
];

async function seedRegistry(db: Db) {
  log('Provider registry...');

  await db
    .collection('provider_registry')
    .createIndex({ category: 1, providerKey: 1 }, { unique: true });

  let addedCount = 0;
  let skippedCount = 0;

  for (const entry of REGISTRY) {
    const exists = await db
      .collection<ProviderRegistry>('provider_registry')
      .findOne({ category: entry.category, providerKey: entry.providerKey });

    if (exists) {
      skipped(`${entry.category}/${entry.providerKey} already exists`);
      skippedCount++;
      continue;
    }

    await db.collection<ProviderRegistry>('provider_registry').insertOne({
      ...entry,
      createdAt: new Date(),
    } as ProviderRegistry);
    added(`${entry.category}/${entry.providerKey} — ${entry.displayName}`);
    addedCount++;
  }

  log(`Registry: ${addedCount} added, ${skippedCount} skipped`);
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  VoiceX — Provider Registry Seed');
  console.log('═══════════════════════════════════════════');
  console.log(`  DB: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}`);
  console.log('');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    await seedRegistry(db);
    console.log('');
    log('Done.');
    console.log('');
  } catch (err) {
    console.error('[seed-providers] FATAL:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();

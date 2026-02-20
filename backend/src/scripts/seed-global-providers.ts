/**
 * Seed global providers (orgId: null) from environment variables.
 * Strictly additive — if a global provider with the same providerKey+category exists, it is skipped.
 * Safe to run multiple times.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import type { Provider, ProviderModel } from '../db/schema.js';
import { encrypt } from '../shared/encryption.js';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/voicex';

interface GlobalProviderDef {
  category: 'llm' | 'tts' | 'stt';
  providerKey: string;
  name: string;
  credentialKeys: Record<string, string | undefined>;
  models: ProviderModel[];
  settings?: Record<string, unknown>;
}

const PROVIDERS: GlobalProviderDef[] = [
  {
    category: 'llm',
    providerKey: 'ollama',
    name: 'Ollama (Platform)',
    credentialKeys: { baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434' },
    models: [
      { modelId: 'llama3.2:3b', label: 'Llama 3.2 3B', description: 'Fast local inference — free tier' },
    ],
    settings: {},
  },
  {
    category: 'llm',
    providerKey: 'groq',
    name: 'Groq (Platform)',
    credentialKeys: { apiKey: process.env.GROQ_API_KEY },
    models: [
      { modelId: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', description: 'Fast inference, high quality — recommended' },
    ],
  },
  {
    category: 'llm',
    providerKey: 'openai',
    name: 'OpenAI (Platform)',
    credentialKeys: { apiKey: process.env.OPENAI_API_KEY },
    models: [
      { modelId: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'OpenAI — fast, cost-effective' },
    ],
  },
  {
    category: 'tts',
    providerKey: 'edge',
    name: 'Edge TTS (Platform)',
    credentialKeys: {},
    models: [
      { modelId: 'en-US-AriaNeural', label: 'Aria', description: 'Microsoft Edge — natural female voice' },
      { modelId: 'en-US-GuyNeural', label: 'Guy', description: 'Microsoft Edge — natural male voice' },
    ],
  },
  {
    category: 'tts',
    providerKey: 'elevenlabs',
    name: 'ElevenLabs (Platform)',
    credentialKeys: { apiKey: process.env.ELEVENLABS_API_KEY },
    models: [
      { modelId: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', description: 'Natural, warm — ElevenLabs' },
      { modelId: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella', description: 'Expressive, young — ElevenLabs' },
      { modelId: 'pNInz6obpgDQGcFmaJgB', label: 'Adam', description: 'Deep, authoritative — ElevenLabs' },
    ],
  },
  {
    category: 'tts',
    providerKey: 'openai',
    name: 'OpenAI TTS (Platform)',
    credentialKeys: { apiKey: process.env.OPENAI_API_KEY },
    models: [
      { modelId: 'alloy', label: 'Alloy', description: 'OpenAI — balanced, versatile' },
      { modelId: 'echo', label: 'Echo', description: 'OpenAI — warm, confident' },
      { modelId: 'nova', label: 'Nova', description: 'OpenAI — soft, friendly' },
      { modelId: 'shimmer', label: 'Shimmer', description: 'OpenAI — bright, energetic' },
    ],
  },
  {
    category: 'stt',
    providerKey: 'deepgram',
    name: 'Deepgram (Platform)',
    credentialKeys: { apiKey: process.env.DEEPGRAM_API_KEY },
    models: [
      { modelId: 'nova-2', label: 'Nova 2', description: 'Deepgram — high-accuracy, low-latency' },
    ],
  },
];

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  VoiceX — Seed Global Providers (add-only)');
  console.log('═══════════════════════════════════════════');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    let created = 0;
    let skipped = 0;

    for (const def of PROVIDERS) {
      const exists = await db.collection<Provider>('providers').findOne({
        orgId: null,
        category: def.category,
        providerKey: def.providerKey,
      });

      if (exists) {
        console.log(`  - ${def.category}/${def.providerKey}: exists, skipped`);
        skipped++;
        continue;
      }

      const creds: Record<string, string> = {};
      for (const [k, v] of Object.entries(def.credentialKeys)) {
        if (v) creds[k] = v;
      }

      const now = new Date();
      const doc: Provider = {
        orgId: null,
        category: def.category,
        providerKey: def.providerKey,
        name: def.name,
        credentials: encrypt(JSON.stringify(creds)),
        models: def.models,
        settings: def.settings ?? {},
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      await db.collection<Provider>('providers').insertOne(doc);
      const keyCount = Object.keys(creds).length;
      console.log(`  + ${def.category}/${def.providerKey}: created (${def.models.length} models, ${keyCount} credential keys)`);
      created++;
    }

    console.log('');
    console.log(`  Done. Created: ${created}, Skipped: ${skipped}`);
    console.log('');
  } catch (err) {
    console.error('[seed-global-providers] FATAL:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();

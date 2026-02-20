/**
 * Seed script for VoiceX plans.
 * Strictly additive — if a plan with the same slug exists, it is skipped.
 * Safe to run multiple times.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import type { Plan } from '../db/schema.js';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/voicex';

const STANDARD_PLANS: Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>[] = [
  {
    slug: 'free',
    name: 'Free',
    description: 'Get started with basic voice agents. Ideal for prototyping and personal use.',
    custom: false,
    public: true,
    pricing: { monthly: 0, monthlyMaxDiscount: 0, annual: 0, annualMaxDiscount: 0 },
    limits: { maxAgents: 1, maxConcurrentCalls: 2, maxCallDurationSec: 300, maxMonthlyMinutes: 60 },
    models: {
      llm: ['ollama/llama3.2:3b'],
      tts: ['edge/en-US-AriaNeural', 'edge/en-US-GuyNeural'],
      stt: ['deepgram/nova-2'],
    },
    features: {
      customProviders: false,
      maxCustomProviders: 0,
    },
  },
  {
    slug: 'starter',
    name: 'Starter',
    description: 'For small teams shipping voice-powered products. Premium models and higher limits.',
    custom: false,
    public: true,
    pricing: { monthly: 29, monthlyMaxDiscount: 15, annual: 290, annualMaxDiscount: 20 },
    limits: { maxAgents: 5, maxConcurrentCalls: 10, maxCallDurationSec: 1800, maxMonthlyMinutes: 1000 },
    models: {
      llm: ['ollama/llama3.2:3b', 'groq/llama-3.3-70b-versatile'],
      tts: [
        'edge/en-US-AriaNeural', 'edge/en-US-GuyNeural',
        'elevenlabs/21m00Tcm4TlvDq8ikWAM', 'elevenlabs/EXAVITQu4vr4xnSDxMaL', 'elevenlabs/pNInz6obpgDQGcFmaJgB',
      ],
      stt: ['deepgram/nova-2'],
    },
    features: {
      customProviders: true,
      maxCustomProviders: 1,
    },
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'For growing businesses needing top-tier models and generous usage limits.',
    custom: false,
    public: true,
    pricing: { monthly: 99, monthlyMaxDiscount: 20, annual: 990, annualMaxDiscount: 25 },
    limits: { maxAgents: 25, maxConcurrentCalls: 50, maxCallDurationSec: 3600, maxMonthlyMinutes: 10000 },
    models: {
      llm: ['ollama/llama3.2:3b', 'groq/llama-3.3-70b-versatile', 'openai/gpt-4o-mini'],
      tts: [
        'edge/en-US-AriaNeural', 'edge/en-US-GuyNeural',
        'elevenlabs/21m00Tcm4TlvDq8ikWAM', 'elevenlabs/EXAVITQu4vr4xnSDxMaL', 'elevenlabs/pNInz6obpgDQGcFmaJgB',
        'openai/alloy', 'openai/echo', 'openai/nova', 'openai/shimmer',
      ],
      stt: ['deepgram/nova-2'],
    },
    features: {
      customProviders: true,
      maxCustomProviders: 5,
    },
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited potential. Custom SLAs, dedicated support, and every model available.',
    custom: false,
    public: true,
    pricing: { monthly: 0, monthlyMaxDiscount: 30, annual: 0, annualMaxDiscount: 30 },
    limits: { maxAgents: 999, maxConcurrentCalls: 500, maxCallDurationSec: 7200, maxMonthlyMinutes: 100000 },
    models: {
      llm: ['ollama/llama3.2:3b', 'groq/llama-3.3-70b-versatile', 'openai/gpt-4o-mini'],
      tts: [
        'edge/en-US-AriaNeural', 'edge/en-US-GuyNeural',
        'elevenlabs/21m00Tcm4TlvDq8ikWAM', 'elevenlabs/EXAVITQu4vr4xnSDxMaL', 'elevenlabs/pNInz6obpgDQGcFmaJgB',
        'openai/alloy', 'openai/echo', 'openai/nova', 'openai/shimmer',
      ],
      stt: ['deepgram/nova-2'],
    },
    features: {
      customProviders: true,
      maxCustomProviders: 999,
    },
  },
];

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  VoiceX — Seed Plans (add-only)');
  console.log('═══════════════════════════════════════════');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    await db.collection('plans').createIndex({ slug: 1 }, { unique: true });

    let created = 0;
    let skippedCount = 0;

    for (const plan of STANDARD_PLANS) {
      const exists = await db.collection('plans').findOne({ slug: plan.slug });
      if (exists) {
        // Backfill features if missing
        if (!exists.features) {
          await db.collection('plans').updateOne(
            { slug: plan.slug },
            { $set: { features: plan.features, updatedAt: new Date() } },
          );
          console.log(`  ~ ${plan.slug}: backfilled features`);
        } else {
          console.log(`  - ${plan.slug}: exists, skipped`);
        }
        skippedCount++;
        continue;
      }

      const now = new Date();
      await db.collection<Plan>('plans').insertOne({
        ...plan,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  + ${plan.slug}: created (${plan.name})`);
      created++;
    }

    console.log('');
    console.log(`  Done. Created: ${created}, Skipped: ${skippedCount}`);
    console.log('');
  } catch (err) {
    console.error('[seed-plans] FATAL:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();

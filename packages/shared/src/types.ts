export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  role: Role;
  text: string;
  timestamp?: number;
}

export interface SessionState {
  session_id: string;
  workspace_id: string;
  language: 'en' | 'hi' | 'es' | string; // extensible
  conversation_history: Message[];
  active_kb_ids: string[];
  plan: 'free' | 'pro' | 'business';
  metadata?: Record<string, any>; // Flexible metadata
}

export interface AudioChunk {
  session_id: string;
  data: Buffer | string; // Base64 or Buffer
  timestamp: number;
}

export interface TranscriptionEvent {
  session_id: string;
  text: string;
  is_final: boolean;
  confidence: number;
}

export interface LLMTokenEvent {
  session_id: string;
  token: string;
}

export interface SynthesisEvent {
  session_id: string;
  audio: Buffer | string;
}

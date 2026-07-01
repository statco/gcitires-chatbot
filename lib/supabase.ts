// lib/supabase.ts
//
// MIGRATED 2026-07 from lib/airtable.ts. Airtable's REST API was too slow
// for real-time chat lookups at the 15s Vercel function limit this
// endpoint runs under -- 262 timeouts across 101 distinct customers over
// 4 months. Postgres via Supabase should not have this problem; typical
// queries here are single-row lookups by unique key on small tables.
//
// Interface (types + exported function names/signatures) deliberately
// matches lib/airtable.ts exactly, so api/memory.ts required zero changes
// beyond the import path. `airtableId` fields were dropped (no longer
// meaningful) -- everything else is unchanged.
//
// Historical data: the previous ~19,272 Airtable customer records (and
// their conversations) are NOT automatically migrated by this file --
// see scripts/migrate-airtable-to-supabase.ts, which needs to be run once
// with real credentials. This file's tables start empty until that runs;
// new customers/conversations write here going forward regardless.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

export interface CustomerRecord {
  customer_id: string;
  email?: string;
  name?: string;
  language_preference?: 'EN' | 'FR';
  vehicle_info?: string;
  tire_preferences?: string;
  last_seen?: string;
  total_sessions?: number;
}

export interface ConversationRecord {
  session_id: string;
  customer_id: string;
  messages: string; // JSON array, same shape callers already expect
  language?: 'EN' | 'FR';
  resolved?: boolean;
  created_at?: string;
  updated_at?: string;
}

// --- Customer operations ---

export async function findCustomer(customerId: string): Promise<CustomerRecord | null> {
  const { data, error } = await supabase
    .from('chatbot_customers')
    .select('customer_id, email, name, language_preference, vehicle_info, tire_preferences, last_seen, total_sessions')
    .eq('customer_id', customerId)
    .maybeSingle();

  if (error) {
    console.warn('[supabase] findCustomer failed:', error.message);
    return null;
  }
  return data as CustomerRecord | null;
}

export async function upsertCustomer(
  data: Partial<CustomerRecord> & { customer_id: string }
): Promise<void> {
  const existing = await findCustomer(data.customer_id).catch(() => null);
  const today = new Date().toISOString().split('T')[0];

  const fields: Record<string, unknown> = {
    customer_id: data.customer_id,
    last_seen: today,
    updated_at: new Date().toISOString(),
  };
  if (data.email !== undefined) fields.email = data.email;
  if (data.name !== undefined) fields.name = data.name;
  if (data.language_preference !== undefined) fields.language_preference = data.language_preference;
  if (data.vehicle_info !== undefined) fields.vehicle_info = data.vehicle_info;
  if (data.tire_preferences !== undefined) fields.tire_preferences = data.tire_preferences;
  fields.total_sessions = existing ? (existing.total_sessions || 0) + 1 : 1;

  const { error } = await supabase.from('chatbot_customers').upsert(fields, { onConflict: 'customer_id' });
  if (error) console.warn('[supabase] upsertCustomer failed:', error.message);
}

// --- Conversation operations ---

export async function getConversation(sessionId: string): Promise<ConversationRecord | null> {
  const { data, error } = await supabase
    .from('chatbot_conversations')
    .select('session_id, customer_id, messages, language, resolved, created_at, updated_at')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.warn('[supabase] getConversation failed:', error.message);
    return null;
  }
  if (!data) return null;
  return {
    ...data,
    // messages is stored as jsonb; callers expect a JSON *string*, same as
    // the old Airtable long-text field, so re-serialize if needed.
    messages: typeof data.messages === 'string' ? data.messages : JSON.stringify(data.messages),
  } as ConversationRecord;
}

export async function saveConversation(data: ConversationRecord): Promise<void> {
  const now = new Date().toISOString();
  let parsedMessages: unknown;
  try {
    parsedMessages = JSON.parse(data.messages);
  } catch {
    parsedMessages = [];
  }

  const { error } = await supabase.from('chatbot_conversations').upsert(
    {
      session_id: data.session_id,
      customer_id: data.customer_id,
      messages: parsedMessages,
      language: data.language || 'EN',
      resolved: data.resolved || false,
      updated_at: now,
    },
    { onConflict: 'session_id' }
  );
  if (error) console.warn('[supabase] saveConversation failed:', error.message);
}

export async function getRecentSessions(customerId: string, limit = 5): Promise<ConversationRecord[]> {
  const { data, error } = await supabase
    .from('chatbot_conversations')
    .select('session_id, customer_id, messages, language, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[supabase] getRecentSessions failed:', error.message);
    return [];
  }
  return (data || []).map((r) => ({
    ...r,
    messages: typeof r.messages === 'string' ? r.messages : JSON.stringify(r.messages),
  })) as ConversationRecord[];
}

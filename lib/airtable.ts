import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID as string
);

const CUSTOMERS_TABLE = process.env.AIRTABLE_CUSTOMERS_TABLE || 'Customers';
const CONVERSATIONS_TABLE =
  process.env.AIRTABLE_CONVERSATIONS_TABLE || 'Conversations';

// Simple TTL cache to reduce Airtable API calls and handle rate limits
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function getCached<T>(key: string): T | null {
  const item = cache.get(key);
  if (item && item.expiresAt > Date.now()) {
    return item.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttlMs = CACHE_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export interface CustomerRecord {
  airtableId?: string;
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
  airtableId?: string;
  session_id: string;
  customer_id: string;
  messages: string; // JSON array
  language?: 'EN' | 'FR';
  resolved?: boolean;
  created_at?: string;
  updated_at?: string;
}

// --- Customer operations ---

export async function findCustomer(
  customerId: string
): Promise<CustomerRecord | null> {
  const cacheKey = `customer:${customerId}`;
  const cached = getCached<CustomerRecord>(cacheKey);
  if (cached) return cached;

  try {
    const records = await base(CUSTOMERS_TABLE)
      .select({
        filterByFormula: `{customer_id} = '${customerId.replace(/'/g, "\\'")}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (!records.length) return null;

    const record = records[0];
    const customer: CustomerRecord = {
      airtableId: record.id,
      customer_id: record.get('customer_id') as string,
      email: record.get('email') as string | undefined,
      name: record.get('name') as string | undefined,
      language_preference: record.get('language_preference') as
        | 'EN'
        | 'FR'
        | undefined,
      vehicle_info: record.get('vehicle_info') as string | undefined,
      tire_preferences: record.get('tire_preferences') as string | undefined,
      last_seen: record.get('last_seen') as string | undefined,
      total_sessions: record.get('total_sessions') as number | undefined,
    };

    setCache(cacheKey, customer);
    return customer;
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      console.warn('[Airtable] Rate limited on findCustomer, returning null');
      return null;
    }
    throw err;
  }
}

export async function upsertCustomer(
  data: Partial<CustomerRecord> & { customer_id: string }
): Promise<void> {
  // Invalidate cache
  cache.delete(`customer:${data.customer_id}`);

  const existing = await findCustomerDirect(data.customer_id);
  const fields: Record<string, unknown> = {};

  if (data.email !== undefined) fields.email = data.email;
  if (data.name !== undefined) fields.name = data.name;
  if (data.language_preference !== undefined)
    fields.language_preference = data.language_preference;
  if (data.vehicle_info !== undefined) fields.vehicle_info = data.vehicle_info;
  if (data.tire_preferences !== undefined)
    fields.tire_preferences = data.tire_preferences;

  const today = new Date().toISOString().split('T')[0];
  fields.last_seen = today;

  try {
    if (existing?.airtableId) {
      if (!('total_sessions' in fields)) {
        fields.total_sessions = (existing.total_sessions || 0) + 1;
      }
      await base(CUSTOMERS_TABLE).update(existing.airtableId, fields as any);
    } else {
      fields.customer_id = data.customer_id;
      fields.total_sessions = 1;
      await base(CUSTOMERS_TABLE).create([{ fields } as any]);
    }
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      console.warn('[Airtable] Rate limited on upsertCustomer — skipping write');
      return;
    }
    throw err;
  }
}

async function findCustomerDirect(
  customerId: string
): Promise<CustomerRecord | null> {
  try {
    const records = await base(CUSTOMERS_TABLE)
      .select({
        filterByFormula: `{customer_id} = '${customerId.replace(/'/g, "\\'")}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (!records.length) return null;
    return {
      airtableId: records[0].id,
      customer_id: records[0].get('customer_id') as string,
      total_sessions: records[0].get('total_sessions') as number | undefined,
    };
  } catch {
    return null;
  }
}

// --- Conversation operations ---

export async function getConversation(
  sessionId: string
): Promise<ConversationRecord | null> {
  const cacheKey = `conv:${sessionId}`;
  const cached = getCached<ConversationRecord>(cacheKey);
  if (cached) return cached;

  try {
    const records = await base(CONVERSATIONS_TABLE)
      .select({
        filterByFormula: `{session_id} = '${sessionId.replace(/'/g, "\\'")}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (!records.length) return null;

    const record = records[0];
    const conv: ConversationRecord = {
      airtableId: record.id,
      session_id: record.get('session_id') as string,
      customer_id: record.get('customer_id') as string,
      messages: record.get('messages') as string,
      language: record.get('language') as 'EN' | 'FR' | undefined,
      resolved: record.get('resolved') as boolean | undefined,
      created_at: record.get('created_at') as string | undefined,
      updated_at: record.get('updated_at') as string | undefined,
    };

    setCache(cacheKey, conv, 10_000); // shorter TTL for conversations
    return conv;
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      console.warn('[Airtable] Rate limited on getConversation');
      return null;
    }
    throw err;
  }
}

export async function saveConversation(
  data: ConversationRecord
): Promise<void> {
  // Invalidate cache
  cache.delete(`conv:${data.session_id}`);

  const now = new Date().toISOString().split('T')[0];

  try {
    const existing = await findConversationDirect(data.session_id);

    if (existing?.airtableId) {
      await base(CONVERSATIONS_TABLE).update(existing.airtableId, {
        messages: data.messages,
        language: data.language,
        resolved: data.resolved || false,
        updated_at: now,
      });
    } else {
      await base(CONVERSATIONS_TABLE).create([
        {
          fields: {
            session_id: data.session_id,
            customer_id: data.customer_id,
            messages: data.messages,
            language: data.language || 'EN',
            resolved: false,
            created_at: now,
            updated_at: now,
          },
        },
      ]);
    }
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      console.warn('[Airtable] Rate limited on saveConversation — skipping write');
      return;
    }
    throw err;
  }
}

async function findConversationDirect(
  sessionId: string
): Promise<{ airtableId: string } | null> {
  try {
    const records = await base(CONVERSATIONS_TABLE)
      .select({
        filterByFormula: `{session_id} = '${sessionId.replace(/'/g, "\\'")}'`,
        maxRecords: 1,
        fields: ['session_id'],
      })
      .firstPage();

    if (!records.length) return null;
    return { airtableId: records[0].id };
  } catch {
    return null;
  }
}

export async function getRecentSessions(
  customerId: string,
  limit = 5
): Promise<ConversationRecord[]> {
  const cacheKey = `sessions:${customerId}:${limit}`;
  const cached = getCached<ConversationRecord[]>(cacheKey);
  if (cached) return cached;

  try {
    const records = await base(CONVERSATIONS_TABLE)
      .select({
        filterByFormula: `{customer_id} = '${customerId.replace(/'/g, "\\'")}'`,
        sort: [{ field: 'created_at', direction: 'desc' }],
        maxRecords: limit,
      })
      .firstPage();

    const sessions = records.map((r) => ({
      airtableId: r.id,
      session_id: r.get('session_id') as string,
      customer_id: r.get('customer_id') as string,
      messages: r.get('messages') as string,
      language: r.get('language') as 'EN' | 'FR' | undefined,
      created_at: r.get('created_at') as string | undefined,
    }));

    setCache(cacheKey, sessions);
    return sessions;
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      console.warn('[Airtable] Rate limited on getRecentSessions');
      return [];
    }
    throw err;
  }
}

function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as { statusCode?: number; error?: string; message?: string };
    return (
      e.statusCode === 429 ||
      e.error === 'TOO_MANY_REQUESTS' ||
      (typeof e.message === 'string' &&
        e.message.toLowerCase().includes('rate limit'))
    );
  }
  return false;
}

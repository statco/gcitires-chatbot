// scripts/migrate-airtable-to-supabase.ts
//
// ONE-TIME migration of historical chatbot memory data from Airtable to
// Supabase. Run this once, after lib/supabase.ts is deployed and the
// chatbot_customers/chatbot_conversations tables exist, to bring over the
// ~19,272 existing customer records (and their conversations) rather than
// starting the new system with empty history.
//
// This was written but NOT run as part of the 2026-07 migration PR --
// the Airtable MCP tool available in that session could only fetch the
// first 1,000 of 19,272 customer records (no pagination exposed), and
// didn't have the raw Airtable API key needed to call Airtable's real
// REST API directly. This script uses that real REST API (with correct
// offset-based pagination) instead, so it needs to be run somewhere with
// the actual credentials -- your machine, a one-off script runner, etc.
//
// SAFE TO RE-RUN: every write is an upsert keyed on customer_id /
// session_id, so running this twice (e.g. after it's interrupted) won't
// create duplicates.
//
// Usage:
//   AIRTABLE_API_KEY=... AIRTABLE_BASE_ID=... \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npx tsx scripts/migrate-airtable-to-supabase.ts
//
// (or compile with tsc first and run with node -- tsx is just the
// quickest way to run a standalone .ts file without a build step)

import { createClient } from '@supabase/supabase-js';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CUSTOMERS_TABLE = process.env.AIRTABLE_CUSTOMERS_TABLE || 'Customers';
const CONVERSATIONS_TABLE = process.env.AIRTABLE_CONVERSATIONS_TABLE || 'Conversations';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. See the usage comment at the top of this file.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
}

async function fetchAllRecords(tableName: string): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;
  let page = 0;

  do {
    page++;
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    if (!res.ok) {
      throw new Error(`Airtable fetch failed (${tableName}, page ${page}): ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset;
    console.log(`  [${tableName}] page ${page}: ${data.records?.length ?? 0} records (total so far: ${all.length})`);

    // Airtable rate limit is 5 req/sec per base -- stay well under it.
    await new Promise((r) => setTimeout(r, 250));
  } while (offset);

  return all;
}

function buildCustomerRow(r: AirtableRecord, customerId: string) {
  return {
    customer_id: customerId,
    email: r.fields.email || null,
    name: r.fields.name || null,
    language_preference: r.fields.language_preference?.name || r.fields.language_preference || null,
    vehicle_info: r.fields.vehicle_info || null,
    tire_preferences: r.fields.tire_preferences || null,
    last_seen: r.fields.last_seen || null,
    total_sessions: r.fields.total_sessions ?? 0,
  };
}

async function migrateCustomers(): Promise<Map<string, boolean>> {
  console.log(`\nFetching all records from "${CUSTOMERS_TABLE}"...`);
  const records = await fetchAllRecords(CUSTOMERS_TABLE);
  console.log(`Fetched ${records.length} customer records. Upserting into Supabase...`);

  const seenCustomerIds = new Map<string, boolean>();
  const BATCH_SIZE = 500;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const rowsByCustomerId = new Map<string, ReturnType<typeof buildCustomerRow>>();

    for (const r of batch) {
      const customerId = r.fields.customer_id;
      if (!customerId) continue; // skip malformed records rather than fail the whole batch
      seenCustomerIds.set(customerId, true);
      // Postgres upsert can't affect the same conflict-target row twice in
      // one statement -- if Airtable has duplicate customer_id records
      // (confirmed: it does, at least one batch's worth), last one in the
      // batch wins here rather than the whole 500-row batch failing.
      rowsByCustomerId.set(customerId, buildCustomerRow(r, customerId));
    }
    const rows = Array.from(rowsByCustomerId.values());

    const { error } = await supabase.from('chatbot_customers').upsert(rows, { onConflict: 'customer_id' });
    if (error) {
      console.error(`  Batch ${i}-${i + batch.length} FAILED:`, error.message);
    } else {
      console.log(`  Batch ${i}-${i + batch.length}: OK (${rows.length} rows)`);
    }
  }

  console.log(`Done. ${seenCustomerIds.size} unique customer_ids migrated.`);
  return seenCustomerIds;
}

function buildConversationRow(r: AirtableRecord, sessionId: string, customerId: string | undefined) {
  let messages: unknown = [];
  try {
    messages = typeof r.fields.messages === 'string' ? JSON.parse(r.fields.messages) : (r.fields.messages || []);
  } catch {
    messages = [];
  }
  return {
    session_id: sessionId,
    customer_id: customerId || null,
    messages,
    language: r.fields.language?.name || r.fields.language || null,
    resolved: !!r.fields.resolved,
    created_at: r.fields.created_at || null,
    updated_at: r.fields.updated_at || null,
  };
}

async function migrateConversations(validCustomerIds: Map<string, boolean>): Promise<void> {
  console.log(`\nFetching all records from "${CONVERSATIONS_TABLE}"...`);
  const records = await fetchAllRecords(CONVERSATIONS_TABLE);
  console.log(`Fetched ${records.length} conversation records. Upserting into Supabase...`);

  const BATCH_SIZE = 500;
  let skippedOrphans = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const rowsBySessionId = new Map<string, ReturnType<typeof buildConversationRow>>();

    for (const r of batch) {
      const sessionId = r.fields.session_id;
      const customerId = r.fields.customer_id;
      if (!sessionId) continue;
      // FK constraint: chatbot_conversations.customer_id references
      // chatbot_customers.customer_id. If a conversation references a
      // customer that wasn't migrated (shouldn't happen, but data can be
      // messy), skip it rather than fail the whole batch.
      if (customerId && !validCustomerIds.has(customerId)) {
        skippedOrphans++;
        continue;
      }
      // Same duplicate-key issue as migrateCustomers() -- last one in the
      // batch wins rather than the whole batch failing.
      rowsBySessionId.set(sessionId, buildConversationRow(r, sessionId, customerId));
    }
    const rows = Array.from(rowsBySessionId.values());

    const { error } = await supabase.from('chatbot_conversations').upsert(rows, { onConflict: 'session_id' });
    if (error) {
      console.error(`  Batch ${i}-${i + batch.length} FAILED:`, error.message);
    } else {
      console.log(`  Batch ${i}-${i + batch.length}: OK (${rows.length} rows)`);
    }
  }

  console.log(`Done. ${skippedOrphans} conversations skipped (referenced a customer_id not found in Customers table).`);
}

async function main() {
  console.log('=== Airtable -> Supabase chatbot memory migration ===');
  const customerIds = await migrateCustomers();
  await migrateConversations(customerIds);
  console.log('\n=== Migration complete ===');
  console.log('Spot-check a few records in Supabase (chatbot_customers / chatbot_conversations)');
  console.log('before considering this done. This script is safe to re-run if anything looks off.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

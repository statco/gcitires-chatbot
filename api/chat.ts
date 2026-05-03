import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { streamChat } from '../lib/anthropic';
import { TIREBOT_TOOLS, buildSystemPrompt, type Language } from '../lib/prompts';
import { lookupOrder, searchCatalog } from '../lib/shopify';
import {
  findCustomer,
  upsertCustomer,
  getRecentSessions,
  saveConversation,
} from '../lib/airtable';

export const config = {
  maxDuration: 30,
};

const ALLOWED_ORIGINS = (
  process.env.WIDGET_ALLOWED_ORIGINS || 'https://gcitires.com'
)
  .split(',')
  .map((o) => o.trim());

function setCorsHeaders(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin || '';
  const allowed =
    ALLOWED_ORIGINS.includes(origin) ||
    process.env.VERCEL_ENV === 'development' ||
    origin.includes('localhost') ||
    origin.includes('vercel.app');

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Customer-ID, X-Session-ID');
  res.setHeader('Access-Control-Max-Age', '86400');

  return allowed || process.env.VERCEL_ENV === 'development';
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const isAllowed = setCorsHeaders(req, res);
  if (!isAllowed) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const body = req.body as {
    messages?: MessageParam[];
    customerId?: string;
    sessionId?: string;
    language?: Language;
  };

  const { messages = [], customerId, sessionId, language = 'EN' } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Set SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  function sendEvent(data: Record<string, unknown>): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  try {
    // Load customer context from Airtable
    let customerContext = {
      name: undefined as string | undefined,
      vehicleInfo: undefined as string | undefined,
      tirePreferences: undefined as string | undefined,
      languagePreference: language,
      recentSessionsSummary: undefined as string | undefined,
    };

    if (customerId) {
      try {
        const [customer, recentSessions] = await Promise.all([
          findCustomer(customerId),
          getRecentSessions(customerId, 3),
        ]);

        if (customer) {
          customerContext.name = customer.name;
          customerContext.vehicleInfo = customer.vehicle_info;
          customerContext.tirePreferences = customer.tire_preferences;
          if (customer.language_preference) {
            customerContext.languagePreference = customer.language_preference;
          }
        }

        if (recentSessions.length > 0) {
          // Summarize recent sessions (last 3 messages from each)
          const summaryParts = recentSessions.map((s) => {
            try {
              const msgs = JSON.parse(s.messages) as Array<{
                role: string;
                content: string;
              }>;
              const snippet = msgs
                .slice(-2)
                .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
                .join(' | ');
              return `[${s.created_at || 'past'}] ${snippet}`;
            } catch {
              return null;
            }
          });
          customerContext.recentSessionsSummary = summaryParts
            .filter(Boolean)
            .join('\n');
        }
      } catch (err) {
        console.warn('[chat] Failed to load customer context:', err);
      }
    }

    const currentDate = new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const effectiveLang = (customerContext.languagePreference || language) as Language;
    const systemPrompt = buildSystemPrompt(
      effectiveLang,
      customerContext,
      currentDate
    );

    // Define tool executor
    async function executeTool(
      name: string,
      input: Record<string, unknown>
    ): Promise<unknown> {
      switch (name) {
        case 'lookup_order': {
          const { order_number, email } = input as {
            order_number: string;
            email: string;
          };
          return lookupOrder(order_number, email);
        }

        case 'search_catalog': {
          return searchCatalog({
            tire_size: input.tire_size as string | undefined,
            vehicle: input.vehicle as string | undefined,
            season: input.season as string | undefined,
            limit: (input.limit as number | undefined) || 5,
          });
        }

        case 'update_customer_memory': {
          if (!customerId) return { success: false, reason: 'No customer ID' };
          const updates = input.updates as Record<string, string>;
          await upsertCustomer({
            customer_id: customerId,
            vehicle_info: updates.vehicle_info,
            tire_preferences: updates.tire_preferences,
            language_preference: updates.language_preference as
              | 'EN'
              | 'FR'
              | undefined,
          });
          return { success: true };
        }

        case 'get_customer_history': {
          const cid = (input.customer_id as string) || customerId;
          if (!cid) return { sessions: [], summary: 'No customer ID provided' };

          const sessions = await getRecentSessions(cid, 5);
          const summaries = sessions.map((s) => {
            try {
              const msgs = JSON.parse(s.messages) as Array<{
                role: string;
                content: string;
              }>;
              return {
                date: s.created_at,
                language: s.language,
                messageCount: msgs.length,
                preview: msgs
                  .slice(-1)
                  .map((m) => m.content.slice(0, 150))
                  .join(''),
              };
            } catch {
              return { date: s.created_at, messageCount: 0, preview: '' };
            }
          });
          return { sessions: summaries, count: summaries.length };
        }

        default:
          return { error: `Unknown tool: ${name}` };
      }
    }

    // ── Link fixup: accumulated post-processing ──────────────────────────────
    // Claude consistently wraps product links in __bold__ causing malformed hrefs
    // and 404s. We accumulate the full response, strip the __wrapper__, then re-emit
    // the corrected text so the widget never sees a broken link.
    function fixMarkdownLinks(text: string): string {
      // Pattern 1: [text](__[display](real_url))__  →  [text](real_url)
      let out = text.replace(/\[([^\]]+)\]\(__\[[^\]]*\]\(([^)]+)\)\)__/g, '[$1]($2)');
      // Pattern 2: __[text](url)__  →  [text](url)
      out = out.replace(/__\[([^\]]+)\]\(([^)]+)\)__/g, '[$1]($2)');
      // Pattern 3: **[text](url)**  →  [text](url)
      out = out.replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, '[$1]($2)');
      return out;
    }

    // Tool events still stream in real-time (user sees "Searching…" immediately).
    // Text is accumulated then emitted fixed — adds ~0ms since we re-stream instantly.
    let accumulatedText = '';

    await streamChat({
      messages,
      systemPrompt,
      tools: TIREBOT_TOOLS as Parameters<typeof streamChat>[0]['tools'],
      onText(text) {
        accumulatedText += text;              // accumulate — do NOT send yet
      },
      onToolStart(toolName) {
        sendEvent({ type: 'tool_start', tool: toolName });
      },
      onToolResult(toolName, result) {
        sendEvent({ type: 'tool_result', tool: toolName, result });
      },
      executeTool,
    });

    // Fix links then emit the full corrected text as one chunk
    const correctedText = fixMarkdownLinks(accumulatedText);
    if (correctedText) {
      sendEvent({ type: 'text', content: correctedText });
    }

    sendEvent({ type: 'done' });

    // Async: persist conversation (fire-and-forget, don't await)
    if (sessionId && customerId && messages.length > 0) {
      saveConversation({
        session_id: sessionId,
        customer_id: customerId,
        messages: JSON.stringify(
          messages.map((m) => ({
            role: m.role,
            content:
              typeof m.content === 'string'
                ? m.content
                : JSON.stringify(m.content),
            timestamp: Date.now(),
          }))
        ),
        language: effectiveLang,
      }).catch((err) => console.warn('[chat] Failed to save conversation:', err));
    }
  } catch (err) {
    console.error('[chat] Handler error:', err);
    sendEvent({
      type: 'error',
      message: 'An unexpected error occurred. Please try again.',
    });
  } finally {
    res.end();
  }
}

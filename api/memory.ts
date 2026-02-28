import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  findCustomer,
  upsertCustomer,
  getConversation,
  saveConversation,
  getRecentSessions,
} from '../lib/airtable';

export const config = {
  maxDuration: 15,
};

const ALLOWED_ORIGINS = (
  process.env.WIDGET_ALLOWED_ORIGINS || 'https://gcitires.com'
)
  .split(',')
  .map((o) => o.trim());

function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin || '';
  const allowed =
    ALLOWED_ORIGINS.includes(origin) ||
    process.env.VERCEL_ENV === 'development' ||
    origin.includes('localhost') ||
    origin.includes('vercel.app');

  res.setHeader(
    'Access-Control-Allow-Origin',
    allowed ? origin || '*' : ALLOWED_ORIGINS[0]
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Customer-ID, X-Session-ID'
  );
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.status(200).end();
    return;
  }

  setCorsHeaders(req, res);
  res.setHeader('Content-Type', 'application/json');

  const action = req.query.action as string;

  // GET /api/memory?action=customer&customerId=xxx
  if (req.method === 'GET') {
    const customerId = req.query.customerId as string;

    if (!customerId) {
      res.status(400).json({ error: 'customerId is required' });
      return;
    }

    if (action === 'customer') {
      const customer = await findCustomer(customerId).catch(() => null);
      res.status(200).json({ customer });
      return;
    }

    if (action === 'sessions') {
      const limit = parseInt(req.query.limit as string) || 5;
      const sessions = await getRecentSessions(customerId, limit).catch(
        () => []
      );
      res.status(200).json({ sessions });
      return;
    }

    if (action === 'conversation') {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      const conversation = await getConversation(sessionId).catch(() => null);
      res.status(200).json({ conversation });
      return;
    }

    res.status(400).json({ error: 'Invalid action. Use: customer, sessions, conversation' });
    return;
  }

  // POST /api/memory
  if (req.method === 'POST') {
    const body = req.body as {
      action?: string;
      customerId?: string;
      sessionId?: string;
      data?: Record<string, unknown>;
    };

    const { action: postAction, customerId, sessionId, data } = body;

    if (postAction === 'upsert_customer') {
      if (!customerId) {
        res.status(400).json({ error: 'customerId is required' });
        return;
      }

      await upsertCustomer({
        customer_id: customerId,
        email: data?.email as string | undefined,
        name: data?.name as string | undefined,
        language_preference: data?.language_preference as
          | 'EN'
          | 'FR'
          | undefined,
        vehicle_info: data?.vehicle_info as string | undefined,
        tire_preferences: data?.tire_preferences as string | undefined,
      }).catch((err) => {
        console.warn('[memory] upsert_customer failed:', err);
      });

      res.status(200).json({ success: true });
      return;
    }

    if (postAction === 'save_conversation') {
      if (!sessionId || !customerId) {
        res
          .status(400)
          .json({ error: 'sessionId and customerId are required' });
        return;
      }

      await saveConversation({
        session_id: sessionId,
        customer_id: customerId,
        messages: (data?.messages as string) || '[]',
        language: data?.language as 'EN' | 'FR' | undefined,
        resolved: data?.resolved as boolean | undefined,
      }).catch((err) => {
        console.warn('[memory] save_conversation failed:', err);
      });

      res.status(200).json({ success: true });
      return;
    }

    res.status(400).json({
      error:
        'Invalid action. Use: upsert_customer, save_conversation',
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

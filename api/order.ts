import type { VercelRequest, VercelResponse } from '@vercel/node';
import { lookupOrder } from '../lib/shopify';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  setCorsHeaders(req, res);

  const { order_number, email } = req.body as {
    order_number?: string;
    email?: string;
  };

  if (!order_number || !email) {
    res
      .status(400)
      .json({ error: 'order_number and email are required' });
    return;
  }

  try {
    const result = await lookupOrder(order_number, email);
    res.status(200).json(result);
  } catch (err) {
    console.error('[order] Error:', err);
    res.status(500).json({
      found: false,
      error: 'Unable to look up order. Please try again.',
    });
  }
}

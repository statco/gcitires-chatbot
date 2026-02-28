import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 10,
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

/**
 * Lightweight French language detector.
 * Uses franc-min (ESM) via dynamic import with a heuristic fallback.
 */
async function detectLanguage(text: string): Promise<'EN' | 'FR'> {
  // Try franc-min first (ESM, dynamically imported)
  try {
    // Dynamic import to handle ESM-only package in CJS context
    const francModule = await (Function('return import("franc-min")')() as Promise<{
      franc: (text: string, options?: { minLength?: number }) => string;
    }>);
    const langCode = francModule.franc(text, { minLength: 5 });
    // franc returns ISO 639-3 codes: 'fra' for French, 'eng' for English
    if (langCode === 'fra') return 'FR';
    if (langCode === 'eng') return 'EN';
    // Fallthrough to heuristic if undetermined
  } catch {
    // franc-min not available — use heuristic
  }

  return detectLanguageHeuristic(text);
}

/**
 * Simple heuristic French detector — works offline, zero dependencies.
 * Checks for common French function words and accented characters.
 */
function detectLanguageHeuristic(text: string): 'EN' | 'FR' {
  const lower = text.toLowerCase();

  // High-confidence French indicators
  const strongFrench = [
    /\bje (veux|voudrais|cherche|besoin|suis|peux|dois)\b/,
    /\bbonjour\b/,
    /\bs'il vous plaît\b/,
    /\bmerci\b/,
    /\bpneus?\b/,
    /\bvoiture\b/,
    /\bcommande\b/,
    /\blivraison\b/,
    /\bparlez-vous\b/,
    /\bfrançais\b/,
    /\bparlons\b/,
    /\bpouvez-vous\b/,
    /[àâäéèêëîïôùûüçœæ]/,
  ];

  // Common French function words (2+ hits = likely French)
  const frenchWords = [
    /\b(le|la|les)\b/,
    /\b(de|du|des)\b/,
    /\b(un|une)\b/,
    /\b(je|tu|il|elle|nous|vous|ils|elles)\b/,
    /\b(est|sont|être|avoir)\b/,
    /\b(pour|dans|avec|sur|par)\b/,
    /\b(mais|donc|ou|et|ni|car)\b/,
    /\b(que|qui|quoi|dont|où)\b/,
    /\b(mon|ma|mes|ton|ta|tes)\b/,
  ];

  // Any strong indicator → French
  for (const pattern of strongFrench) {
    if (pattern.test(lower)) return 'FR';
  }

  // Count common French function words
  const frScore = frenchWords.filter((p) => p.test(lower)).length;
  if (frScore >= 3) return 'FR';

  return 'EN';
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

  const { text } = req.body as { text?: string };

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  try {
    const language = await detectLanguage(text.slice(0, 500)); // cap input length
    res.status(200).json({ language, confidence: 'heuristic' });
  } catch (err) {
    console.error('[detect-language] Error:', err);
    res.status(200).json({ language: 'EN', confidence: 'fallback' });
  }
}

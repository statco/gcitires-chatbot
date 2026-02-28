import type { ChatMessage, Language } from '../types';

export interface ApiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamEvent {
  type: 'text' | 'tool_start' | 'tool_result' | 'done' | 'error';
  content?: string;
  tool?: string;
  result?: unknown;
  message?: string;
}

/**
 * Send a chat message and stream the response via Server-Sent Events.
 * Calls onChunk for each streamed text piece, onDone when complete.
 */
export async function streamChatMessage(params: {
  apiEndpoint: string;
  messages: ChatMessage[];
  customerId: string;
  sessionId: string;
  language: Language;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const {
    apiEndpoint,
    messages,
    customerId,
    sessionId,
    language,
    onChunk,
    onDone,
    onError,
    signal,
  } = params;

  // Convert widget messages to API format
  const apiMessages: ApiChatMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response: Response;

  try {
    response = await fetch(`${apiEndpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiMessages,
        customerId,
        sessionId,
        language,
      }),
      signal,
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return;
    onError('Unable to connect to TireBot. Please check your connection.');
    return;
  }

  if (!response.ok) {
    onError(`Server error (${response.status}). Please try again.`);
    return;
  }

  if (!response.body) {
    onError('Streaming not supported by this browser.');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by double newlines
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? ''; // last item may be incomplete

      for (const block of lines) {
        const dataLine = block
          .split('\n')
          .find((l) => l.startsWith('data: '));

        if (!dataLine) continue;

        const jsonStr = dataLine.slice(6).trim();
        if (!jsonStr) continue;

        let event: StreamEvent;
        try {
          event = JSON.parse(jsonStr) as StreamEvent;
        } catch {
          continue; // malformed event — skip
        }

        if (event.type === 'text' && event.content) {
          onChunk(event.content);
        } else if (event.type === 'error') {
          onError(event.message || 'An error occurred.');
          return;
        } else if (event.type === 'done') {
          onDone();
          return;
        }
        // tool_start / tool_result events are informational — no UI update needed
      }
    }

    // Stream ended without explicit 'done' event
    onDone();
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return;
    console.error('[api] Stream read error:', err);
    onError('Connection interrupted. Please try again.');
  }
}

/**
 * Detect the language of a text string via the backend API.
 * Falls back to client-side heuristic if API is unavailable.
 */
export async function detectLanguageRemote(
  apiEndpoint: string,
  text: string
): Promise<Language> {
  try {
    const res = await fetch(`${apiEndpoint}/api/detect-language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (!res.ok) return 'EN';
    const data = (await res.json()) as { language: Language };
    return data.language || 'EN';
  } catch {
    return 'EN';
  }
}

/**
 * Notify the backend about a new/returning customer session.
 */
export async function syncCustomerSession(params: {
  apiEndpoint: string;
  customerId: string;
  email?: string;
  name?: string;
  language: Language;
}): Promise<void> {
  const { apiEndpoint, customerId, email, name, language } = params;

  try {
    await fetch(`${apiEndpoint}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_customer',
        customerId,
        data: { email, name, language_preference: language },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-critical — silently fail
  }
}

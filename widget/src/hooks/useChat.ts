import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, Language, CustomerInfo } from '../types';
import type { WidgetConfig } from '../types';
import { streamChatMessage, syncCustomerSession } from '../lib/api';
import { DEFAULT_QUICK_REPLIES, I18N } from '../types';

const SESSION_STORAGE_KEY = 'gci-chat-messages';
const SESSION_ID_KEY = 'gci-session-id';

function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sess_${ts}_${rand}`;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function loadSessionMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function saveSessionMessages(messages: ChatMessage[]): void {
  try {
    // Keep last 50 messages to stay within sessionStorage limits
    const toSave = messages.slice(-50);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore quota errors
  }
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const newId = generateSessionId();
    sessionStorage.setItem(SESSION_ID_KEY, newId);
    return newId;
  } catch {
    return generateSessionId();
  }
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isOffline: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  sessionId: string;
}

export function useChat(
  config: WidgetConfig,
  customer: CustomerInfo,
  language: Language,
  onLanguageDetected?: (lang: Language) => void
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadSessionMessages();
    if (saved.length > 0) return saved;

    // Show welcome message on first load
    const welcomeMsg: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: language === 'FR' ? I18N.FR.welcomeFR : I18N.EN.welcomeEN,
      timestamp: Date.now(),
      quickReplies: DEFAULT_QUICK_REPLIES[language],
    };
    return [welcomeMsg];
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const sessionId = useRef(getOrCreateSessionId()).current;
  const abortRef = useRef<AbortController | null>(null);

  // Persist messages to sessionStorage on every change
  useEffect(() => {
    saveSessionMessages(messages);
  }, [messages]);

  // Sync customer session to Airtable on mount
  useEffect(() => {
    syncCustomerSession({
      apiEndpoint: config.apiEndpoint,
      customerId: customer.id,
      email: customer.email || undefined,
      name: customer.name || undefined,
      language,
    }).catch(() => {}); // non-critical
  }, [config.apiEndpoint, customer.id, customer.email, customer.name, language]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      // Detect language from user's first substantive message
      if (messages.filter((m) => m.role === 'user').length === 0 && onLanguageDetected) {
        const { detectLanguageLocal } = await import('./useLanguage').then(
          (m) => ({ detectLanguageLocal: m['useLanguage'] })
        ).catch(() => ({ detectLanguageLocal: null }));
        void detectLanguageLocal; // unused import guard
        // Simple inline detection for first message
        const lower = text.toLowerCase();
        const frPatterns = [/\bbonjour\b/, /\bpneus?\b/, /[àâäéèêëîïôùûüç]/, /\bje\b/, /\bmerci\b/];
        if (frPatterns.some((p) => p.test(lower))) {
          onLanguageDetected('FR');
        }
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      // Add placeholder assistant message (streaming target)
      const assistantId = generateMessageId();
      const assistantPlaceholder: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsLoading(true);
      setIsOffline(false);

      // Build messages array for API (exclude the empty streaming placeholder)
      const historyForApi: ChatMessage[] = [...messages, userMessage];

      let hasReceivedContent = false;

      try {
        await streamChatMessage({
          apiEndpoint: config.apiEndpoint,
          messages: historyForApi,
          customerId: customer.id,
          sessionId,
          language,
          signal: abortController.signal,

          onChunk(chunk) {
            hasReceivedContent = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk }
                  : m
              )
            );
          },

          onDone() {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      isStreaming: false,
                      quickReplies: hasReceivedContent
                        ? getContextualReplies(m.content, language)
                        : undefined,
                    }
                  : m
              )
            );
            setIsLoading(false);
          },

          onError(errorMsg) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: errorMsg || I18N[language].errorMessage,
                      isStreaming: false,
                    }
                  : m
              )
            );
            setIsLoading(false);
            if (errorMsg.includes('connect') || errorMsg.includes('network')) {
              setIsOffline(true);
            }
          },
        });
      } catch {
        setIsLoading(false);
      }
    },
    [config.apiEndpoint, customer.id, isLoading, language, messages, onLanguageDetected, sessionId]
  );

  const clearMessages = useCallback(() => {
    const welcome: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: language === 'FR' ? I18N.FR.welcomeFR : I18N.EN.welcomeEN,
      timestamp: Date.now(),
      quickReplies: DEFAULT_QUICK_REPLIES[language],
    };
    setMessages([welcome]);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [language]);

  return { messages, isLoading, isOffline, sendMessage, clearMessages, sessionId };
}

/**
 * Generate contextually appropriate quick reply chips based on the assistant's response.
 */
function getContextualReplies(content: string, language: Language): string[] | undefined {
  const lower = content.toLowerCase();

  if (language === 'FR') {
    if (lower.includes('pneu') || lower.includes('taille')) {
      return ['Trouver des pneus d\'hiver', 'Quelle taille pour mon véhicule?', 'Voir les prix'];
    }
    if (lower.includes('commande') || lower.includes('livraison')) {
      return ['Suivre ma commande', 'Changer mon adresse', 'Contacter le support'];
    }
    return ['Autre question', 'Trouver des pneus', 'Suivre ma commande'];
  }

  if (lower.includes('tire') || lower.includes('size') || lower.includes('wheel')) {
    return ['Find winter tires', 'What size for my car?', 'See prices'];
  }
  if (lower.includes('order') || lower.includes('ship') || lower.includes('track')) {
    return ['Track my order', 'Change my address', 'Contact support'];
  }
  return ['Another question', 'Find tires', 'Track my order'];
}

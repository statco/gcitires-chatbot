export type Language = 'EN' | 'FR';

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  quickReplies?: string[];
  isStreaming?: boolean;
}

export interface CustomerInfo {
  id: string;
  email: string;
  name: string;
  isLoggedIn: boolean;
}

export interface WidgetConfig {
  apiEndpoint: string;
  storeDomain: string;
}

export interface I18nStrings {
  title: string;
  placeholder: string;
  send: string;
  typing: string;
  offline: string;
  offlineRetry: string;
  toggleLang: string;
  minimize: string;
  errorMessage: string;
  welcomeEN: string;
  welcomeFR: string;
}

export const I18N: Record<Language, I18nStrings> = {
  EN: {
    title: 'TireBot',
    placeholder: 'Ask about tires, orders, or your vehicle...',
    send: 'Send',
    typing: 'TireBot is typing...',
    offline:
      'TireBot is temporarily unavailable. Please visit gcitires.com or call us directly.',
    offlineRetry: 'Try again',
    toggleLang: 'FR',
    minimize: 'Minimize',
    errorMessage:
      'Sorry, something went wrong. Please try again in a moment.',
    welcomeEN:
      "Hi! I'm TireBot 🤖, your GCI Tires assistant. I can help you find the right tires, track your order, or answer any questions. How can I help you today?",
    welcomeFR:
      "Bonjour! Je suis TireBot 🤖, votre assistant GCI Pneus. Je peux vous aider à trouver les bons pneus, suivre votre commande ou répondre à vos questions. Comment puis-je vous aider?",
  },
  FR: {
    title: 'TireBot',
    placeholder: 'Posez une question sur les pneus, commandes ou votre véhicule...',
    send: 'Envoyer',
    typing: 'TireBot est en train d\'écrire...',
    offline:
      'TireBot est temporairement indisponible. Visitez gcitires.com ou appelez-nous directement.',
    offlineRetry: 'Réessayer',
    toggleLang: 'EN',
    minimize: 'Réduire',
    errorMessage:
      'Désolé, une erreur s\'est produite. Veuillez réessayer dans un moment.',
    welcomeEN:
      "Hi! I'm TireBot 🤖, your GCI Tires assistant. I can help you find the right tires, track your order, or answer any questions. How can I help you today?",
    welcomeFR:
      "Bonjour! Je suis TireBot 🤖, votre assistant GCI Pneus. Je peux vous aider à trouver les bons pneus, suivre votre commande ou répondre à vos questions. Comment puis-je vous aider?",
  },
};

export const DEFAULT_QUICK_REPLIES: Record<Language, string[]> = {
  EN: ['Track my order', 'Find tires for my car', 'Parler en français', 'Winter tire info'],
  FR: ['Suivre ma commande', 'Trouver des pneus', 'Speak English', 'Info pneus hiver'],
};

// Declared by Shopify's theme.liquid injection
declare global {
  interface Window {
    GCICustomer?: CustomerInfo;
    GCITiresWidget?: {
      init: (config: WidgetConfig) => void;
    };
  }
}

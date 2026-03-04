import { useState, useCallback } from 'react';
import type { Language } from '../types';

/**
 * Simple client-side French language detector.
 * No external dependencies — keeps the widget bundle small.
 */
export function detectLanguageLocal(text: string): Language {
  const lower = text.toLowerCase();

  // Strong French indicators
  const strongFrench = [
    /\bbonjour\b/,
    /\bs'il vous plaît\b/,
    /\bmerci\b/,
    /\bpneus?\b/,
    /\bvoiture\b/,
    /\bcommande\b/,
    /\blivraison\b/,
    /\bfrançais\b/,
    /\bparlons\b/,
    /[àâäéèêëîïôùûüçœæ]/,
    /\bje (veux|voudrais|cherche|suis|peux)\b/,
  ];

  // Common French function words (3+ matches = likely French)
  const frenchWords = [
    /\b(le|la|les)\b/,
    /\b(de|du|des)\b/,
    /\b(un|une)\b/,
    /\b(je|tu|il|elle|nous|vous)\b/,
    /\b(est|sont|avoir|être)\b/,
    /\b(pour|dans|avec|sur|par)\b/,
    /\b(mais|donc|ou|et|car)\b/,
    /\b(que|qui|quoi|dont|où)\b/,
    /\b(mon|ma|mes|ton|ta|tes)\b/,
  ];

  for (const pattern of strongFrench) {
    if (pattern.test(lower)) return 'FR';
  }

  const frScore = frenchWords.filter((p) => p.test(lower)).length;
  return frScore >= 3 ? 'FR' : 'EN';
}

interface UseLanguageReturn {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  detectFromText: (text: string) => Language;
}

export function useLanguage(initialLanguage: Language = 'EN'): UseLanguageReturn {
  const [language, setLanguageState] = useState<Language>(() => {
    // Check if customer has a stored preference
    try {
      const stored = localStorage.getItem('gci-lang');
      if (stored === 'EN' || stored === 'FR') return stored;
    } catch {
      // ignore
    }
    return initialLanguage;
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('gci-lang', lang);
    } catch {
      // ignore
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'EN' ? 'FR' : 'EN');
  }, [language, setLanguage]);

  const detectFromText = useCallback((text: string): Language => {
    if (!text || text.trim().length < 5) return language;
    return detectLanguageLocal(text);
  }, [language]);

  return { language, setLanguage, toggleLanguage, detectFromText };
}

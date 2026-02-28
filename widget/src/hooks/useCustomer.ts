import { useMemo } from 'react';
import type { CustomerInfo } from '../types';

/**
 * Reads the GCI customer context injected by Shopify's theme.liquid.
 * For guests, generates/reads a persistent UUID from localStorage.
 */
export function useCustomer(): CustomerInfo {
  return useMemo(() => {
    // Try Shopify's injected customer object first
    const shopifyCustomer = window.GCICustomer;

    if (shopifyCustomer?.isLoggedIn && shopifyCustomer.id) {
      return {
        id: `shopify_${shopifyCustomer.id}`,
        email: shopifyCustomer.email || '',
        name: shopifyCustomer.name || '',
        isLoggedIn: true,
      };
    }

    // Guest: use localStorage UUID
    const guestId = getOrCreateGuestId();
    return {
      id: guestId,
      email: shopifyCustomer?.email || '',
      name: shopifyCustomer?.name || '',
      isLoggedIn: false,
    };
  }, []);
}

function getOrCreateGuestId(): string {
  const STORAGE_KEY = 'gci-guest-id';

  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const newId = `guest_${generateUUID()}`;
    localStorage.setItem(STORAGE_KEY, newId);
    return newId;
  } catch {
    // localStorage not available (private browsing, etc.)
    return `guest_${generateUUID()}`;
  }
}

function generateUUID(): string {
  // Use crypto.randomUUID() if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

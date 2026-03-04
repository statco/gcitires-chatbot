import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ChatWidget from './components/ChatWidget';
import type { Language, WidgetConfig } from './types';

// Inject CSS at runtime into a shadow DOM or <head>
// This is necessary for single-bundle IIFE embed in Shopify
import './styles/widget.css';

/** Read the Shopify store locale from the page so the welcome message
 *  renders in the correct language before any user interaction. */
function getInitialLanguage(): Language {
  const lang =
    document.documentElement.lang ||
    document.querySelector('meta[name="language"]')?.getAttribute('content') ||
    '';
  return lang.toLowerCase().startsWith('fr') ? 'FR' : 'EN';
}

function mountWidget(config: WidgetConfig): void {
  // Prevent double-mount
  if (document.getElementById('gci-tirebot-root')) return;

  const container = document.createElement('div');
  container.id = 'gci-tirebot-root';
  // Position outside Shopify's DOM hierarchy interference
  container.style.cssText =
    'position:fixed;bottom:0;right:0;z-index:2147483647;font-family:system-ui,sans-serif;';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <ChatWidget config={config} />
    </StrictMode>
  );
}

// Expose global API for theme.liquid to call
window.GCITiresWidget = { init: mountWidget };

// Auto-init if config is already on the page
// (supports both explicit init and auto-init via data attributes)
function autoInit(): void {
  const scriptEl = document.currentScript as HTMLScriptElement | null;
  const endpoint =
    scriptEl?.dataset.apiEndpoint ||
    (window as unknown as Record<string, string>)['GCI_API_ENDPOINT'];
  const domain =
    scriptEl?.dataset.storeDomain || 'gcitires.myshopify.com';

  if (endpoint) {
    mountWidget({ apiEndpoint: endpoint, storeDomain: domain, initialLanguage: getInitialLanguage() });
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit);
} else {
  // DOM is already ready (script loaded async/defer)
  autoInit();
}

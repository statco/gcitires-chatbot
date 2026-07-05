import { useState, useCallback, useEffect } from 'react';
import type { WidgetConfig } from '../types';
import { useCustomer } from '../hooks/useCustomer';
import { useLanguage } from '../hooks/useLanguage';
import { useChat } from '../hooks/useChat';
import ChatWindow from './ChatWindow';

interface ChatWidgetProps {
  config: WidgetConfig;
}

export default function ChatWidget({ config }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const customer = useCustomer();
  const { language, toggleLanguage, setLanguage } = useLanguage(config.initialLanguage);

  const { messages, isLoading, isOffline, sendMessage } = useChat(
    config,
    customer,
    language,
    setLanguage, // auto-switch language when detected from user input
    config.initialLanguage
  );

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setHasUnread(false);
  }, []);

  const handleMinimize = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Public open/close/toggle API — lets the Shopify theme (or any other
  // page script) open TireBot from a link/button elsewhere on the site
  // without needing to know internal DOM structure. See main.tsx for the
  // window.GCITiresWidget.open()/close()/toggle() wrappers that dispatch
  // these events.
  useEffect(() => {
    const openHandler = () => handleOpen();
    const closeHandler = () => handleMinimize();
    const toggleHandler = () => setIsOpen((prev) => !prev);

    window.addEventListener('gci-tirebot:open', openHandler);
    window.addEventListener('gci-tirebot:close', closeHandler);
    window.addEventListener('gci-tirebot:toggle', toggleHandler);

    return () => {
      window.removeEventListener('gci-tirebot:open', openHandler);
      window.removeEventListener('gci-tirebot:close', closeHandler);
      window.removeEventListener('gci-tirebot:toggle', toggleHandler);
    };
  }, [handleOpen, handleMinimize]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      await sendMessage(text);
      if (!isOpen) setHasUnread(true);
    },
    [isOpen, sendMessage]
  );

  return (
    <>
      {/* Floating action button */}
      {!isOpen && (
        <button
          className="gci-fab"
          onClick={handleOpen}
          aria-label="Open TireBot chat"
          aria-expanded={isOpen}
          type="button"
        >
          {/* Chat bubble icon.
              Previous icon (concentric circles + radiating spokes, meant
              to read as a wheel/tire) visually read as a targeting
              reticle at this size/stroke-weight instead — replaced with
              a standard chat-bubble glyph so the "click here to talk to
              someone" affordance is unambiguous. This is the same icon
              used on the theme-side "Chat with TireBot" launcher button
              for visual consistency. */}
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>

          {/* Unread badge */}
          {hasUnread && (
            <span className="gci-fab-badge" aria-label="New message">
              1
            </span>
          )}
        </button>
      )}

      {/* Chat window */}
      <div
        className={`gci-widget-container ${isOpen ? 'gci-widget-container--open' : ''}`}
        aria-hidden={!isOpen}
      >
        {isOpen && (
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            isOffline={isOffline}
            language={language}
            onSendMessage={handleSendMessage}
            onToggleLanguage={toggleLanguage}
            onMinimize={handleMinimize}
          />
        )}
      </div>
    </>
  );
}

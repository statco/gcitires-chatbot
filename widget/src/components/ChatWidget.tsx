import { useState, useCallback } from 'react';
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
  const { language, toggleLanguage, setLanguage } = useLanguage();

  const { messages, isLoading, isOffline, sendMessage } = useChat(
    config,
    customer,
    language,
    setLanguage // auto-switch language when detected from user input
  );

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setHasUnread(false);
  }, []);

  const handleMinimize = useCallback(() => {
    setIsOpen(false);
  }, []);

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
          {/* GCI tire SVG icon */}
          <svg
            width="30"
            height="30"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer tire */}
            <circle cx="32" cy="32" r="30" stroke="white" strokeWidth="4" fill="none" />
            {/* Inner rim */}
            <circle cx="32" cy="32" r="16" stroke="white" strokeWidth="3" fill="none" />
            {/* Hub */}
            <circle cx="32" cy="32" r="5" fill="white" />
            {/* Spokes */}
            <line x1="32" y1="16" x2="32" y2="5" stroke="white" strokeWidth="3" strokeLinecap="round" />
            <line x1="32" y1="48" x2="32" y2="59" stroke="white" strokeWidth="3" strokeLinecap="round" />
            <line x1="16" y1="32" x2="5" y2="32" stroke="white" strokeWidth="3" strokeLinecap="round" />
            <line x1="48" y1="32" x2="59" y2="32" stroke="white" strokeWidth="3" strokeLinecap="round" />
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

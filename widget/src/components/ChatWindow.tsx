import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage, Language } from '../types';
import { I18N } from '../types';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isOffline: boolean;
  language: Language;
  onSendMessage: (text: string) => void;
  onToggleLanguage: () => void;
  onMinimize: () => void;
}

export default function ChatWindow({
  messages,
  isLoading,
  isOffline,
  language,
  onSendMessage,
  onToggleLanguage,
  onMinimize,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const strings = I18N[language];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    // Small delay lets keyboard finish animating before scrolling
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isLoading]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll to bottom when input is focused on mobile (keyboard opens)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleFocus = () => {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 350);
    };
    input.addEventListener('focus', handleFocus);
    return () => input.removeEventListener('focus', handleFocus);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue('');
    onSendMessage(text);
  }, [inputValue, isLoading, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleQuickReply = useCallback(
    (text: string) => {
      if (isLoading) return;
      onSendMessage(text);
    },
    [isLoading, onSendMessage]
  );

  return (
    <div className="gci-window" role="dialog" aria-label="TireBot Chat" aria-modal="false">
      {/* Header */}
      <div className="gci-header">
        <div className="gci-header-title">
          <span className="gci-header-icon" aria-hidden="true">🤖</span>
          <span className="gci-header-name">{strings.title}</span>
          <span className="gci-header-status" aria-hidden="true">
            {isOffline ? '🔴' : '🟢'}
          </span>
        </div>
        <div className="gci-header-actions">
          <button
            className="gci-btn-lang"
            onClick={onToggleLanguage}
            aria-label={`Switch to ${strings.toggleLang}`}
            title={`Switch to ${strings.toggleLang}`}
            type="button"
          >
            {strings.toggleLang}
          </button>
          <button
            className="gci-btn-minimize"
            onClick={onMinimize}
            aria-label={strings.minimize}
            title={strings.minimize}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <div className="gci-offline-banner" role="alert">
          <span>{strings.offline}</span>
        </div>
      )}

      {/* Messages area */}
      <div className="gci-messages" role="log" aria-label="Chat messages" aria-live="polite">
        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            language={language}
            onQuickReply={handleQuickReply}
            isLoadingNext={isLoading && idx === messages.length - 1}
          />
        ))}

        {/* Show typing indicator when loading and last message is from user */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <TypingIndicator language={language} />
        )}

        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      {/* Prompt nudge */}
      <div className="gci-input-prompt">{strings.inputPrompt}</div>

      {/* Input area */}
      <div className="gci-input-area">
        <textarea
          ref={inputRef}
          className="gci-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={strings.placeholder}
          disabled={isLoading || isOffline}
          rows={1}
          aria-label={strings.placeholder}
          maxLength={1000}
        />
        <button
          className="gci-send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading || isOffline}
          aria-label={strings.send}
          type="button"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Branding footer */}
      <div className="gci-footer">
        <a
          href="https://gcitires.com"
          target="_blank"
          rel="noopener noreferrer"
          className="gci-footer-link"
          tabIndex={-1}
          aria-hidden="true"
        >
          gcitires.com
        </a>
      </div>
    </div>
  );
}

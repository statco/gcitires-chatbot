import type { ChatMessage, Language } from '../types';
import QuickReplies from './QuickReplies';

interface MessageBubbleProps {
  message: ChatMessage;
  language: Language;
  onQuickReply: (text: string) => void;
  isLoadingNext?: boolean;
}

export default function MessageBubble({
  message,
  language,
  onQuickReply,
  isLoadingNext = false,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

  return (
    <div
      className={`gci-message ${isUser ? 'gci-message--user' : 'gci-message--assistant'}`}
      data-role={message.role}
    >
      {!isUser && (
        <div className="gci-avatar" aria-hidden="true">
          🤖
        </div>
      )}

      <div className="gci-message-body">
        <div
          className={`gci-bubble ${isUser ? 'gci-bubble--user' : 'gci-bubble--assistant'} ${isStreaming ? 'gci-bubble--streaming' : ''}`}
          role={isUser ? undefined : 'log'}
          aria-live={isStreaming ? 'polite' : undefined}
        >
          <MessageContent content={message.content} />
          {isStreaming && <span className="gci-cursor" aria-hidden="true" />}
        </div>

        {/* Quick replies only for the last assistant message, when not loading */}
        {!isUser && !isStreaming && message.quickReplies && !isLoadingNext && (
          <QuickReplies
            replies={message.quickReplies}
            onSelect={onQuickReply}
            disabled={isLoadingNext}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Render message content with basic markdown support (bold, links, line breaks).
 * Avoids dangerouslySetInnerHTML — parses inline formatting safely.
 */
function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  // Split on newlines, handle basic **bold** and URLs
  const lines = content.split('\n');

  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          <InlineLine text={line} />
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function InlineLine({ text }: { text: string }) {
  // Match **bold**, *italic*, and URLs
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s]+)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="gci-link"
            >
              {part.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

interface QuickRepliesProps {
  replies: string[];
  onSelect: (reply: string) => void;
  disabled?: boolean;
}

export default function QuickReplies({ replies, onSelect, disabled = false }: QuickRepliesProps) {
  if (!replies || replies.length === 0) return null;

  return (
    <div className="gci-quick-replies" role="group" aria-label="Quick reply options">
      {replies.map((reply) => (
        <button
          key={reply}
          className="gci-quick-reply-chip"
          onClick={() => !disabled && onSelect(reply)}
          disabled={disabled}
          type="button"
          aria-label={reply}
        >
          {reply}
        </button>
      ))}
    </div>
  );
}

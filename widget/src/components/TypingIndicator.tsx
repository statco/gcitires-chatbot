import type { Language } from '../types';
import { I18N } from '../types';

interface TypingIndicatorProps {
  language: Language;
}

export default function TypingIndicator({ language }: TypingIndicatorProps) {
  return (
    <div className="gci-message gci-message--assistant" aria-live="polite" aria-label={I18N[language].typing}>
      <div className="gci-bubble gci-bubble--assistant">
        <div className="gci-typing-indicator" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="gci-sr-only">{I18N[language].typing}</span>
      </div>
    </div>
  );
}

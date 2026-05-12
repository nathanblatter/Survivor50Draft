import { useState } from 'react';

interface ShareButtonProps {
  getText: () => string;
  label?: string;
  className?: string;
}

export default function ShareButton({ getText, label = 'Share', className = '' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = getText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleShare} className={`share-action-btn ${className}`}>
      {copied ? '✓ Copied!' : `📋 ${label}`}
    </button>
  );
}

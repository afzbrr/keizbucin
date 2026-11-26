import React, { useMemo } from 'react';
import { Emoji, EmojiStyle, emojiByUnified } from 'emoji-picker-react';

export const QUICK_REACT_EMOJIS = ['❤️', '😂', '😍', '🥺', '😭', '👍'] as const;

function toHexUnified(str: string): string {
  const parts: string[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) {
      parts.push(cp.toString(16).toLowerCase());
    }
  }
  return parts.join('-');
}

export function resolveAppleUnified(emoji: string): string | null {
  if (!emoji) return null;
  const u1 = toHexUnified(emoji);
  if (emojiByUnified(u1)) return u1;

  const stripped = emoji.replace(/\uFE0F/g, '');
  const u2 = toHexUnified(stripped);
  if (u2 && emojiByUnified(u2)) return u2;

  const withFe0f = `${u2}-fe0f`;
  if (u2 && emojiByUnified(withFe0f)) return withFe0f;

  return null;
}

interface AppleEmojiProps {
  emoji: string;
  size?: number;
  className?: string;
}

export const AppleEmoji: React.FC<AppleEmojiProps> = ({
  emoji,
  size = 18,
  className = '',
}) => {
  const unified = resolveAppleUnified(emoji);
  if (!unified) {
    return <span className={className}>{emoji}</span>;
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center align-middle leading-none select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <Emoji unified={unified} emojiStyle={EmojiStyle.APPLE} size={size} />
    </span>
  );
};

function splitGraphemes(text: string): string[] {
  const IntlObj = Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      opts?: { granularity: 'grapheme' }
    ) => { segment: (input: string) => Iterable<{ segment: string }> };
  };
  if (typeof IntlObj?.Segmenter === 'function') {
    const segmenter = new IntlObj.Segmenter('en', { granularity: 'grapheme' });
    const out: string[] = [];
    for (const item of segmenter.segment(text)) {
      out.push(item.segment);
    }
    return out;
  }
  return Array.from(text);
}

const EMOJI_TEST_RE = /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2})/u;

interface AppleTextWithEmojisProps {
  text: string;
  emojiSize?: number;
}

export const AppleTextWithEmojis: React.FC<AppleTextWithEmojisProps> = ({
  text,
  emojiSize = 17,
}) => {
  const tokens = useMemo(() => {
    if (!text || !EMOJI_TEST_RE.test(text)) {
      return null;
    }
    const graphemes = splitGraphemes(text);
    const merged: { kind: 'text' | 'emoji'; value: string; unified?: string }[] = [];
    let textBuf = '';

    for (const seg of graphemes) {
      const unified = EMOJI_TEST_RE.test(seg) ? resolveAppleUnified(seg) : null;
      if (unified) {
        if (textBuf) {
          merged.push({ kind: 'text', value: textBuf });
          textBuf = '';
        }
        merged.push({ kind: 'emoji', value: seg, unified });
      } else {
        textBuf += seg;
      }
    }
    if (textBuf) {
      merged.push({ kind: 'text', value: textBuf });
    }
    return merged;
  }, [text]);

  if (!tokens) {
    return <>{text}</>;
  }

  return (
    <>
      {tokens.map((tok, idx) =>
        tok.kind === 'emoji' && tok.unified ? (
          <span
            key={idx}
            className="mx-[0.5px] inline-flex items-center justify-center align-text-bottom leading-none select-none"
            style={{ width: emojiSize, height: emojiSize }}
          >
            <Emoji
              unified={tok.unified}
              emojiStyle={EmojiStyle.APPLE}
              size={emojiSize}
            />
          </span>
        ) : (
          <React.Fragment key={idx}>{tok.value}</React.Fragment>
        )
      )}
    </>
  );
};

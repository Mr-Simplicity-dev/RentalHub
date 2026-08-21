import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { EASINGS } from '../motion/easing';
import '../fonts.css';

type KineticTextProps = {
  text: string;
  accentWords?: string[];
  fontSize: number;
  fontWeight: number;
  color?: string;
  accentColor?: string;
  fontFamily?: string;
  lineHeight?: number;
  letterSpacing?: number;
  staggerFrames?: number;
  entryFrames?: number;
  // When true, the currently "spoken" word is highlighted (karaoke style).
  // Word timing is approximated as line frames / word count.
  karaoke?: boolean;
  lineFrames?: number;
  // 'punch' slams words in with overshoot; 'open' is slow and gentle.
  beat?: 'open' | 'build' | 'punch' | 'hold' | 'brand';
};

// Splits the headline into words and reveals them one by one with a
// blur-to-sharp slide. Accent words render in the accent color with an
// overshoot pop. Optional karaoke highlight follows the voiceover.
export const KineticText: React.FC<KineticTextProps> = ({
  text,
  accentWords = [],
  fontSize,
  fontWeight,
  color = '#ffffff',
  accentColor = '#eab308',
  fontFamily = "'Sora', sans-serif",
  lineHeight = 1.16,
  letterSpacing = -1,
  staggerFrames = 4,
  entryFrames = 8,
  karaoke = false,
  lineFrames = 90,
  beat = 'build',
}) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  const accented = new Set(accentWords.map((w) => w.toLowerCase()));

  const entry = beat === 'punch' ? 6 : beat === 'open' ? 14 : beat === 'brand' ? 12 : 8;
  const stagger = beat === 'punch' ? 3 : 4;
  const easing = beat === 'punch' ? EASINGS.springLike : beat === 'brand' ? EASINGS.outBack : EASINGS.outExpo;

  // Karaoke: which word the voice is on right now.
  const spokenIndex = karaoke && lineFrames > 0
    ? Math.min(words.length - 1, Math.floor((frame / lineFrames) * words.length))
    : -1;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        rowGap: 6,
        columnGap: 10,
        fontSize,
        fontWeight,
        fontFamily,
        lineHeight,
        letterSpacing,
        maxWidth: '100%',
      }}
    >
      {words.map((word, index) => {
        const start = index * stagger;
        const progress = interpolate(frame, [start, start + entry], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing,
        });
        const isAccent = accented.has(word.toLowerCase().replace(/[^\w']/g, ''));
        const isSpoken = spokenIndex === index && karaoke;

        const translateY = interpolate(progress, [0, 1], [26, 0]);
        const blur = interpolate(progress, [0, 1], [8, 0]);
        const scale = isAccent
          ? interpolate(progress, [0, 1], [1.3, 1.12])
          : 1;

        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              opacity: progress,
              transform: `translateY(${translateY}px) scale(${isAccent ? scale : 1})`,
              filter: `blur(${blur}px)`,
              color: isAccent ? accentColor : color,
              textShadow: `0 3px 14px rgba(0,0,0,0.8)`,
              ...(isSpoken
                ? {
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderRadius: 8,
                    padding: '0 4px',
                  }
                : {}),
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

type TextSlideProps = {
  text: string;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  animation?: 'zoomIn' | 'slideUp' | 'slideDown' | 'fade' | 'typewriter' | 'shake' | 'pulse';
  fontWeight?: number;
  fontFamily?: string;
};

export const TextSlide: React.FC<TextSlideProps> = ({
  text,
  fontSize = 72,
  color = '#ffffff',
  bgColor = '#0f172a',
  animation = 'fade',
  fontWeight = 800,
  fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}) => {
  const frame = useCurrentFrame();

  const getTransform = () => {
    switch (animation) {
      case 'zoomIn':
        const scale = interpolate(frame, [0, 10], [0.3, 1], { extrapolateRight: 'clamp' });
        return `scale(${scale})`;
      case 'slideUp':
        const yUp = interpolate(frame, [0, 10], [80, 0], { extrapolateRight: 'clamp' });
        return `translateY(${yUp}px)`;
      case 'slideDown':
        const yDown = interpolate(frame, [0, 10], [-80, 0], { extrapolateRight: 'clamp' });
        return `translateY(${yDown}px)`;
      case 'shake':
        const shakeX = Math.sin(frame * 1.5) * interpolate(frame, [0, 8, 15], [0, 12, 0], { extrapolateRight: 'clamp' });
        return `translateX(${shakeX}px)`;
      case 'pulse':
        const pulseScale = interpolate(frame, [0, 5, 10], [0.8, 1.05, 1], { extrapolateRight: 'clamp' });
        return `scale(${pulseScale})`;
      case 'typewriter':
      case 'fade':
      default:
        return 'none';
    }
  };

  const getOpacity = () => {
    if (animation === 'typewriter') {
      const charsToShow = Math.floor(interpolate(frame, [0, 15], [0, text.length], { extrapolateRight: 'clamp' }));
      return 1;
    }
    return interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  };

  const displayText = animation === 'typewriter'
    ? text.slice(0, Math.floor(interpolate(frame, [0, 20], [0, text.length], { extrapolateRight: 'clamp' })))
    : text;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 40px',
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight,
          fontFamily,
          color,
          textAlign: 'center',
          transform: getTransform(),
          opacity: getOpacity(),
          lineHeight: 1.2,
          letterSpacing: '-1px',
          maxWidth: '90%',
        }}
      >
        {displayText}
      </div>
    </AbsoluteFill>
  );
};

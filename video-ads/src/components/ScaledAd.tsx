import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';

type ScaledAdProps = {
  // The 1080x1920 ad composition, scaled to fit the current canvas.
  children: React.ReactNode;
  backdropFrom?: string;
  backdropTo?: string;
};

// Renders the vertical 1080x1920 design inside any canvas size (square,
// landscape, etc.) by scaling it to fit and filling the bars with a
// branded gradient. Content is never cropped in alternate formats.
export const ScaledAd: React.FC<ScaledAdProps> = ({
  children,
  backdropFrom = '#0f172a',
  backdropTo = '#1d4ed8',
}) => {
  const { width, height } = useVideoConfig();
  const scale = Math.min(width / 1080, height / 1920);
  const offsetX = (width - 1080 * scale) / 2;
  const offsetY = (height - 1920 * scale) / 2;

  return (
    <AbsoluteFill style={{ background: `linear-gradient(150deg, ${backdropFrom}, ${backdropTo})` }}>
      <AbsoluteFill
        style={{
          width: 1080,
          height: 1920,
          left: offsetX,
          top: offsetY,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

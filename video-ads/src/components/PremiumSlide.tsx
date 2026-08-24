import React from 'react';
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { EASINGS } from '../motion/easing';
import { KineticText } from './KineticText';

type PremiumSlideProps = {
  kicker?: string;
  headline: string;
  accentWords?: string[];
  subline?: string;
  from: string;
  to: string;
  accent?: string;
  beat?: 'open' | 'build' | 'punch' | 'hold' | 'brand';
  fontSize?: number;
  fontWeight?: number;
  image?: string;
  // Per-ad color grade (a low-opacity color wash over the whole frame).
  grade?: string;
  // Frames this slide is on screen (used for karaoke timing).
  lineFrames?: number;
};

// SVG turbulence data URI for film grain - no external asset needed.
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")";

export const PremiumSlide: React.FC<PremiumSlideProps> = ({
  kicker,
  headline,
  accentWords = [],
  subline,
  from,
  to,
  accent = '#eab308',
  beat = 'build',
  fontSize = 54,
  fontWeight = 900,
  image,
  grade,
  lineFrames = 90,
}) => {
  const frame = useCurrentFrame();

  // â”€â”€ Motion: eased everything â”€â”€
  const kenBurnsProgress = interpolate(frame, [0, 90], [0, 1], { extrapolateRight: 'clamp', easing: EASINGS.inOutCubic });
  const kenBurnsScale = 1.06 + kenBurnsProgress * 0.1;
  const kenBurnsX = kenBurnsProgress * -2.6;

  const logoProgress = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp', easing: EASINGS.outBack });
  const logoScale = interpolate(logoProgress, [0, 1], [0.7, 1]);
  const logoOpacity = logoProgress;

  const glowBreath = 0.3 + 0.15 * Math.sin(frame * 0.09);
  const grainFlicker = 0.05 + 0.03 * Math.sin(frame * 1.7 + 2);
  const gradeOpacity = 0.1;

  // Dissolve-in: the incoming slide fades in over the outgoing one.
  const slideIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp', easing: EASINGS.inOutCubic });

  // White flash on the brand beat.
  const flash = beat === 'brand'
    ? interpolate(frame, [5, 7, 9], [0, 0.6, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  const kickerOpacity = interpolate(frame, [2, 8], [0, 1], { extrapolateRight: 'clamp', easing: EASINGS.outExpo });
  const sublineOpacity = interpolate(frame, [10, 18], [0, 1], { extrapolateRight: 'clamp', easing: EASINGS.outExpo });

  // Parallax: the text block drifts at 0.35x the photo speed.
  const parallaxX = kenBurnsX * 0.35;

  const karaoke = beat !== 'punch' && beat !== 'brand';

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: slideIn,
      }}
    >
      {/* Photo background with accelerating Ken Burns */}
      {image ? (
        <img
          src={staticFile(image)}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${kenBurnsScale}) translateX(${kenBurnsX}%)`,
          }}
        />
      ) : null}

      {/* Scrim */}
      <AbsoluteFill
        style={{
          background: image
            ? 'linear-gradient(180deg, rgba(10,14,20,0.72) 0%, rgba(10,14,20,0.16) 30%, rgba(10,14,20,0.16) 62%, rgba(10,14,20,0.85) 100%)'
            : 'transparent',
        }}
      />

      {/* Grade wash */}
      {grade ? (
        <AbsoluteFill style={{ background: grade, opacity: gradeOpacity }} />
      ) : null}

      {/* Animated glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 38%, ${accent}44 0%, transparent 55%)`,
          opacity: glowBreath,
        }}
      />

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at 50% 45%, transparent 55%, rgba(0,0,0,0.4) 100%)',
        }}
      />

      {/* Film grain */}
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN_URI,
          opacity: grainFlicker,
          mixBlendMode: 'overlay',
        }}
      />

      {/* Logo mark (parallax layer) */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          transform: `scale(${logoScale}) translateX(${parallaxX}%)`,
          opacity: logoOpacity,
        }}
      >
        <img
          src={staticFile('rentalhub-mark.svg')}
          alt="RentalHub NG"
          style={{ width: 104, height: 104, filter: 'drop-shadow(0 12px 24px rgba(15,23,42,0.4))' }}
        />
      </div>

      {/* Lower-third kinetic subtitle block */}
      <div
        style={{
          position: 'absolute',
          left: 34,
          right: 34,
          bottom: 168,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: `translateX(${parallaxX}%)`,
        }}
      >
        {kicker ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, opacity: kickerOpacity }}>
            <div style={{ width: 34, height: 3, borderRadius: 3, background: accent }} />
            <div
              style={{
                color: accent,
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: '0.26em',
                fontFamily: "'Sora', sans-serif",
                textTransform: 'uppercase',
                textShadow: '0 2px 8px rgba(0,0,0,0.6)',
              }}
            >
              {kicker}
            </div>
            <div style={{ width: 34, height: 3, borderRadius: 3, background: accent }} />
          </div>
        ) : null}

        <div
          style={{
            background: 'rgba(8,10,14,0.62)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 22,
            padding: '20px 30px',
            maxWidth: '100%',
            boxShadow: '0 18px 44px rgba(0,0,0,0.45)',
          }}
        >
          <KineticText
            text={headline}
            accentWords={accentWords}
            fontSize={fontSize}
            fontWeight={fontWeight}
            accentColor={accent}
            beat={beat}
            karaoke={karaoke}
            lineFrames={lineFrames}
          />
          {subline ? (
            <div
              style={{
                marginTop: 10,
                color: 'rgba(255,255,255,0.85)',
                fontSize: 24,
                fontWeight: 600,
                textAlign: 'center',
                textShadow: '0 2px 8px rgba(0,0,0,0.7)',
                opacity: sublineOpacity,
              }}
            >
              {subline}
            </div>
          ) : null}
        </div>
      </div>

      {/* Wordmark footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '0.34em',
          fontFamily: "'Sora', sans-serif",
          textTransform: 'uppercase',
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        rentalhub.com.ng
      </div>

      {/* Brand white flash */}
      {beat === 'brand' ? (
        <AbsoluteFill style={{ background: '#ffffff', opacity: flash }} />
      ) : null}
    </AbsoluteFill>
  );
};

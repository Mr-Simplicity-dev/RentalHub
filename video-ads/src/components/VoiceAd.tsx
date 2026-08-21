import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { PremiumSlide } from './PremiumSlide';
import { AudioMixer } from './AudioMixer';

export type Beat = 'open' | 'build' | 'punch' | 'hold' | 'brand';

export type VoiceLine = {
  file: string;
  frames: number;
  kicker?: string;
  headline: string;
  accentWords?: string[];
  subline?: string;
  from: string;
  to: string;
  accent?: string;
  beat?: Beat;
  fontSize?: number;
  fontWeight?: number;
  image?: string;
  // Legacy hint, kept for config compatibility; motion is driven by beat.
  animation?: string;
};

export type VoiceAdConfig = {
  lines: VoiceLine[];
  // Per-ad color grade (subtle wash over every frame).
  grade?: string;
  // Sound design toggles.
  musicFile?: string;
  whoosh?: boolean;
  impactOnPunch?: boolean;
  dingOnBrand?: boolean;
};

// Overlap (dissolve) in frames per beat: punch beats cut hard.
const OVERLAP: Record<Beat, number> = {
  open: 10,
  build: 8,
  punch: 0,
  hold: 12,
  brand: 8,
};

// Renders a sequence of branded slides with voice-synced kinetic text,
// eased dissolves between scenes, and the sound design layer.
export const VoiceAd: React.FC<{ config: VoiceAdConfig }> = ({ config }) => {
  const { lines, grade, musicFile, whoosh = true, impactOnPunch = true, dingOnBrand = true } = config;

  let cursor = 0;
  const starts: number[] = [];
  const whooshAt: number[] = [];
  const impactAt: number[] = [];
  const dingAt: number[] = [];
  const brandFrames = lines[lines.length - 1].frames;

  const sequences = lines.map((line, index) => {
    const overlap = OVERLAP[line.beat ?? 'build'];
    const start = index === 0 ? 0 : starts[index - 1] + lines[index - 1].frames - overlap;
    starts.push(start);
    cursor = start + line.frames;

    if (index > 0) {
      whooshAt.push(start);
    }
    if (line.beat === 'punch') {
      impactAt.push(start);
    }
    if (line.beat === 'brand') {
      dingAt.push(start + 6);
    }

    // The voice starts after the visual dissolve so two voices never overlap.
    const audioStart = index === 0 ? 0 : start + overlap;
    const audioFrames = Math.max(line.frames - overlap, 10);

    return (
      <React.Fragment key={index}>
        <Sequence from={start} durationInFrames={line.frames}>
          <PremiumSlide
            kicker={line.kicker}
            headline={line.headline}
            accentWords={line.accentWords}
            subline={line.subline}
            from={line.from}
            to={line.to}
            accent={line.accent}
            beat={line.beat}
            fontSize={line.fontSize}
            fontWeight={line.fontWeight}
            image={line.image}
            grade={grade}
            lineFrames={line.frames}
          />
        </Sequence>
        <Sequence from={audioStart} durationInFrames={audioFrames}>
          <Audio src={staticFile(line.file)} />
        </Sequence>
      </React.Fragment>
    );
  });

  return (
    <AbsoluteFill>
      {sequences}
      <AudioMixer
        musicFile={musicFile}
        whooshAt={whoosh ? whooshAt : []}
        impactAt={impactOnPunch ? impactAt : []}
        dingAt={dingOnBrand ? dingAt : []}
      />
    </AbsoluteFill>
  );
};

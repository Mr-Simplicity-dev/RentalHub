import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const TextAd4: React.FC = () => {
  const { fps } = useVideoConfig();
  const BG = '#0f172a';
  const BLUE = '#0284c7';
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={4 * fps}>
        <TextSlide text='"I found my apartment on RentalHub — exactly as described"' fontSize={56} bgColor={BG} animation="typewriter" />
      </Sequence>
      <Sequence from={4 * fps} durationInFrames={1 * fps}>
        <TextSlide text="— Chidinma, Lagos" fontSize={36} bgColor={BG} animation="fade" fontWeight={400} color="#94a3b8" />
      </Sequence>
      <Sequence from={5 * fps} durationInFrames={4 * fps}>
        <TextSlide text='"No fake agents. No surprises. Just my new home."' fontSize={56} bgColor={BG} animation="typewriter" />
      </Sequence>
      <Sequence from={9 * fps} durationInFrames={1 * fps}>
        <TextSlide text="— Emeka, Abuja" fontSize={36} bgColor={BG} animation="fade" fontWeight={400} color="#94a3b8" />
      </Sequence>
      <Sequence from={10 * fps} durationInFrames={5 * fps}>
        <TextSlide text="Join 5,000+ happy tenants" fontSize={64} bgColor={BLUE} animation="fade" />
      </Sequence>
    </AbsoluteFill>
  );
};
export default TextAd4;
import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const TextAd2: React.FC = () => {
  const { fps } = useVideoConfig();
  const BG = '#0f172a';
  const BLUE = '#0284c7';
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={3 * fps}>
        <TextSlide text="Finding a home in Nigeria is hard." fontSize={72} bgColor={BG} animation="fade" />
      </Sequence>
      <Sequence from={3 * fps} durationInFrames={4 * fps}>
        <TextSlide text="Step 1: Search verified listings" fontSize={60} bgColor={BG} animation="slideUp" />
      </Sequence>
      <Sequence from={7 * fps} durationInFrames={4 * fps}>
        <TextSlide text="Step 2: Read real tenant reviews" fontSize={60} bgColor={BG} animation="slideUp" />
      </Sequence>
      <Sequence from={11 * fps} durationInFrames={4 * fps}>
        <TextSlide text="Step 3: Pay securely through the app" fontSize={60} bgColor={BG} animation="slideUp" />
      </Sequence>
      <Sequence from={15 * fps} durationInFrames={3 * fps}>
        <TextSlide text="RentalHub NG" fontSize={90} bgColor={BLUE} animation="zoomIn" color="#eab308" />
      </Sequence>
      <Sequence from={18 * fps} durationInFrames={2 * fps}>
        <TextSlide text="rentalhub.com.ng/download" fontSize={40} bgColor={BLUE} animation="fade" fontWeight={600} />
      </Sequence>
    </AbsoluteFill>
  );
};
export default TextAd2;
import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const TextAd3: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={2 * fps}>
        <TextSlide text="From Lagos" fontSize={80} bgColor="#0f172a" animation="fade" />
      </Sequence>
      <Sequence from={2 * fps} durationInFrames={2 * fps}>
        <TextSlide text="To Abuja" fontSize={80} bgColor="#0f172a" animation="fade" />
      </Sequence>
      <Sequence from={4 * fps} durationInFrames={2 * fps}>
        <TextSlide text="To Rivers" fontSize={80} bgColor="#0f172a" animation="fade" />
      </Sequence>
      <Sequence from={6 * fps} durationInFrames={2 * fps}>
        <TextSlide text="36 STATES." fontSize={110} bgColor="#0f172a" animation="zoomIn" color="#eab308" />
      </Sequence>
      <Sequence from={8 * fps} durationInFrames={2 * fps}>
        <TextSlide text="RentalHub NG — Download Free" fontSize={50} bgColor="#0284c7" animation="slideUp" />
      </Sequence>
    </AbsoluteFill>
  );
};
export default TextAd3;
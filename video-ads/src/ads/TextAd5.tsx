import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const TextAd5: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={3 * fps}>
        <TextSlide text="73% of Nigerians" fontSize={80} bgColor="#0f172a" animation="fade" />
      </Sequence>
      <Sequence from={3 * fps} durationInFrames={3 * fps}>
        <TextSlide text="have been scammed by a fake listing" fontSize={64} bgColor="#dc2626" animation="fade" />
      </Sequence>
      <Sequence from={6 * fps} durationInFrames={3 * fps}>
        <TextSlide text="RentalHub verifies every property" fontSize={64} bgColor="#0284c7" animation="slideUp" />
      </Sequence>
      <Sequence from={9 * fps} durationInFrames={3 * fps}>
        <TextSlide text="rentalhub.com.ng/download" fontSize={44} bgColor="#0284c7" animation="fade" fontWeight={600} />
      </Sequence>
    </AbsoluteFill>
  );
};
export default TextAd5;
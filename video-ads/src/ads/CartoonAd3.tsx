import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const CartoonAd3: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={4 * fps}>
        <TextSlide text="From Lagos to Abuja. Rivers to Kano." fontSize={52} bgColor="#0f172a" animation="fade" />
      </Sequence>
      <Sequence from={4 * fps} durationInFrames={4 * fps}>
        <TextSlide text="RentalHub covers all 36 states." fontSize={56} bgColor="#0f172a" animation="zoomIn" />
      </Sequence>
      <Sequence from={8 * fps} durationInFrames={4 * fps}>
        <TextSlide text="Find verified properties anywhere in Nigeria." fontSize={48} bgColor="#0f172a" animation="slideUp" />
      </Sequence>
      <Sequence from={12 * fps} durationInFrames={3 * fps}>
        <TextSlide text="rentalhub.com.ng/download" fontSize={44} bgColor="#0284c7" animation="fade" fontWeight={600} />
      </Sequence>
    </AbsoluteFill>
  );
};
export default CartoonAd3;
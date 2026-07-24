import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const CartoonAd1: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={4 * fps}>
        <TextSlide text="You see a listing online. The photos look amazing." fontSize={48} bgColor="#0f172a" animation="fade" />
      </Sequence>
      <Sequence from={4 * fps} durationInFrames={4 * fps}>
        <TextSlide text="You pay the agent fee. ₦20,000 gone." fontSize={52} bgColor="#0f172a" animation="slideUp" color="#ef4444" />
      </Sequence>
      <Sequence from={8 * fps} durationInFrames={4 * fps}>
        <TextSlide text="You get to the house... it doesn't exist." fontSize={52} bgColor="#dc2626" animation="shake" />
      </Sequence>
      <Sequence from={12 * fps} durationInFrames={4 * fps}>
        <TextSlide text="Sound familiar?" fontSize={60} bgColor="#0f172a" animation="fade" color="#94a3b8" />
      </Sequence>
      <Sequence from={16 * fps} durationInFrames={6 * fps}>
        <TextSlide text="RentalHub verifies every listing." fontSize={56} bgColor="#0284c7" animation="slideUp" />
      </Sequence>
      <Sequence from={22 * fps} durationInFrames={4 * fps}>
        <TextSlide text="Find your next home with confidence." fontSize={52} bgColor="#0284c7" animation="fade" />
      </Sequence>
      <Sequence from={26 * fps} durationInFrames={4 * fps}>
        <TextSlide text="rentalhub.com.ng/download" fontSize={44} bgColor="#0f172a" animation="pulse" fontWeight={600} />
      </Sequence>
    </AbsoluteFill>
  );
};
export default CartoonAd1;
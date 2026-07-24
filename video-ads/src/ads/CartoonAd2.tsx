import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const CartoonAd2: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={5 * fps}>
        <TextSlide text="Search verified properties by location, price, and type." fontSize={48} bgColor="#0f172a" animation="slideUp" />
      </Sequence>
      <Sequence from={5 * fps} durationInFrames={5 * fps}>
        <TextSlide text="Read honest reviews from real tenants." fontSize={48} bgColor="#0f172a" animation="slideUp" />
      </Sequence>
      <Sequence from={10 * fps} durationInFrames={5 * fps}>
        <TextSlide text="Pay rent and deposits securely through the app." fontSize={48} bgColor="#0f172a" animation="slideUp" />
      </Sequence>
      <Sequence from={15 * fps} durationInFrames={5 * fps}>
        <TextSlide text="RentalHub NG — Download Free" fontSize={56} bgColor="#0284c7" animation="zoomIn" color="#eab308" />
      </Sequence>
    </AbsoluteFill>
  );
};
export default CartoonAd2;
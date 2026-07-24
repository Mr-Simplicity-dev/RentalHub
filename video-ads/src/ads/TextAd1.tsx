import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const BG_DARK = '#0f172a';
const BG_RED = '#dc2626';
const BG_BLUE = '#0284c7';

const TextAd1: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={3 * fps}>
        <TextSlide text="STOP" fontSize={120} bgColor={BG_RED} animation="zoomIn" />
      </Sequence>
      <Sequence from={3 * fps} durationInFrames={2 * fps}>
        <TextSlide text="PAYING AGENTS" fontSize={96} bgColor={BG_RED} animation="slideUp" />
      </Sequence>
      <Sequence from={5 * fps} durationInFrames={2 * fps}>
        <TextSlide text="FOR HOUSES" fontSize={96} bgColor={BG_RED} animation="slideUp" />
      </Sequence>
      <Sequence from={7 * fps} durationInFrames={2 * fps}>
        <TextSlide text="THAT DON'T EXIST" fontSize={80} bgColor={BG_RED} animation="shake" />
      </Sequence>
      <Sequence from={9 * fps} durationInFrames={3 * fps}>
        <TextSlide text="Use RentalHub" fontSize={100} bgColor={BG_BLUE} animation="fade" color="#eab308" />
      </Sequence>
      <Sequence from={12 * fps} durationInFrames={3 * fps}>
        <TextSlide text="rentalhub.com.ng/download" fontSize={48} bgColor={BG_BLUE} animation="pulse" color="#ffffff" fontWeight={600} />
      </Sequence>
    </AbsoluteFill>
  );
};

export default TextAd1;
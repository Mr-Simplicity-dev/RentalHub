import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const BG_DARK = '#0f172a';
const BG_BLUE = '#0284c7';
const GOLD = '#eab308';

// Aspiration ad: "your address says a lot".
// Emotion: aspiration (with a belonging undertone).
// Beat sheet (30s @ 30fps):
//   1. Hook    0-3s   "YOUR ADDRESS SAYS A LOT"            zoomIn  gold on dark
//   2. Desire  3-7s   "IKEJA. LEKKI. WUSE II."             slideUp white on blue
//   3. Build   7-11s  "HOMES THAT MATCH YOUR AMBITION"     fade    white on dark
//   4. Reveal  11-16s "RENTALHUB VERIFIES EVERY LISTING"   slideUp gold on blue
//   5. Proof   16-20s "PAYSTACK-SECURED. NDPR-SAFE. NO AGENT FEES." fade slate on dark
//   6. CTA     20-25s "RENTALHUB: FIND YOUR NEXT ADDRESS"  pulse   gold on dark
//   7. URL     25-30s "rentalhub.com.ng/download"          pulse   white on blue

const AspirationAd1: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={3 * fps}>
        <TextSlide text="YOUR ADDRESS SAYS A LOT" fontSize={76} bgColor={BG_DARK} color={GOLD} animation="zoomIn" fontWeight={900} />
      </Sequence>
      <Sequence from={3 * fps} durationInFrames={4 * fps}>
        <TextSlide text="IKEJA. LEKKI. WUSE II." fontSize={72} bgColor={BG_BLUE} animation="slideUp" />
      </Sequence>
      <Sequence from={7 * fps} durationInFrames={4 * fps}>
        <TextSlide text="HOMES THAT MATCH YOUR AMBITION" fontSize={58} bgColor={BG_DARK} animation="fade" />
      </Sequence>
      <Sequence from={11 * fps} durationInFrames={5 * fps}>
        <TextSlide text="RENTALHUB VERIFIES EVERY LISTING" fontSize={62} bgColor={BG_BLUE} color={GOLD} animation="slideUp" />
      </Sequence>
      <Sequence from={16 * fps} durationInFrames={4 * fps}>
        <TextSlide text="PAYSTACK-SECURED. NDPR-SAFE. NO AGENT FEES." fontSize={42} bgColor={BG_DARK} color="#94a3b8" animation="fade" fontWeight={600} />
      </Sequence>
      <Sequence from={20 * fps} durationInFrames={5 * fps}>
        <TextSlide text="RENTALHUB: FIND YOUR NEXT ADDRESS" fontSize={68} bgColor={BG_DARK} color={GOLD} animation="pulse" fontWeight={900} />
      </Sequence>
      <Sequence from={25 * fps} durationInFrames={5 * fps}>
        <TextSlide text="rentalhub.com.ng/download" fontSize={44} bgColor={BG_BLUE} animation="pulse" fontWeight={600} />
      </Sequence>
    </AbsoluteFill>
  );
};

export default AspirationAd1;

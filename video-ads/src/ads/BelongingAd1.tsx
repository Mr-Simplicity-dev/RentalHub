import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const BG_WARM_DARK = '#292524';
const BG_BLUE = '#0284c7';
const CREAM = '#fef3c7';
const AMBER = '#f59e0b';

// Belonging ad: home is a family word.
// Emotion: belonging (family, community).
// Beat sheet (30s @ 30fps):
//   1. Hook      0-3s   "HOME ISN'T JUST FOUR WALLS"           fade    cream on warm dark
//   2. Warmth    3-7s   "SUNDAY RICE. FAMILY LAUGHTER."        slideUp amber accent
//   3. Belonging 7-11s  "A ROOM FOR THE KIDS TO GROW"          fade    cream on warm dark
//   4. Belonging 11-15s "A DOOR THAT OPENS FOR EVERYONE"       slideUp cream on warm dark
//   5. Reveal    15-20s "RENTALHUB VERIFIES BEFORE YOU MOVE IN" fade   amber on warm dark
//   6. CTA       20-25s "RENTALHUB: HOME FOR YOUR FAMILY"      fade    amber on warm dark
//   7. URL       25-30s "rentalhub.com.ng/download"            fade    cream on blue

const BelongingAd1: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={3 * fps}>
        <TextSlide text="HOME ISN'T JUST FOUR WALLS" fontSize={64} bgColor={BG_WARM_DARK} color={CREAM} animation="fade" fontWeight={900} />
      </Sequence>
      <Sequence from={3 * fps} durationInFrames={4 * fps}>
        <TextSlide text="SUNDAY RICE. FAMILY LAUGHTER." fontSize={58} bgColor={BG_WARM_DARK} color={AMBER} animation="slideUp" fontWeight={800} />
      </Sequence>
      <Sequence from={7 * fps} durationInFrames={4 * fps}>
        <TextSlide text="A ROOM FOR THE KIDS TO GROW" fontSize={58} bgColor={BG_WARM_DARK} color={CREAM} animation="fade" />
      </Sequence>
      <Sequence from={11 * fps} durationInFrames={4 * fps}>
        <TextSlide text="A DOOR THAT OPENS FOR EVERYONE" fontSize={54} bgColor={BG_WARM_DARK} color={CREAM} animation="slideUp" />
      </Sequence>
      <Sequence from={15 * fps} durationInFrames={5 * fps}>
        <TextSlide text="RENTALHUB VERIFIES BEFORE YOU MOVE IN" fontSize={54} bgColor={BG_WARM_DARK} color={AMBER} animation="fade" fontWeight={800} />
      </Sequence>
      <Sequence from={20 * fps} durationInFrames={5 * fps}>
        <TextSlide text="RENTALHUB: HOME FOR YOUR FAMILY" fontSize={66} bgColor={BG_WARM_DARK} color={AMBER} animation="fade" fontWeight={900} />
      </Sequence>
      <Sequence from={25 * fps} durationInFrames={5 * fps}>
        <TextSlide text="rentalhub.com.ng/download" fontSize={44} bgColor={BG_BLUE} color={CREAM} animation="fade" fontWeight={600} />
      </Sequence>
    </AbsoluteFill>
  );
};

export default BelongingAd1;

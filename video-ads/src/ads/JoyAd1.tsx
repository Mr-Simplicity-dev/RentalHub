import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TextSlide } from '../components/TextSlide';

const BG_DARK = '#0f172a';
const BG_BLUE = '#0284c7';
const GOLD = '#eab308';

// Joy/Humor ad: house hunting as comedy.
// Emotion: joy (meme-able, shareable).
// Beat sheet (30s @ 30fps):
//   1. Hook   0-3s   "THE COMEDY SERIES CALLED HOUSE HUNTING" pulse  gold on dark
//   2. Joke   3-7s   "AGENT: 'JUST A SMALL ISSUE WITH THE ROOF'" slideUp white on dark
//   3. Punch  7-11s  "THE ROOF: *ABSENT*"                      zoomIn gold on dark
//   4. Turn   11-15s "14 'WONDERFUL' HOUSES LATER..."          fade   white on dark
//   5. Reveal 15-20s "RENTALHUB VERIFIES EVERY LISTING"        pulse  gold on blue
//   6. CTA    20-25s "RENTALHUB: LAUGH FOR REAL THIS TIME"     pulse  gold on dark
//   7. URL    25-30s "rentalhub.com.ng/download"               pulse  white on blue

const JoyAd1: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={3 * fps}>
        <TextSlide text="THE COMEDY SERIES CALLED HOUSE HUNTING" fontSize={54} bgColor={BG_DARK} color={GOLD} animation="pulse" fontWeight={900} />
      </Sequence>
      <Sequence from={3 * fps} durationInFrames={4 * fps}>
        <TextSlide text="AGENT: 'JUST A SMALL ISSUE WITH THE ROOF'" fontSize={52} bgColor={BG_DARK} animation="slideUp" fontWeight={700} />
      </Sequence>
      <Sequence from={7 * fps} durationInFrames={4 * fps}>
        <TextSlide text="THE ROOF: *ABSENT*" fontSize={72} bgColor={BG_DARK} color={GOLD} animation="zoomIn" fontWeight={900} />
      </Sequence>
      <Sequence from={11 * fps} durationInFrames={4 * fps}>
        <TextSlide text="14 'WONDERFUL' HOUSES LATER..." fontSize={52} bgColor={BG_DARK} animation="fade" />
      </Sequence>
      <Sequence from={15 * fps} durationInFrames={5 * fps}>
        <TextSlide text="RENTALHUB VERIFIES EVERY LISTING" fontSize={58} bgColor={BG_BLUE} color={GOLD} animation="pulse" fontWeight={800} />
      </Sequence>
      <Sequence from={20 * fps} durationInFrames={5 * fps}>
        <TextSlide text="RENTALHUB: LAUGH FOR REAL THIS TIME" fontSize={58} bgColor={BG_DARK} color={GOLD} animation="pulse" fontWeight={900} />
      </Sequence>
      <Sequence from={25 * fps} durationInFrames={5 * fps}>
        <TextSlide text="rentalhub.com.ng/download" fontSize={44} bgColor={BG_BLUE} animation="pulse" fontWeight={600} />
      </Sequence>
    </AbsoluteFill>
  );
};

export default JoyAd1;

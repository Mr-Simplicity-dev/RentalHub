import React from 'react';
import { Composition } from 'remotion';
import TextAd1 from './ads/TextAd1';
import TextAd2 from './ads/TextAd2';
import TextAd3 from './ads/TextAd3';
import TextAd4 from './ads/TextAd4';
import TextAd5 from './ads/TextAd5';
import CartoonAd1 from './ads/CartoonAd1';
import CartoonAd2 from './ads/CartoonAd2';
import CartoonAd3 from './ads/CartoonAd3';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TextAd1"
        component={TextAd1}
        durationInFrames={15 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="TextAd2"
        component={TextAd2}
        durationInFrames={20 * 30}
        fps={30}
        width={1200}
        height={630}
      />
      <Composition
        id="TextAd3"
        component={TextAd3}
        durationInFrames={10 * 30}
        fps={30}
        width={1200}
        height={675}
      />
      <Composition
        id="TextAd4"
        component={TextAd4}
        durationInFrames={15 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="TextAd5"
        component={TextAd5}
        durationInFrames={12 * 30}
        fps={30}
        width={1200}
        height={630}
      />
      <Composition
        id="CartoonAd1"
        component={CartoonAd1}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="CartoonAd2"
        component={CartoonAd2}
        durationInFrames={20 * 30}
        fps={30}
        width={1200}
        height={630}
      />
      <Composition
        id="CartoonAd3"
        component={CartoonAd3}
        durationInFrames={15 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
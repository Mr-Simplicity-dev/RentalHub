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
import AspirationAd1 from './ads/AspirationAd1';
import AspirationAd1F from './ads/AspirationAd1F';
import BelongingAd1 from './ads/BelongingAd1';
import BelongingAd1F from './ads/BelongingAd1F';
import JoyAd1 from './ads/JoyAd1';
import JoyAd1F from './ads/JoyAd1F';
import './fonts.css';
import { ScaledAd } from './components/ScaledAd';
import {
  SellTextAd1,
  SellTextAd2,
  SellTextAd3,
  SellTextAd4,
  SellTextAd5,
  SellCartoonAd1,
  SellCartoonAd2,
  SellCartoonAd3,
  SellUrgencyAd1,
  SellLandlordAd1,
} from './ads/SellAds';

const ScaledAspirationAd1: React.FC = () => (
  <ScaledAd><AspirationAd1 /></ScaledAd>
);
const ScaledAspirationAd1F: React.FC = () => (
  <ScaledAd><AspirationAd1F /></ScaledAd>
);

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
      <Composition
        id="AspirationAd1"
        component={AspirationAd1}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="BelongingAd1"
        component={BelongingAd1}
        durationInFrames={26 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="BelongingAd1F"
        component={BelongingAd1F}
        durationInFrames={26 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="JoyAd1"
        component={JoyAd1}
        durationInFrames={26 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="JoyAd1F"
        component={JoyAd1F}
        durationInFrames={26 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="AspirationAd1F"
        component={AspirationAd1F}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="AspirationAd1Square"
        component={ScaledAspirationAd1}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1080}
      />
      <Composition
        id="AspirationAd1Landscape"
        component={ScaledAspirationAd1}
        durationInFrames={30 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AspirationAd1FSquare"
        component={ScaledAspirationAd1F}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1080}
      />
      <Composition
        id="AspirationAd1FLandscape"
        component={ScaledAspirationAd1F}
        durationInFrames={30 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition id="SellTextAd1" component={SellTextAd1} durationInFrames={26 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellTextAd2" component={SellTextAd2} durationInFrames={26 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellTextAd3" component={SellTextAd3} durationInFrames={26 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellTextAd4" component={SellTextAd4} durationInFrames={30 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellTextAd5" component={SellTextAd5} durationInFrames={30 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellCartoonAd1" component={SellCartoonAd1} durationInFrames={30 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellCartoonAd2" component={SellCartoonAd2} durationInFrames={26 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellCartoonAd3" component={SellCartoonAd3} durationInFrames={31 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellUrgencyAd1" component={SellUrgencyAd1} durationInFrames={26 * 30} fps={30} width={1080} height={1920} />
      <Composition id="SellLandlordAd1" component={SellLandlordAd1} durationInFrames={26 * 30} fps={30} width={1080} height={1920} />
    </>
  );
};
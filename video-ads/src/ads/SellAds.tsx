import React from 'react';
import { VoiceAd } from '../components/VoiceAd';
import {
  sellText1,
  sellText2,
  sellText3,
  sellText4,
  sellText5,
  sellCartoon1,
  sellCartoon2,
  sellCartoon3,
  sellUrgency,
  sellLandlord,
} from './sellLines';

export const SellTextAd1: React.FC = () => <VoiceAd config={sellText1} />;
export const SellTextAd2: React.FC = () => <VoiceAd config={sellText2} />;
export const SellTextAd3: React.FC = () => <VoiceAd config={sellText3} />;
export const SellTextAd4: React.FC = () => <VoiceAd config={sellText4} />;
export const SellTextAd5: React.FC = () => <VoiceAd config={sellText5} />;
export const SellCartoonAd1: React.FC = () => <VoiceAd config={sellCartoon1} />;
export const SellCartoonAd2: React.FC = () => <VoiceAd config={sellCartoon2} />;
export const SellCartoonAd3: React.FC = () => <VoiceAd config={sellCartoon3} />;
export const SellUrgencyAd1: React.FC = () => <VoiceAd config={sellUrgency} />;
export const SellLandlordAd1: React.FC = () => <VoiceAd config={sellLandlord} />;

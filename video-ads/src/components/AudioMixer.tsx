import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';

type AudioMixerProps = {
  // Music bed loops for the whole ad, ducked under the voice.
  musicFile?: string;
  musicVolume?: number;
  // One-shot SFX at their frame positions.
  whooshAt?: number[];
  impactAt?: number[];
  dingAt?: number[];
  sfxVolume?: number;
};

const playAt = (frames: number[], src: string, volume: number) =>
  frames.map((frame) => (
    <Sequence key={`${src}-${frame}`} from={frame}>
      <Audio src={staticFile(src)} volume={volume} />
    </Sequence>
  ));

// Sound design layer. Every file is optional: drop a file into public/audio/
// with the expected name and it lights up; missing files are silent.
// Expected files: music.mp3 | whoosh.mp3 | impact.mp3 | ding.mp3
export const AudioMixer: React.FC<AudioMixerProps> = ({
  musicFile = 'audio/music.wav',
  musicVolume = 0.18,
  whooshAt = [],
  impactAt = [],
  dingAt = [],
  sfxVolume = 0.6,
}) => {
  return (
    <>
      <Audio src={staticFile(musicFile)} volume={musicVolume} loop />
      {playAt(whooshAt, 'audio/whoosh.wav', sfxVolume)}
      {playAt(impactAt, 'audio/impact.wav', sfxVolume)}
      {playAt(dingAt, 'audio/ding.wav', sfxVolume)}
    </>
  );
};

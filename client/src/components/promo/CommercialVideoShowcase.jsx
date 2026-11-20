import React, { useState, useRef, useEffect } from 'react';
import {
  FaPlay,
  FaPause,
  FaVolumeMute,
  FaVolumeUp,
  FaDownload,
  FaExpand,
  FaCheckCircle,
  FaFilm,
  FaDesktop,
  FaMobileAlt,
} from 'react-icons/fa';

const CLIPS = [
  {
    id: 'commercial_vertical',
    title: '9:16 Vertical Commercial',
    subtitle: 'Mobile social channels, Reels, Shorts & WhatsApp Status',
    videoSrc: '/promo/amana-app-tour-commercial.mp4',
    downloadName: 'amana-rentalhub-commercial-9x16.mp4',
    description:
      'Vertical corporate commercial combining Nigerian architectural cinematography with authentic Amana RentalHub interface screens, verification workflows, tracked rent payments, and digital tenancy records.',
    aspect: '9/16',
    resolution: '1080 × 1920',
    badge: '9:16 VERTICAL',
  },
  {
    id: 'commercial_landscape',
    title: '16:9 Widescreen Commercial',
    subtitle: 'Executive presentations, homepage hero & YouTube',
    videoSrc: '/promo/amana-app-tour-landscape.mp4',
    downloadName: 'amana-rentalhub-commercial-16x9.mp4',
    description:
      'Widescreen corporate presentation showcasing Amana RentalHub across property discovery, identity-verified enquiries, structured wallet clearing, versioned tenancy agreements, and property protection.',
    aspect: '16/9',
    resolution: '1280 × 720',
    badge: '16:9 WIDESCREEN',
  },
];

const CHAPTER_BREAKDOWN = [
  {
    startSec: 0,
    time: '0:00 – 0:09',
    title: 'Property Discovery Across Nigeria',
    desc: 'Structured search across 36 states and the FCT by location, bedroom count, and annual rent.',
  },
  {
    startSec: 8.6,
    time: '0:09 – 0:17',
    title: 'Listing Transparency & Verification',
    desc: 'Review property specifications, landlord verification indicators, media, and move-in cost estimates.',
  },
  {
    startSec: 17.2,
    time: '0:17 – 0:26',
    title: 'Identity-Verified Enquiries & Access',
    desc: 'Account identity verification before unlocking full property details and direct landlord communication.',
  },
  {
    startSec: 25.8,
    time: '0:26 – 0:34',
    title: 'Tracked Payments & Wallet Clearing',
    desc: 'Paystack and bank-transfer rent tracking with a 14-working-day clearing window and auditable ledger.',
  },
  {
    startSec: 34.4,
    time: '0:34 – 0:43',
    title: 'Digital Tenancy Agreements & Protection',
    desc: 'Versioned agreements with timestamped signature logs, SHA-256 hashing, and Property Protection records.',
  },
  {
    startSec: 43.0,
    time: '0:43 – 0:52',
    title: 'Amana RentalHub NG Brand Finale',
    desc: 'Official platform presentation and direct call to action at rentalhub.com.ng.',
  },
];

export default function CommercialVideoShowcase({ isStandalone = false }) {
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(51.8);
  const videoRef = useRef(null);

  const activeClip = CLIPS[activeClipIndex];
  const isWidescreen = activeClip.aspect === '16/9';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.load();
    setCurrentTime(0);
    setIsPlaying(false);
  }, [activeClipIndex]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        });
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const seekToChapter = (startSec) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(startSec, duration || startSec);
    setCurrentTime(startSec);
    if (!isPlaying) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if (video.webkitRequestFullscreen) {
      video.webkitRequestFullscreen();
    }
  };

  const formatTime = (secs) => {
    const safe = Number.isFinite(secs) && secs >= 0 ? secs : 0;
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeChapterIdx = CHAPTER_BREAKDOWN.reduce((found, ch, idx) => {
    if (currentTime >= ch.startSec) return idx;
    return found;
  }, 0);

  return (
    <section
      className={`w-full bg-[#071A3D] text-white ${isStandalone ? 'py-12' : 'py-14 border-t border-white/10'}`}
      aria-label="Official Amana RentalHub commercial videos"
    >
      <div className="container mx-auto max-w-7xl px-4">
        {/* Header */}
        <div className="mx-auto mb-9 max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E2C275]">
            Official Brand Commercials
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
            Amana RentalHub NG Product Commercial
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
            Available in 9:16 vertical and 16:9 widescreen masters—designed for institutional presentations, partner briefings, and digital channels.
          </p>
        </div>

        {/* Format Selector */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
          {CLIPS.map((clip, index) => {
            const isActive = index === activeClipIndex;
            const Icon = clip.aspect === '9/16' ? FaMobileAlt : FaDesktop;
            return (
              <button
                key={clip.id}
                type="button"
                onClick={() => setActiveClipIndex(index)}
                className={`inline-flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#C89B3C] ${
                  isActive
                    ? 'border-[#C89B3C] bg-white text-[#071A3D] font-semibold'
                    : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                <span>{clip.title}</span>
                <span
                  className={`font-mono text-[11px] ${
                    isActive ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  {clip.resolution}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Video & Editorial Grid */}
        <div
          className={`grid grid-cols-1 items-start gap-8 ${
            isWidescreen ? 'lg:grid-cols-12' : 'lg:grid-cols-12'
          }`}
        >
          {/* Left: Video Player Frame */}
          <div
            className={`flex flex-col items-center ${
              isWidescreen ? 'lg:col-span-7' : 'lg:col-span-5'
            }`}
          >
            <div
              className={`w-full overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl ${
                isWidescreen ? 'max-w-3xl' : 'max-w-[340px]'
              }`}
            >
              <div
                className={`relative w-full cursor-pointer bg-slate-950 ${
                  isWidescreen ? 'aspect-video' : 'aspect-[9/16]'
                }`}
                onClick={togglePlay}
              >
                <video
                  ref={videoRef}
                  src={activeClip.videoSrc}
                  className="h-full w-full object-cover"
                  playsInline
                  muted={isMuted}
                  preload="metadata"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                />

                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#071A3D]/35 transition-colors hover:bg-[#071A3D]/25">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#E2C275]/60 bg-[#071A3D]/90 text-white shadow-lg">
                      <FaPlay className="ml-1" size={20} aria-hidden="true" />
                    </span>
                  </div>
                )}
              </div>

              {/* Clean Video Transport Controls */}
              <div className="border-t border-white/10 bg-[#051430] px-4 py-3">
                <div className="mb-2.5 flex items-center gap-3">
                  <span className="font-mono text-[11px] tabular-nums text-slate-300">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={duration || 48}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    aria-label="Seek video timeline"
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-[#C89B3C]"
                  />
                  <span className="font-mono text-[11px] tabular-nums text-slate-300">
                    {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? 'Pause video' : 'Play video'}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
                    >
                      {isPlaying ? <FaPause size={11} /> : <FaPlay size={11} className="ml-0.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleMute}
                      aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/5 text-slate-200 transition-colors hover:bg-white/15 hover:text-white"
                    >
                      {isMuted ? <FaVolumeMute size={12} /> : <FaVolumeUp size={12} />}
                    </button>
                    <span className="hidden text-xs text-slate-400 sm:inline">
                      {isMuted ? 'Sound muted' : 'Narration & score'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={activeClip.videoSrc}
                      download={activeClip.downloadName}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#C89B3C]/50 bg-[#C89B3C]/15 px-3 text-xs font-semibold text-[#E2C275] transition-colors hover:bg-[#C89B3C]/25"
                    >
                      <FaDownload size={10} aria-hidden="true" />
                      <span>Download MP4</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleFullscreen}
                      aria-label="Fullscreen video"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/5 text-slate-200 transition-colors hover:bg-white/15 hover:text-white"
                    >
                      <FaExpand size={11} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Overview & Synchronized Chapter Breakdown */}
          <div className={`space-y-6 ${isWidescreen ? 'lg:col-span-5' : 'lg:col-span-7'}`}>
            <div className="rounded-xl border border-white/10 bg-[#0C244E] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E2C275]">
                    {activeClip.badge}
                  </span>
                  <h3 className="mt-1 text-xl font-semibold text-white">{activeClip.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-300">{activeClip.subtitle}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-200">
                  <FaFilm size={11} className="text-[#E2C275]" aria-hidden="true" />
                  {activeClip.resolution} · MP4
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-200">{activeClip.description}</p>

              {/* Chapter Sequence */}
              <div className="mt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Commercial Sequence (select a chapter to jump)
                </p>
                <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-[#071A3D]/60">
                  {CHAPTER_BREAKDOWN.map((chapter, idx) => {
                    const isCurrent = idx === activeChapterIdx;
                    return (
                      <button
                        key={chapter.time}
                        type="button"
                        onClick={() => seekToChapter(chapter.startSec)}
                        className={`flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/5 ${
                          isCurrent ? 'bg-white/10' : ''
                        }`}
                      >
                        <span
                          className={`mt-0.5 shrink-0 font-mono text-[11px] tabular-nums ${
                            isCurrent ? 'font-semibold text-[#E2C275]' : 'text-slate-400'
                          }`}
                        >
                          {chapter.time}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white">{chapter.title}</p>
                          <p className="mt-0.5 text-xs leading-5 text-slate-300">{chapter.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Platform Accuracy & Standards Note */}
            <div className="rounded-xl border border-white/10 bg-[#051430] p-5">
              <div className="flex items-start gap-3">
                <FaCheckCircle className="mt-0.5 shrink-0 text-[#E2C275]" size={15} aria-hidden="true" />
                <div className="text-xs leading-5 text-slate-300">
                  <p className="font-semibold text-white">Accurate Platform Representation</p>
                  <p className="mt-1">
                    Every workflow depicted corresponds to active Amana RentalHub NG modules—property search, identity-verified enquiries, Paystack and bank-transfer wallet clearing, versioned tenancy agreements, and Property Protection records. Service availability and applicable fees are displayed transparently prior to confirmation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

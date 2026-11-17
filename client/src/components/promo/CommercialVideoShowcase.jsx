import React, { useState, useRef, useEffect } from 'react';
import { FaPlay, FaPause, FaVolumeMute, FaVolumeUp, FaDownload, FaExpand, FaCheckCircle, FaMusic, FaClosedCaptioning, FaShieldAlt, FaStar, FaVideo } from 'react-icons/fa';

const CLIPS = [
  {
    id: 'path1_vertical',
    title: 'App Tour Commercial (9:16 Social)',
    subtitle: 'TikTok, Reels, Shorts & WhatsApp Status',
    musicGenre: 'Mastered Voiceover + Track 01 (Happy)',
    videoSrc: '/promo/amana-app-tour-commercial.mp4',
    description: '100% in-engine 30fps kinetic smartphone product demo showcasing smart Abuja/Kano search, verified property cards, animated water/power ratings, one-tap inspection booking, and escrow protection.',
    duration: '48.5s',
    aspect: '9/16',
    badge: '9:16 VERTICAL',
  },
  {
    id: 'path1_landscape',
    title: 'App Tour Commercial (16:9 Broadcast)',
    subtitle: 'Homepage Hero, YouTube & Presentations',
    musicGenre: 'Mastered Voiceover + Track 01 (Happy)',
    videoSrc: '/promo/amana-app-tour-landscape.mp4',
    description: 'Widescreen 16:9 split-stage commercial pairing our floating 3D smartphone UI walkthrough with synchronized Abuja FCT & Kano verification callouts.',
    duration: '48.5s',
    aspect: '16/9',
    badge: '16:9 WIDESCREEN',
  },
];

const FLAGSHIP_BREAKDOWN = [
  { time: '0:00 - 0:07.5', title: 'Act 1: Smart Verification Search', desc: 'Character-by-character typing for Maitama, Abuja FCT, amenity filter chips, and live verification radar.' },
  { time: '0:07.5 - 0:16', title: 'Act 2: Verified Abuja & Kano Cards', desc: 'Spring-animated Maitama (₦4.5M/yr) and Nasarawa GRA Kano (₦3.2M/yr) cards with vetted landlord badges.' },
  { time: '0:16 - 0:24.5', title: 'Act 3: Transparent Tenant Reviews', desc: 'Live progress meters filling for Water Supply (5.0/5), Electricity (4.9/5), and Gated Security (5.0/5).' },
  { time: '0:24.5 - 0:32.5', title: 'Act 4: One-Tap Inspection Booking', desc: 'Instant booking confirmation showing Tomorrow 10:30 AM and ₦0.00 Zero Fee Extortion.' },
  { time: '0:32.5 - 0:40.5', title: 'Act 5: Encrypted Escrow & Lease', desc: 'Golden padlock seal locking in Handover Guarantee and Instant Legal Tenancy Agreement.' },
  { time: '0:40.5 - 0:48.5', title: 'Act 6: Brand Finale & CTA', desc: 'Google Play, App Store, rentalhub.com.ng banner, and direct Abuja/Kano WhatsApp Concierge.' },
];

export default function CommercialVideoShowcase({ isStandalone = false }) {
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(10);
  const videoRef = useRef(null);

  const activeClip = CLIPS[activeClipIndex];
  const isWidescreen = activeClip.aspect === '16/9';

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
      });
    }
  }, [activeClipIndex]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      }
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <section className={`w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white ${isStandalone ? 'py-12' : 'py-16'}`}>
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-semibold tracking-wide uppercase mb-4 shadow-sm">
            <FaStar className="text-amber-400" />
            Official Rendered Video Masters
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
            Amana RentalHub <span className="bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">Product Tour Commercials</span>
          </h2>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
            100% code-rendered kinetic UI commercials in both 9:16 mobile vertical and 16:9 widescreen formats — built exclusively around Abuja FCT and Kano verified listings.
          </p>
        </div>

        {/* Clip Selection Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8">
          {CLIPS.map((clip, index) => {
            const isActive = index === activeClipIndex;
            return (
              <button
                key={clip.id}
                type="button"
                onClick={() => setActiveClipIndex(index)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20 scale-105'
                    : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {clip.id === 'path1_vertical' ? (
                  <FaStar className={isActive ? 'text-slate-950' : 'text-amber-400'} />
                ) : (
                  <FaMusic className={isActive ? 'text-slate-950' : 'text-emerald-400'} />
                )}
                <span>{clip.title}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                  isActive ? 'bg-slate-950 text-amber-300' : 'bg-slate-900 text-slate-400'
                }`}>
                  {clip.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Video Player Display Container */}
        <div className="flex flex-col items-center mb-10">
          <div className={`relative w-full ${isWidescreen ? 'max-w-4xl' : 'max-w-[360px] sm:max-w-[380px]'} bg-slate-950 p-3 sm:p-4 rounded-[36px] border-4 border-slate-700 shadow-2xl shadow-amber-950/30 ring-1 ring-white/10 transition-all duration-300`}>
            
            {/* Phone Notch for vertical cuts */}
            {!isWidescreen && (
              <div className="absolute top-5 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-900 rounded-full z-20 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-800 mr-2" />
                <div className="w-8 h-1.5 rounded-full bg-slate-800" />
              </div>
            )}

            {/* Video Frame */}
            <div className={`relative w-full ${isWidescreen ? 'aspect-[16/9]' : 'aspect-[9/16]'} bg-black rounded-[26px] overflow-hidden group shadow-inner`}>
              <video
                ref={videoRef}
                src={activeClip.videoSrc}
                className="w-full h-full object-cover"
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
              />

              {/* Overlaid Play Button */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-amber-500/95 text-slate-950 flex items-center justify-center shadow-xl shadow-black/60 transition-transform hover:scale-110 focus:outline-none"
                  aria-label="Play video"
                >
                  <FaPlay className="text-xl ml-1" />
                </button>
              )}

              {/* Bottom Quick Controls Bar */}
              <div className="absolute bottom-3 left-3 right-3 bg-slate-950/85 backdrop-blur-md rounded-2xl p-2.5 border border-white/10 flex items-center gap-3 z-20">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-2 text-white hover:text-amber-400 transition"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <FaPause /> : <FaPlay className="ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className={`p-2 transition ${isMuted ? 'text-amber-400' : 'text-white hover:text-amber-400'}`}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                </button>

                <div className="flex-1 flex flex-col justify-center">
                  <input
                    type="range"
                    min="0"
                    max={duration || 10}
                    step="0.05"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFullscreen}
                  className="p-2 text-white hover:text-amber-400 transition"
                  aria-label="Fullscreen"
                >
                  <FaExpand />
                </button>
              </div>
            </div>
          </div>

          {/* Download & Spec Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a
              href={activeClip.videoSrc}
              download={`${activeClip.id}.mp4`}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-md transition-all hover:scale-105"
            >
              <FaDownload />
              Download {activeClip.title} ({isWidescreen ? '16:9 Landscape' : '9:16 Vertical'})
            </a>
            <span className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              Format: {isWidescreen ? '1280×720 HD (16:9)' : '1080×1920 Full HD (9:16)'} • H.264 / AAC
            </span>
          </div>
        </div>

        {/* Detailed Breakdown Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Creative Overview */}
          <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <FaVideo className="text-amber-400 text-xl" />
              <h3 className="text-xl font-bold text-white">Visual Production Standards</h3>
            </div>
            
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              {activeClip.description}
            </p>

            <div className="space-y-3 pt-3 border-t border-slate-800 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
                <FaCheckCircle className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">30fps Kinetic UI Animation</strong>
                  Every frame renders crisp vector search typing, animated meter bars, tap ripples, and escrow lock motion with zero static photo slides.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
                <FaCheckCircle className="text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Abuja FCT &amp; Kano Exclusive Focus</strong>
                  Highlights Maitama, Wuse 2, Garki, Gwarinpa, and Nasarawa GRA Kano with verified inspections and zero agent extortion.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
                <FaCheckCircle className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Mastered Studio Audio Mix</strong>
                  Full 47.2s unclipped narration paired with ducked royalty-free soundtrack presets in AAC 44.1kHz stereo.
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Screenplay & Shot Breakdown */}
          <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FaClosedCaptioning className="text-amber-400" />
                <h4 className="text-lg font-bold text-white">Scene-by-Scene Shot Analysis</h4>
              </div>
              <span className="text-xs text-slate-400">Broadcast Ready</span>
            </div>

            <div className="space-y-2.5">
              {FLAGSHIP_BREAKDOWN.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80"
                >
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono text-xs font-semibold">
                    {item.time}
                  </span>
                  <div>
                    <h5 className="text-xs font-semibold text-white">{item.title}</h5>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

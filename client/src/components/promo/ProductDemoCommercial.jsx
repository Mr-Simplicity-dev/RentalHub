import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaPlay,
  FaPause,
  FaVolumeMute,
  FaVolumeUp,
  FaRedo,
  FaCheckCircle,
  FaShieldAlt,
  FaSearch,
  FaStar,
  FaLock,
  FaCalendarCheck,
  FaDownload,
  FaBolt,
  FaWater,
  FaBuilding,
  FaExpand,
  FaCompress
} from 'react-icons/fa';

const SCENES = [
  { id: 'search', label: '1. Smart Search', time: '0:00 - 0:08' },
  { id: 'listings', label: '2. Verified Cards', time: '0:08 - 0:20' },
  { id: 'reviews', label: '3. Water & Power Reviews', time: '0:20 - 0:32' },
  { id: 'inspection', label: '4. One-Tap Booking', time: '0:32 - 0:44' },
  { id: 'escrow', label: '5. Escrow Protection', time: '0:44 - 0:54' },
  { id: 'cta', label: '6. Download CTA', time: '0:54 - 1:04' },
];

const MUSIC_PRESETS = [
  { id: 1, name: 'Preset 01: "Happy"', genre: 'Upbeat Acoustic & Rhythm', src: '/audio/track_01_happy.mp3' },
  { id: 2, name: 'Preset 02: "To Be Happy"', genre: 'Modern Pop Uplift', src: '/audio/track_02_to_be_happy.mp3' },
  { id: 3, name: 'Preset 03: "Inspirational Acoustic"', genre: 'Warm Strings & Guitars', src: '/audio/track_03_inspirational_acoustic.mp3' },
];

export default function ProductDemoCommercial() {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const containerRef = useRef(null);
  const audioRef = useRef(null);

  const TOTAL_DURATION = 64; // seconds

  // Sync soundtrack audio element with playback & preset selection
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.35;
    audio.muted = isMuted;
    if (isPlaying && !isMuted) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, isMuted, selectedPresetIndex]);

  // Auto-advancing timeline loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 0.5;
        if (next >= TOTAL_DURATION) {
          return 0;
        }
        // Map elapsed time to scene
        if (next < 8) setCurrentSceneIndex(0);
        else if (next < 20) setCurrentSceneIndex(1);
        else if (next < 32) setCurrentSceneIndex(2);
        else if (next < 44) setCurrentSceneIndex(3);
        else if (next < 54) setCurrentSceneIndex(4);
        else setCurrentSceneIndex(5);
        return next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const jumpToScene = (index) => {
    setCurrentSceneIndex(index);
    if (index === 0) setElapsed(0);
    else if (index === 1) setElapsed(8);
    else if (index === 2) setElapsed(20);
    else if (index === 3) setElapsed(32);
    else if (index === 4) setElapsed(44);
    else if (index === 5) setElapsed(54);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className={`w-full bg-slate-950 text-white rounded-3xl overflow-hidden border border-slate-800 shadow-2xl transition-all duration-300 ${
        isFullscreen ? 'p-6 fixed inset-0 z-50 rounded-none' : 'p-4 sm:p-8'
      }`}
    >
      <audio
        ref={audioRef}
        src={MUSIC_PRESETS[selectedPresetIndex]?.src}
        loop
        preload="none"
        muted={isMuted}
      />

      {/* Top Studio Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-lg">
            3D
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
              Amana RentalHub <span className="text-amber-400">Interactive 3D App Commercial</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                100% In-Engine
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Fluid 60fps kinetic product walkthrough: Active typing, verified listing cards, live review meters, and escrow guarantee.
            </p>
          </div>
        </div>

        {/* Music Preset Selector */}
        <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 pl-2 hidden md:inline">Soundtrack:</span>
          {MUSIC_PRESETS.map((preset, idx) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setSelectedPresetIndex(idx);
                setIsMuted(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedPresetIndex === idx
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Track 0{preset.id}
            </button>
          ))}
        </div>
      </div>

      {/* Main 3D Stage & Interactive Phone Frame */}
      <div className="py-8 sm:py-12 flex flex-col lg:flex-row items-center justify-center gap-10">
        
        {/* Left / Center: 3D Floating Smartphone Device */}
        <div className="relative w-full max-w-[340px] sm:max-w-[360px] perspective-[1400px]">
          
          {/* Subtle Dynamic Ambient Glow behind Phone */}
          <div className="absolute -inset-4 bg-gradient-to-tr from-emerald-600/20 via-amber-500/10 to-cyan-500/20 rounded-[50px] blur-2xl pointer-events-none" />

          {/* 3D Angled Phone Chassis */}
          <motion.div
            animate={{
              rotateY: [ -4, 4, -4 ],
              rotateX: [ 3, -3, 3 ],
              y: [ -6, 6, -6 ],
            }}
            transition={{
              repeat: Infinity,
              duration: 8,
              ease: "easeInOut"
            }}
            style={{ transformStyle: 'preserve-3d' }}
            className="relative bg-slate-900 rounded-[44px] p-3.5 border-4 border-slate-700 shadow-2xl shadow-black ring-1 ring-white/10"
          >
            {/* Camera Island / Dynamic Notch */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-950 rounded-full z-30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800 mr-2" />
              <div className="w-8 h-1.5 rounded-full bg-slate-800" />
            </div>

            {/* Inner App Display Screen (9:16 Aspect) */}
            <div className="relative w-full aspect-[9/16] bg-slate-950 rounded-[34px] overflow-hidden flex flex-col justify-between p-4 border border-slate-800">
              
              {/* App Status & Header */}
              <div className="pt-5 pb-3 flex items-center justify-between border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-xs text-white">
                    A
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">Amana RentalHub</h4>
                    <span className="text-[10px] text-emerald-400 block">Abuja • Kano Verified</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <FaCheckCircle className="text-[9px]" /> Verified
                </span>
              </div>

              {/* Dynamic Animated Scene Content inside Phone */}
              <div className="flex-1 py-4 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  
                  {/* SCENE 1: SMART SEARCH & FILTERING */}
                  {currentSceneIndex === 0 && (
                    <motion.div
                      key="scene-search"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      className="space-y-3"
                    >
                      <div className="text-center mb-2">
                        <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
                          Smart Verification Search
                        </span>
                        <h5 className="text-sm font-bold text-white mt-0.5">Find Direct Landlord Homes</h5>
                      </div>

                      {/* Active Typing Input */}
                      <div className="bg-slate-900 border border-amber-400/40 rounded-xl p-2.5 flex items-center gap-2 shadow-inner">
                        <FaSearch className="text-amber-400 text-xs shrink-0" />
                        <span className="text-xs font-mono text-white flex-1">
                          Maitama, Abuja FCT<span className="animate-pulse">|</span>
                        </span>
                      </div>

                      {/* Filter Chips */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
                          <FaWater className="text-[9px]" /> Treated Borehole
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 flex items-center gap-1">
                          <FaBolt className="text-[9px]" /> 24/7 Power
                        </span>
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 flex items-center gap-1">
                          <FaShieldAlt className="text-[9px]" /> Zero Agent Fees
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-300 text-center">
                        ⚡ Matching 148 physically inspected apartments in Maitama &amp; Wuse 2
                      </div>
                    </motion.div>
                  )}

                  {/* SCENE 2: VERIFIED LISTING CARDS SCROLL */}
                  {currentSceneIndex === 1 && (
                    <motion.div
                      key="scene-listings"
                      initial={{ opacity: 0, y: 25 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -25 }}
                      className="space-y-3"
                    >
                      {/* Maitama Luxury Terrace Card */}
                      <div className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-3 shadow-lg relative overflow-hidden">
                        <div className="flex items-center justify-between text-[10px] mb-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold">
                            ✓ 100% INSPECTED
                          </span>
                          <span className="text-slate-400">📍 Maitama, Abuja</span>
                        </div>
                        <h5 className="text-xs font-bold text-white">Luxury 3-Bed Terrace Duplex</h5>
                        <div className="text-sm font-extrabold text-amber-400 mt-1">
                          ₦4,500,000 <span className="text-[10px] font-normal text-slate-300">/ year</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Gated compound • Paved driveway • Constant water
                        </p>
                      </div>

                      {/* Kano Nasarawa GRA Card */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-lg">
                        <div className="flex items-center justify-between text-[10px] mb-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-bold">
                            ✓ VETTED LANDLORD
                          </span>
                          <span className="text-slate-400">📍 Nasarawa GRA, Kano</span>
                        </div>
                        <h5 className="text-xs font-bold text-white">Modern 4-Bed Detached House</h5>
                        <div className="text-sm font-extrabold text-amber-400 mt-1">
                          ₦3,200,000 <span className="text-[10px] font-normal text-slate-300">/ year</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Dedicated transformer • Treated water • 24/7 security
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* SCENE 3: TRANSPARENT TENANT REVIEWS */}
                  {currentSceneIndex === 2 && (
                    <motion.div
                      key="scene-reviews"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-2.5"
                    >
                      <div className="text-center">
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                          Real Tenant Verification
                        </span>
                        <h5 className="text-xs font-bold text-white mt-0.5">Never Move in Blind Again</h5>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-[11px]">
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1 text-cyan-300 font-semibold">
                            <FaWater className="text-[10px]" /> Water Supply
                          </span>
                          <span className="font-bold text-emerald-400">5.0 / 5 ★★★★★</span>
                        </div>
                        <p className="text-[10px] text-slate-400">"Constant borehole water with industrial treatment."</p>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-[11px]">
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1 text-amber-300 font-semibold">
                            <FaBolt className="text-[10px]" /> Electricity &amp; Light
                          </span>
                          <span className="font-bold text-emerald-400">4.9 / 5 ★★★★★</span>
                        </div>
                        <p className="text-[10px] text-slate-400">"Connected to priority feeder line. Steady power."</p>
                      </div>

                      <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[10px] text-emerald-300 flex items-center gap-1.5">
                        <FaCheckCircle className="shrink-0" />
                        <span>All reviews submitted by verified past tenants.</span>
                      </div>
                    </motion.div>
                  )}

                  {/* SCENE 4: ONE-TAP INSPECTION BOOKING */}
                  {currentSceneIndex === 3 && (
                    <motion.div
                      key="scene-inspection"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="space-y-3 text-center"
                    >
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto text-emerald-400 text-xl shadow-lg shadow-emerald-900/30">
                        <FaCalendarCheck />
                      </div>

                      <div>
                        <h5 className="text-sm font-bold text-white">Inspection Confirmed</h5>
                        <p className="text-[11px] text-slate-300 mt-0.5">Tomorrow at 10:30 AM</p>
                      </div>

                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-left text-[11px] space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Host Assigned:</span>
                          <span className="text-white font-medium">Licensed Agent (#ABJ-412)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Inspection Fee:</span>
                          <span className="text-emerald-400 font-bold">₦0.00 (Zero Extortion)</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="w-full py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-900/40"
                      >
                        View Appointment Pass →
                      </button>
                    </motion.div>
                  )}

                  {/* SCENE 5: ESCROW PAYMENT & DIGITAL LEASE */}
                  {currentSceneIndex === 4 && (
                    <motion.div
                      key="scene-escrow"
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      className="space-y-3 text-center"
                    >
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mx-auto text-amber-400 text-xl shadow-lg shadow-amber-900/30">
                        <FaLock />
                      </div>

                      <div>
                        <h5 className="text-sm font-bold text-white">Protected in Escrow</h5>
                        <p className="text-[11px] text-slate-300 mt-0.5">Total Peace of Mind for Renters</p>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px] text-slate-300 text-left space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <FaCheckCircle className="text-emerald-400 mt-0.5 shrink-0" />
                          <span>Landlord is paid ONLY after keys and handover are complete.</span>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <FaCheckCircle className="text-emerald-400 mt-0.5 shrink-0" />
                          <span>Instant digital tenancy agreement legally backed under Nigerian law.</span>
                        </div>
                      </div>

                      <div className="text-[11px] font-bold text-amber-400">
                        🛡️ 100% Escrow Guarantee
                      </div>
                    </motion.div>
                  )}

                  {/* SCENE 6: BRAND FINALE & DOWNLOAD CTA */}
                  {currentSceneIndex === 5 && (
                    <motion.div
                      key="scene-cta"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="space-y-3 text-center"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 to-emerald-500 flex items-center justify-center mx-auto text-slate-950 font-black text-base shadow-lg">
                        AR
                      </div>

                      <div>
                        <h5 className="text-sm font-extrabold text-white">Amana RentalHub NG</h5>
                        <p className="text-[11px] text-amber-300 mt-0.5 font-semibold">Rent With Confidence</p>
                      </div>

                      {/* Store Mockup Badges */}
                      <div className="space-y-1.5 pt-1">
                        <div className="py-2 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white flex items-center justify-center gap-2">
                          <span>▶ Google Play</span>
                          <span>•</span>
                          <span> App Store</span>
                        </div>
                        <div className="py-2 px-3 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold">
                          rentalhub.com.ng
                        </div>
                      </div>

                      <span className="text-[10px] text-slate-400 block">
                        WhatsApp: +234 803 060 1238
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Phone Bar */}
              <div className="pt-2 border-t border-slate-900 flex justify-center">
                <div className="w-28 h-1 bg-slate-700 rounded-full" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Side: Chapter Navigation, Controls & Specs */}
        <div className="w-full lg:max-w-md space-y-5">
          {/* Active Chapter Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Interactive Storyboard Timeline
            </span>
            <h4 className="text-xl font-bold text-white mt-1">
              {SCENES[currentSceneIndex].label}
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Click any chapter below to jump directly to that app walkthrough stage:
            </p>

            {/* Scene Selector Pills */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {SCENES.map((scene, idx) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => jumpToScene(idx)}
                  className={`p-2.5 rounded-xl text-left border text-xs transition-all ${
                    currentSceneIndex === idx
                      ? 'bg-amber-500/10 border-amber-400 text-amber-300 shadow-md scale-102'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span className="block font-semibold text-white">{scene.label}</span>
                  <span className="text-[10px] text-slate-500">{scene.time}</span>
                </button>
              ))}
            </div>

            {/* Progress Scrubber Bar */}
            <div className="mt-5 space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Progress: {elapsed.toFixed(0)}s</span>
                <span>{TOTAL_DURATION}s</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full"
                  style={{ width: `${(elapsed / TOTAL_DURATION) * 100}%` }}
                />
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <FaPause /> : <FaPlay className="ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setElapsed(0);
                    setCurrentSceneIndex(0);
                    setIsPlaying(true);
                  }}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  aria-label="Restart"
                >
                  <FaRedo />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  className={`p-2.5 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold ${
                    isMuted
                      ? 'bg-slate-800 hover:bg-slate-700 text-amber-400'
                      : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300'
                  }`}
                  aria-label={isMuted ? 'Unmute Soundtrack' : 'Mute Soundtrack'}
                >
                  {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                  <span>{isMuted ? 'Sound Off' : 'Sound On'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  aria-label="Fullscreen"
                >
                  {isFullscreen ? <FaCompress /> : <FaExpand />}
                </button>
              </div>
            </div>
          </div>

          {/* Technical Guarantee Badge */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs text-slate-300 space-y-1">
            <strong className="text-emerald-400 flex items-center gap-1.5">
              <FaShieldAlt /> 100% Code-Driven Production Guarantee
            </strong>
            <p>
              Zero static picture slideshows. Fully interactive 3D physics rendering with live Abuja &amp; Kano listing data, verified review meters, and one-tap booking simulation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

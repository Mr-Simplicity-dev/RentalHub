import React, { useEffect, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaChevronDown,
  FaChevronUp,
  FaDesktop,
  FaDownload,
  FaExpand,
  FaFilm,
  FaMobileAlt,
  FaPause,
  FaPlay,
  FaRedo,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';

const EDITIONS = [
  {
    id: 'flagship',
    shortLabel: 'Flagship Overview',
    title: 'Amana RentalHub NG — Flagship Product Commercial',
    badge: 'Flagship Edition · Corporate Navy Banner',
    designStyle: 'Executive Navy Top Banner & Gold Editorial Lower-Third',
    soundtrack: 'Corporate Inspiring (fade-in/out & narration ducking)',
    cardPoster: '/promo-videos/posters/flagship-16x9.jpg',
    summary:
      'Complete institutional overview spanning nationwide property search, verified listing details, identity-checked enquiries, 14-working-day escrow clearing, versioned tenancy agreements, and Property Protection.',
    formats: {
      vertical: {
        label: '9:16 Vertical Commercial',
        subtitle: 'Mobile, Instagram Reels, TikTok & WhatsApp Status',
        resolution: '1080 × 1920',
        aspect: '9/16',
        videoSrc: '/promo-videos/amana-app-tour-commercial.mp4',
        posterSrc: '/promo-videos/posters/flagship-9x16.jpg',
        downloadName: 'amana-app-tour-9x16.mp4',
      },
      landscape: {
        label: '16:9 Widescreen Commercial',
        subtitle: 'Partner Briefings, Presentations & Desktop Channels',
        resolution: '1280 × 720',
        aspect: '16/9',
        videoSrc: '/promo-videos/amana-app-tour-landscape.mp4',
        posterSrc: '/promo-videos/posters/flagship-16x9.jpg',
        downloadName: 'amana-app-tour-16x9.mp4',
      },
    },
    defaultDuration: 59,
    chapters: [
      {
        startSec: 0,
        time: '0:00 – 0:10',
        title: 'Structured Nationwide Property Search',
        desc: 'Filter residential listings across Nigeria by state, budget, property type, and verification status.',
      },
      {
        startSec: 10,
        time: '0:10 – 0:20',
        title: 'Property Detail & Verification Status',
        desc: 'Inspect structured room specs, amenities, clear pricing, and platform verification indicators.',
      },
      {
        startSec: 20,
        time: '0:20 – 0:30',
        title: 'Identity-Verified Enquiries & Unlock',
        desc: 'Account verification and transparent unlock controls before sharing full addresses and landlord contacts.',
      },
      {
        startSec: 30,
        time: '0:30 – 0:40',
        title: 'Escrow Rent Clearing & Wallet Ledger',
        desc: 'Escrow-tracked rent payments and bank transfers with a 14-working-day clearing window and auditable ledger.',
      },
      {
        startSec: 40,
        time: '0:40 – 0:50',
        title: 'Digital Tenancy Agreements & Protection',
        desc: 'Versioned tenancy agreement workflows alongside Amana Property Protection records.',
      },
      {
        startSec: 50,
        time: '0:50 – 0:59',
        title: 'Amana RentalHub NG Brand Finale',
        desc: 'Official platform presentation and direct call to action at rentalhub.com.ng.',
      },
    ],
  },
  {
    id: 'tenant',
    shortLabel: 'Tenant Edition',
    title: 'Tenant Edition — Discovery to Escrow Protection',
    badge: 'Edition 02 · Daylight Editorial Magazine',
    designStyle: 'Architectural Split-Canvas Ivory & Navy Editorial',
    soundtrack: 'Acoustic Corporate (fade-in/out & narration ducking)',
    cardPoster: '/promo-videos/posters/tenant-16x9.jpg',
    summary:
      'Designed for Nigerian renters—demonstrating transparent search filters, structured property specs, identity-verified access unlock, 14-working-day escrow clearing, and versioned digital leases.',
    formats: {
      vertical: {
        label: '9:16 Vertical Commercial',
        subtitle: 'Tenant Mobile & Social Distribution',
        resolution: '1080 × 1920',
        aspect: '9/16',
        videoSrc: '/promo-videos/amana-tenant-commercial-9x16.mp4',
        posterSrc: '/promo-videos/posters/tenant-9x16.jpg',
        downloadName: 'amana-tenant-edition-9x16.mp4',
      },
      landscape: {
        label: '16:9 Widescreen Commercial',
        subtitle: 'Desktop, Web & Tenant Orientation Screens',
        resolution: '1280 × 720',
        aspect: '16/9',
        videoSrc: '/promo-videos/amana-tenant-commercial-16x9.mp4',
        posterSrc: '/promo-videos/posters/tenant-16x9.jpg',
        downloadName: 'amana-tenant-edition-16x9.mp4',
      },
    },
    defaultDuration: 42,
    chapters: [
      {
        startSec: 0,
        time: '0:00 – 0:08',
        title: 'Nationwide Residential Search',
        desc: 'Filter homes across all 36 states and FCT by city, budget, bedrooms, and verification status.',
      },
      {
        startSec: 8,
        time: '0:08 – 0:17',
        title: 'Structured Listing Specifications',
        desc: 'Review verified indicators, inspection media availability, and annual rent upfront.',
      },
      {
        startSec: 17,
        time: '0:17 – 0:25',
        title: 'Identity Checks & Direct Access',
        desc: 'Complete account verification and unlock full address details and in-platform communication.',
      },
      {
        startSec: 25,
        time: '0:25 – 0:34',
        title: 'Escrow-Tracked Rent Clearing',
        desc: 'Rent payments pass through a structured 14-working-day escrow clearing window with refund review eligibility.',
      },
      {
        startSec: 34,
        time: '0:34 – 0:42',
        title: 'Digital Lease & Move-In Tools',
        desc: 'Review and sign versioned agreements online and access optional relocation and fumigation bookings.',
      },
    ],
  },
  {
    id: 'landlord',
    shortLabel: 'Landlord & Agent Edition',
    title: 'Landlord & Accredited Agent Edition — Portfolio Command',
    badge: 'Edition 03 · Institutional Command Showcase',
    designStyle: 'Obsidian Navy Gold-Framed Portfolio Dashboard',
    soundtrack: 'An Inspiring Corporate (fade-in/out & narration ducking)',
    cardPoster: '/promo-videos/posters/landlord-16x9.jpg',
    summary:
      'Built for property owners and accredited agents—highlighting multi-property portfolio publishing, screened enquiries, scoped agent delegation, escrow clearing to bank withdrawals, and versioned leases.',
    formats: {
      vertical: {
        label: '9:16 Vertical Commercial',
        subtitle: 'Landlord & Accredited Agent Mobile Channels',
        resolution: '1080 × 1920',
        aspect: '9/16',
        videoSrc: '/promo-videos/amana-landlord-commercial-9x16.mp4',
        posterSrc: '/promo-videos/posters/landlord-9x16.jpg',
        downloadName: 'amana-landlord-agent-9x16.mp4',
      },
      landscape: {
        label: '16:9 Widescreen Commercial',
        subtitle: 'Owner Briefings, Estate Meetings & Widescreen Displays',
        resolution: '1280 × 720',
        aspect: '16/9',
        videoSrc: '/promo-videos/amana-landlord-commercial-16x9.mp4',
        posterSrc: '/promo-videos/posters/landlord-16x9.jpg',
        downloadName: 'amana-landlord-agent-16x9.mp4',
      },
    },
    defaultDuration: 42,
    chapters: [
      {
        startSec: 0,
        time: '0:00 – 0:08',
        title: 'Institutional Property Presentation',
        desc: 'Publish structured specifications, inspection media, and verified owner profiles in one workspace.',
      },
      {
        startSec: 8,
        time: '0:08 – 0:17',
        title: 'Identity-Checked Tenant Enquiries',
        desc: 'Protect full property addresses until prospective tenants complete verification and unlock access.',
      },
      {
        startSec: 17,
        time: '0:17 – 0:25',
        title: 'Accredited Agent Delegation',
        desc: 'Assign scoped operational permissions to accredited agents while maintaining full landlord visibility.',
      },
      {
        startSec: 25,
        time: '0:25 – 0:34',
        title: 'Escrow Ledger & Verified Payouts',
        desc: 'Monitor 14-working-day escrow clearing into cleared balances ready for verified bank withdrawal.',
      },
      {
        startSec: 34,
        time: '0:34 – 0:42',
        title: 'Versioned Agreements & Portfolio Governance',
        desc: 'Issue versioned digital tenancy agreements with SHA-256 document integrity records.',
      },
    ],
  },
  {
    id: 'protection',
    shortLabel: 'Property Protection Edition',
    title: 'Amana Property Protection — Records & Case Verification',
    badge: 'Edition 04 · Property Registry Dossier',
    designStyle: 'Deep Forest-Navy & Emerald Registry Dossier Aesthetic',
    soundtrack: 'Corporate Strings (fade-in/out & narration ducking)',
    cardPoster: '/promo-videos/posters/protection-16x9.jpg',
    summary:
      'Focused on landowners, families, corporate teams, and diaspora stakeholders—covering free basic property records, unlisted land support, optional priced registry and survey workflows, and public case verification.',
    formats: {
      vertical: {
        label: '9:16 Vertical Commercial',
        subtitle: 'Property Protection Mobile & Stakeholder Sharing',
        resolution: '1080 × 1920',
        aspect: '9/16',
        videoSrc: '/promo-videos/amana-protection-commercial-9x16.mp4',
        posterSrc: '/promo-videos/posters/protection-9x16.jpg',
        downloadName: 'amana-property-protection-9x16.mp4',
      },
      landscape: {
        label: '16:9 Widescreen Commercial',
        subtitle: 'Corporate, Diaspora & Institutional Briefings',
        resolution: '1280 × 720',
        aspect: '16/9',
        videoSrc: '/promo-videos/amana-protection-commercial-16x9.mp4',
        posterSrc: '/promo-videos/posters/protection-16x9.jpg',
        downloadName: 'amana-property-protection-16x9.mp4',
      },
    },
    defaultDuration: 42,
    chapters: [
      {
        startSec: 0,
        time: '0:00 – 0:08',
        title: 'Structured Property Documentation',
        desc: 'Create free basic property records and maintain clear supporting documentation in one vault.',
      },
      {
        startSec: 8,
        time: '0:08 – 0:17',
        title: 'Unlisted Land, Family & Corporate Holdings',
        desc: 'Record properties under individual, family, or company capacity—including unlisted land.',
      },
      {
        startSec: 17,
        time: '0:17 – 0:25',
        title: 'Optional Priced Verification Workflows',
        desc: 'Request priced registry searches, survey reports, and physical inspections where available.',
      },
      {
        startSec: 25,
        time: '0:25 – 0:34',
        title: 'Case Reporting & /verify-case Portal',
        desc: 'Preserve cryptographic evidence hashes and verify case records publicly through /verify-case.',
      },
      {
        startSec: 34,
        time: '0:34 – 0:42',
        title: 'Clarity for Owners & Partners',
        desc: 'Explore Amana Property Protection transparently at rentalhub.com.ng/property-protection.',
      },
    ],
  },
];

const EXTRA_EDITIONS = EDITIONS.slice(1);

export default function CommercialVideoShowcase({ isStandalone = false }) {
  const [activeEditionId, setActiveEditionId] = useState('flagship');
  const [activeFormat, setActiveFormat] = useState('vertical');
  const [showMoreEditions, setShowMoreEditions] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(EDITIONS[0].defaultDuration);

  const [loadState, setLoadState] = useState('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedBytesLabel, setLoadedBytesLabel] = useState('');
  const [loadedBlobUrl, setLoadedBlobUrl] = useState(null);
  const [loadError, setLoadError] = useState('');

  const videoRef = useRef(null);
  const playerFrameRef = useRef(null);
  const blobCacheRef = useRef(new Map());
  const abortControllerRef = useRef(null);

  const activeEdition = EDITIONS.find((ed) => ed.id === activeEditionId) || EDITIONS[0];
  const activeClip = activeEdition.formats[activeFormat] || activeEdition.formats.vertical;
  const isWidescreen = activeClip.aspect === '16/9';
  const currentVideoSrc = activeClip.videoSrc;

  useEffect(() => {
    const cache = blobCacheRef.current;
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        cache.forEach((blobUrl) => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {
            // Ignore cleanup errors
          }
        });
      }
      cache.clear();
    };
  }, []);

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const cachedUrl = blobCacheRef.current.get(currentVideoSrc) || null;
    setLoadedBlobUrl(cachedUrl);
    setLoadState(cachedUrl ? 'ready' : 'idle');
    setLoadProgress(cachedUrl ? 100 : 0);
    setLoadedBytesLabel('');
    setLoadError('');
    setCurrentTime(0);
    setDuration(activeEdition.defaultDuration);
    setIsPlaying(false);

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
      video.load();
    }
  }, [currentVideoSrc, activeEdition.defaultDuration]);

  const handleSelectEdition = (editionId) => {
    setActiveEditionId(editionId);
    if (playerFrameRef.current && typeof playerFrameRef.current.scrollIntoView === 'function') {
      playerFrameRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const startPlaybackOnVideo = async (video, seekSec = null) => {
    if (!video) return;

    if (typeof seekSec === 'number' && Number.isFinite(seekSec)) {
      try {
        video.currentTime = seekSec;
        setCurrentTime(seekSec);
      } catch {
        // Ignore seek errors before metadata is ready
      }
    }

    video.muted = isMuted;
    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      video.muted = true;
      setIsMuted(true);
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const waitForVideoReady = (video) =>
    new Promise((resolve) => {
      if (!video || video.readyState >= 2) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('canplay', done);
        video.removeEventListener('error', done);
        resolve();
      };
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      video.addEventListener('error', done, { once: true });
      setTimeout(done, 150);
    });

  const preloadAndPlay = async (seekSec = null) => {
    const video = videoRef.current;
    if (!video) return;

    const existingBlobUrl = blobCacheRef.current.get(currentVideoSrc);
    if (existingBlobUrl) {
      setLoadedBlobUrl(existingBlobUrl);
      setLoadState('ready');
      setLoadProgress(100);
      if (video.getAttribute('src') !== existingBlobUrl) {
        video.src = existingBlobUrl;
        video.load();
        await waitForVideoReady(video);
      }
      await startPlaybackOnVideo(video, seekSec);
      return;
    }

    const supportsPreload =
      typeof fetch === 'function' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function';

    if (!supportsPreload) {
      setLoadState('ready');
      setLoadProgress(100);
      await startPlaybackOnVideo(video, seekSec);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadState('loading');
    setLoadProgress(0);
    setLoadedBytesLabel('');
    setLoadError('');

    try {
      const response = await fetch(currentVideoSrc, {
        signal: controller.signal,
        cache: 'force-cache',
      });

      if (!response || !response.ok) {
        throw new Error(`HTTP ${response ? response.status : 'network error'}`);
      }

      let videoBlob;
      const contentLengthHeader = response.headers?.get?.('content-length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.byteLength;
            const recMb = (receivedBytes / (1024 * 1024)).toFixed(1);
            if (totalBytes > 0) {
              const totMb = (totalBytes / (1024 * 1024)).toFixed(1);
              const pct = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
              setLoadProgress(pct);
              setLoadedBytesLabel(`${recMb} / ${totMb} MB`);
            } else {
              setLoadedBytesLabel(`${recMb} MB buffered`);
            }
          }
        }
        videoBlob = new Blob(chunks, { type: 'video/mp4' });
      } else if (typeof response.blob === 'function') {
        videoBlob = await response.blob();
      } else {
        throw new Error('Unable to read media stream');
      }

      if (controller.signal.aborted) {
        return;
      }

      const objectUrl = URL.createObjectURL(videoBlob);
      blobCacheRef.current.set(currentVideoSrc, objectUrl);

      setLoadedBlobUrl(objectUrl);
      setLoadProgress(100);
      setLoadState('ready');

      video.src = objectUrl;
      video.load();
      await waitForVideoReady(video);

      if (!controller.signal.aborted) {
        await startPlaybackOnVideo(video, seekSec);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return;
      }
      setLoadState('error');
      setLoadError('Connection interrupted while preparing video. Please retry.');
      setIsPlaying(false);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const cancelPreload = (e) => {
    e.stopPropagation();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoadState('idle');
    setLoadProgress(0);
    setLoadedBytesLabel('');
    setLoadError('');
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || loadState === 'loading') return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      preloadAndPlay();
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
    const targetSec = Math.min(startSec, duration || startSec);
    if (loadState !== 'ready' && !blobCacheRef.current.has(currentVideoSrc)) {
      preloadAndPlay(targetSec);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = targetSec;
    setCurrentTime(targetSec);
    if (!isPlaying) {
      startPlaybackOnVideo(video, targetSec);
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

  const activeChapterIdx = activeEdition.chapters.reduce((found, ch, idx) => {
    if (currentTime >= ch.startSec) return idx;
    return found;
  }, 0);

  return (
    <section
      className={`w-full bg-[#071A3D] text-white ${isStandalone ? 'py-12' : 'py-14 border-t border-white/10'}`}
      aria-label="Official Amana RentalHub commercial videos"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E2C275]">
            Official Brand Commercials
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
            Amana RentalHub NG Product Commercials
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
            Available in 9:16 vertical and 16:9 widescreen masters. Each clip buffers completely before starting playback for smooth, interruption-free viewing on any connection.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          {(['vertical', 'landscape']).map((formatKey) => {
            const fmt = activeEdition.formats[formatKey];
            const isActive = activeFormat === formatKey;
            const Icon = formatKey === 'vertical' ? FaMobileAlt : FaDesktop;
            return (
              <button
                key={formatKey}
                type="button"
                onClick={() => setActiveFormat(formatKey)}
                className={`inline-flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#C89B3C] ${
                  isActive
                    ? 'border-[#C89B3C] bg-white font-semibold text-[#071A3D]'
                    : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                <span>{fmt.label}</span>
                <span
                  className={`font-mono text-[11px] ${
                    isActive ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  {fmt.resolution}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowMoreEditions((prev) => !prev)}
            aria-expanded={showMoreEditions}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#C89B3C] ${
              showMoreEditions || activeEditionId !== 'flagship'
                ? 'border-[#E2C275] bg-[#C89B3C]/20 text-[#F3D899]'
                : 'border-[#C89B3C]/50 bg-[#0C244E] text-[#E2C275] hover:bg-[#C89B3C]/15'
            }`}
          >
            <FaFilm size={12} aria-hidden="true" />
            <span>
              {showMoreEditions ? 'Hide More Commercials' : `More Commercials (${EXTRA_EDITIONS.length} Editions)`}
            </span>
            {showMoreEditions ? <FaChevronUp size={11} aria-hidden="true" /> : <FaChevronDown size={11} aria-hidden="true" />}
          </button>
        </div>

        {/* Unveiled Commercial Editions Gallery with Visual Thumbnails */}
        {showMoreEditions && (
          <div
            className="mb-8 rounded-xl border border-white/15 bg-[#051430]/95 p-4 sm:p-5"
            aria-label="Additional commercial editions"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E2C275]">
                Select a Commercial Edition to Preview &amp; Watch (9:16 &amp; 16:9 Available)
              </p>
              <span className="text-[11px] text-slate-400">
                4 distinct visual layouts &amp; curated corporate scores
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {EDITIONS.map((edition, idx) => {
                const isSelected = edition.id === activeEditionId;
                return (
                  <button
                    key={edition.id}
                    type="button"
                    onClick={() => handleSelectEdition(edition.id)}
                    aria-pressed={isSelected}
                    className={`group flex flex-col overflow-hidden rounded-lg border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#C89B3C] ${
                      isSelected
                        ? 'border-[#C89B3C] bg-[#0C244E] text-white shadow-lg ring-1 ring-[#C89B3C]/40'
                        : 'border-white/10 bg-[#071A3D]/80 text-slate-200 hover:border-[#C89B3C]/60 hover:bg-[#0C244E]/80'
                    }`}
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                      <img
                        src={edition.cardPoster}
                        alt={`${edition.shortLabel} visual preview`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#051430]/80 via-transparent to-transparent" />
                      <span className="absolute bottom-2 left-2 rounded bg-[#051430]/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#E2C275]">
                        0{idx + 1} · {formatTime(edition.defaultDuration)}
                      </span>
                      <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border border-[#E2C275]/70 bg-[#071A3D]/90 text-white">
                        <FaPlay size={9} className="ml-0.5" aria-hidden="true" />
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col p-3">
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">
                          {edition.shortLabel}
                        </span>
                        {isSelected && (
                          <span className="rounded bg-[#C89B3C]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#F3D899]">
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-slate-300">
                        {edition.designStyle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div ref={playerFrameRef} className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
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
                  key={currentVideoSrc}
                  ref={videoRef}
                  src={loadedBlobUrl || currentVideoSrc}
                  poster={activeClip.posterSrc}
                  className="h-full w-full object-cover"
                  playsInline
                  muted={isMuted}
                  preload="metadata"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                />

                {loadState === 'loading' && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center bg-[#051430]/88 px-6 text-center backdrop-blur-[2px]"
                    role="status"
                    aria-live="polite"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E2C275]">
                      Preparing Uninterrupted Playback
                    </span>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
                      {loadProgress > 0 ? `${loadProgress}%` : 'Loading…'}
                    </p>
                    {loadedBytesLabel && (
                      <p className="mt-0.5 font-mono text-[11px] text-slate-300">
                        {loadedBytesLabel}
                      </p>
                    )}
                    <div className="mt-3 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-[#C89B3C] transition-[width] duration-150"
                        style={{ width: `${Math.max(loadProgress, 8)}%` }}
                      />
                    </div>
                    <p className="mt-2.5 max-w-[240px] text-[11px] leading-4 text-slate-300">
                      Loading the complete video so playback never pauses mid-stream.
                    </p>
                    <button
                      type="button"
                      onClick={cancelPreload}
                      className="mt-4 rounded border border-white/20 px-3 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {loadState === 'error' && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center bg-[#051430]/92 px-6 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs font-semibold text-white">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => preloadAndPlay()}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#C89B3C] bg-[#C89B3C]/20 px-4 py-2 text-xs font-semibold text-[#F3D899] hover:bg-[#C89B3C]/30"
                    >
                      <FaRedo size={11} aria-hidden="true" />
                      <span>Retry Loading Video</span>
                    </button>
                  </div>
                )}

                {!isPlaying && loadState !== 'loading' && loadState !== 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#071A3D]/25 transition-colors hover:bg-[#071A3D]/15">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#E2C275]/80 bg-[#071A3D]/90 text-white shadow-xl">
                      <FaPlay className="ml-1" size={20} aria-hidden="true" />
                    </span>
                    <span className="mt-3 rounded-md border border-white/20 bg-[#051430]/90 px-3 py-1 text-[11px] font-medium text-slate-100 shadow">
                      {loadState === 'ready'
                        ? `Play ${activeEdition.shortLabel} · Buffered`
                        : `Play ${activeEdition.shortLabel} · Buffers Fully`}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 bg-[#051430] px-4 py-3">
                <div className="mb-2.5 flex items-center gap-3">
                  <span className="font-mono text-[11px] tabular-nums text-slate-300">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={duration || activeEdition.defaultDuration}
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
                      disabled={loadState === 'loading'}
                      aria-label={isPlaying ? 'Pause video' : 'Play video'}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-50"
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
                      {loadState === 'loading'
                        ? `Buffering ${loadProgress}%`
                        : isMuted
                          ? 'Sound muted'
                          : 'Narration & score'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={currentVideoSrc}
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

          <div className={`space-y-6 ${isWidescreen ? 'lg:col-span-5' : 'lg:col-span-7'}`}>
            <div className="rounded-xl border border-white/10 bg-[#0C244E] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E2C275]">
                    {activeEdition.badge}
                  </span>
                  <h3 className="mt-1 text-xl font-semibold text-white">{activeEdition.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-300">
                    {activeClip.subtitle} · {activeEdition.soundtrack}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-200">
                  <FaFilm size={11} className="text-[#E2C275]" aria-hidden="true" />
                  {activeClip.resolution} · MP4
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-200">{activeEdition.summary}</p>

              <div className="mt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Commercial Sequence (select a chapter to jump)
                </p>
                <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-[#071A3D]/60">
                  {activeEdition.chapters.map((chapter, idx) => {
                    const isCurrent = idx === activeChapterIdx;
                    return (
                      <button
                        key={`${activeEdition.id}-${chapter.time}`}
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

            <div className="rounded-xl border border-white/10 bg-[#051430] p-5">
              <div className="flex items-start gap-3">
                <FaCheckCircle className="mt-0.5 shrink-0 text-[#E2C275]" size={15} aria-hidden="true" />
                <div className="text-xs leading-5 text-slate-300">
                  <p className="font-semibold text-white">Accurate Platform Representation</p>
                  <p className="mt-1">
                    Every workflow depicted corresponds to active Amana RentalHub NG modules—property search, identity-verified enquiries, escrow-tracked rent payments and bank-transfer clearing, versioned tenancy agreements, and Property Protection records. Service availability and applicable fees are displayed transparently prior to confirmation.
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

import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  FaLocationArrow,
  FaMapMarkerAlt,
  FaSearchPlus,
  FaSearchMinus,
  FaCompress,
  FaExpand,
  FaCompass,
  FaSprayCan,
  FaTruck,
  FaShieldAlt
} from 'react-icons/fa';

/**
 * Interactive Real-Time Fumigation Service Map
 * Dual-layer high-fidelity canvas & SVG vector rendering
 * Supports real heading angle, zoom, pan, recenter, and breadcrumb route trail
 */
const FumigationMap = ({
  propertyDestination = null,
  teamLocation = null,
  breadcrumbTrail = [],
  height = '420px',
  allowFullscreen = true
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Default Nigerian coordinates (Abuja centroid)
  const defaultProp = { lat: 9.0765, lng: 7.3986 };

  const propLat = propertyDestination?.lat || propertyDestination?.latitude ? Number(propertyDestination.lat || propertyDestination.latitude) : defaultProp.lat;
  const propLng = propertyDestination?.lng || propertyDestination?.longitude ? Number(propertyDestination.lng || propertyDestination.longitude) : defaultProp.lng;

  // Active specialist coordinates
  const teamLat = teamLocation?.latitude ? Number(teamLocation.latitude) : null;
  const teamLng = teamLocation?.longitude ? Number(teamLocation.longitude) : null;
  const teamHeading = teamLocation?.heading ? Number(teamLocation.heading) : 0;

  // Coordinate bounding box
  const bounds = useMemo(() => {
    const lats = [propLat];
    const lngs = [propLng];
    if (teamLat !== null && teamLng !== null) {
      lats.push(teamLat);
      lngs.push(teamLng);
    }
    (breadcrumbTrail || []).forEach((pt) => {
      if (pt.lat && pt.lng) {
        lats.push(Number(pt.lat));
        lngs.push(Number(pt.lng));
      }
    });

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Padding in degree terms
    const latSpan = Math.max(0.015, (maxLat - minLat) * 1.4);
    const lngSpan = Math.max(0.015, (maxLng - minLng) * 1.4);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    return {
      minLat: centerLat - latSpan / 2,
      maxLat: centerLat + latSpan / 2,
      minLng: centerLng - lngSpan / 2,
      maxLng: centerLng + lngSpan / 2,
      centerLat,
      centerLng,
      latSpan,
      lngSpan
    };
  }, [propLat, propLng, teamLat, teamLng, breadcrumbTrail]);

  // Project lat/lng into SVG coordinates (0 - 1000 width, 0 - 650 height)
  const project = useCallback(
    (lat, lng) => {
      const x = ((lng - bounds.minLng) / bounds.lngSpan) * 1000;
      // Invert Y axis because screen origin is top-left
      const y = (1 - (lat - bounds.minLat) / bounds.latSpan) * 650;
      return { x, y };
    },
    [bounds]
  );

  const propPt = project(propLat, propLng);
  const teamPt = teamLat !== null && teamLng !== null ? project(teamLat, teamLng) : null;

  // SVG route path string through breadcrumbs and current position
  const routePath = useMemo(() => {
    if (!teamPt) return '';
    const points = [];
    (breadcrumbTrail || []).forEach((pt) => {
      if (pt.lat && pt.lng) {
        points.push(project(Number(pt.lat), Number(pt.lng)));
      }
    });
    points.push(teamPt);
    points.push(propPt);

    if (points.length < 2) return '';
    return points.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
    }, '');
  }, [breadcrumbTrail, teamPt, propPt, project]);

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(3.5, z + 0.3));
  const handleZoomOut = () => setZoom((z) => Math.max(0.7, z - 0.3));
  const handleRecenter = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Drag pan
  const onMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const onMouseMove = (e) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const onMouseUp = () => setIsDragging(false);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-inner select-none ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      }`}
      style={{ height: isFullscreen ? '100vh' : height }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Interactive Controls Overlay */}
      <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 bg-slate-900/80 backdrop-blur-md p-1.5 rounded-lg border border-slate-700 shadow-lg">
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          <FaSearchPlus size={14} />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          <FaSearchMinus size={14} />
        </button>
        <button
          type="button"
          onClick={handleRecenter}
          aria-label="Recenter map"
          title="Recenter"
          className="p-2 text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-colors"
        >
          <FaCompass size={14} />
        </button>
        {allowFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
          >
            {isFullscreen ? <FaCompress size={14} /> : <FaExpand size={14} />}
          </button>
        )}
      </div>

      {/* Map Legend / Telemetry Status Badge */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 shadow text-xs text-slate-200">
        {teamPt ? (
          <>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-medium text-emerald-400">Live Team Telemetry</span>
            <span className="text-slate-500">·</span>
            <span>Speed: {teamLocation?.speed ? `${Math.round(teamLocation.speed)} km/h` : 'En route'}</span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-400"></span>
            <span className="font-medium text-amber-300">Stationary / Preparation</span>
            <span className="text-slate-500">·</span>
            <span>Awaiting GPS departure</span>
          </>
        )}
      </div>

      {/* SVG Canvas Map Layer */}
      <div
        className="w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '50% 50%'
        }}
      >
        <svg
          viewBox="0 0 1000 650"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="fumigMapGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
            </pattern>
            {/* Route Gradient */}
            <linearGradient id="fumigRouteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            {/* Glow Filter */}
            <filter id="teamGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Grid simulating city layout */}
          <rect width="1000" height="650" fill="#0f172a" />
          <rect width="1000" height="650" fill="url(#fumigMapGrid)" opacity="0.6" />

          {/* Simulated arterial streets */}
          <g stroke="#1e293b" strokeWidth="5" fill="none" opacity="0.4">
            <path d="M 50 150 Q 300 200 600 120 T 950 250" />
            <path d="M 100 480 Q 400 350 750 420 T 900 580" />
            <path d="M 280 40 L 320 600" />
            <path d="M 720 30 L 680 620" />
          </g>

          {/* Planned / Travelled Route Path */}
          {routePath && (
            <>
              {/* Outer stroke shadow */}
              <path
                d={routePath}
                fill="none"
                stroke="#0284c7"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.3"
              />
              {/* Core animated route line */}
              <path
                d={routePath}
                fill="none"
                stroke="url(#fumigRouteGrad)"
                strokeWidth="3.5"
                strokeDasharray="6 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Breadcrumb Trail Points */}
          {(breadcrumbTrail || []).map((pt, idx) => {
            const p = project(Number(pt.lat), Number(pt.lng));
            return (
              <circle
                key={`ping-${idx}`}
                cx={p.x}
                cy={p.y}
                r="3"
                fill="#34d399"
                opacity="0.65"
              />
            );
          })}

          {/* Property Destination Marker */}
          <g transform={`translate(${propPt.x}, ${propPt.y})`}>
            {/* Radius Pulse Circle for Fumigation Zone */}
            <circle cx="0" cy="0" r="28" fill="#10b981" opacity="0.12" />
            <circle cx="0" cy="0" r="18" fill="#059669" opacity="0.2" />

            {/* Target Pin Icon */}
            <path
              d="M 0 -22 C -8 -22 -14 -16 -14 -8 C -14 3 0 16 0 16 C 0 16 14 3 14 -8 C 14 -16 8 -22 0 -22 Z"
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
            <circle cx="0" cy="-9" r="4.5" fill="#ffffff" />

            {/* Label */}
            <text
              x="0"
              y="30"
              textAnchor="middle"
              className="fill-slate-200 text-[10px] font-semibold"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
            >
              Treatment Property
            </text>
          </g>

          {/* Live Fumigation Team Marker */}
          {teamPt && (
            <g
              transform={`translate(${teamPt.x}, ${teamPt.y})`}
              filter="url(#teamGlow)"
            >
              {/* Outer radar pulse */}
              <circle cx="0" cy="0" r="22" fill="#06b6d4" opacity="0.25">
                <animate
                  attributeName="r"
                  values="12;26;12"
                  dur="2.5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.35;0.05;0.35"
                  dur="2.5s"
                  repeatCount="indefinite"
                />
              </circle>

              {/* Vehicle / Specialist Circle with Heading Orientation */}
              <circle
                cx="0"
                cy="0"
                r="12"
                fill="#0284c7"
                stroke="#ffffff"
                strokeWidth="2"
              />

              {/* Rotatable arrow indicator showing heading */}
              <g transform={`rotate(${teamHeading})`}>
                <polygon
                  points="0,-9 5,4 0,1 -5,4"
                  fill="#ffffff"
                />
              </g>

              {/* Team Label Badge */}
              <text
                x="0"
                y="-18"
                textAnchor="middle"
                className="fill-cyan-300 text-[10px] font-bold"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
              >
                Fumigation Squad
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Safety Shield Watermark Bottom Right */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-700 text-[10px] text-slate-400">
        <FaShieldAlt className="text-emerald-400" />
        <span>Amana Real-Time GPS Tracking</span>
      </div>
    </div>
  );
};

export default FumigationMap;

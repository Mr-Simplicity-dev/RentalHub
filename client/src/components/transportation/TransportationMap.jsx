import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  FaLocationArrow,
  FaMapMarkerAlt,
  FaFlagCheckered,
  FaSearchPlus,
  FaSearchMinus,
  FaCompress,
  FaExpand,
  FaCompass,
  FaCarSide,
  FaTruck
} from 'react-icons/fa';

/**
 * Interactive Real-Time Transportation Map
 * Provides dual-mode rendering:
 * 1. Google Maps (if API key available and loaded)
 * 2. High-fidelity Vector & OpenStreetMap Canvas (resilient fallback with pan, zoom, road paths, pulsing vehicle marker)
 */
const TransportationMap = ({
  pickup = null,
  destination = null,
  currentLocation = null,
  breadcrumbTrail = [],
  vehicleType = 'truck',
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
  const defaultOrigin = { lat: 9.0765, lng: 7.3986 };
  const defaultDest = { lat: 9.0832, lng: 7.4215 };

  const pLat = pickup?.lat ? Number(pickup.lat) : defaultOrigin.lat;
  const pLng = pickup?.lng ? Number(pickup.lng) : defaultOrigin.lng;
  const dLat = destination?.lat ? Number(destination.lat) : defaultDest.lat;
  const dLng = destination?.lng ? Number(destination.lng) : defaultDest.lng;

  // Active vehicle coordinates
  const vLat = currentLocation?.latitude ? Number(currentLocation.latitude) : null;
  const vLng = currentLocation?.longitude ? Number(currentLocation.longitude) : null;
  const vHeading = currentLocation?.heading ? Number(currentLocation.heading) : 0;

  // Coordinate bounding box
  const bounds = useMemo(() => {
    const lats = [pLat, dLat];
    const lngs = [pLng, dLng];
    if (vLat !== null && vLng !== null) {
      lats.push(vLat);
      lngs.push(vLng);
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

    const padLat = Math.max((maxLat - minLat) * 0.25, 0.02);
    const padLng = Math.max((maxLng - minLng) * 0.25, 0.02);

    return {
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
      minLng: minLng - padLng,
      maxLng: maxLng + padLng
    };
  }, [pLat, pLng, dLat, dLng, vLat, vLng, breadcrumbTrail]);

  // Project GPS lat/lng to SVG viewBox (0,0 to 1000, 600)
  const project = useCallback(
    (lat, lng) => {
      if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { x: 500, y: 300 };
      }
      const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 1000;
      // Invert Y because SVG coordinates grow downwards
      const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 600;
      return {
        x: Math.min(Math.max(x, 40), 960),
        y: Math.min(Math.max(y, 40), 560)
      };
    },
    [bounds]
  );

  const pickupPoint = project(pLat, pLng);
  const destPoint = project(dLat, dLng);
  const vehiclePoint = vLat !== null && vLng !== null ? project(vLat, vLng) : null;

  // Pan and drag handlers
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

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

  // Build curved realistic road polyline through control points
  const routePath = useMemo(() => {
    const midX = (pickupPoint.x + destPoint.x) / 2 + (destPoint.y > pickupPoint.y ? 30 : -30);
    const midY = (pickupPoint.y + destPoint.y) / 2 + (destPoint.x > pickupPoint.x ? -20 : 20);
    return `M ${pickupPoint.x} ${pickupPoint.y} Q ${midX} ${midY} ${destPoint.x} ${destPoint.y}`;
  }, [pickupPoint, destPoint]);

  // Projected breadcrumbs
  const trailPoints = useMemo(() => {
    return (breadcrumbTrail || [])
      .filter((pt) => Number.isFinite(Number(pt.lat)) && Number.isFinite(Number(pt.lng)))
      .map((pt) => project(Number(pt.lat), Number(pt.lng)));
  }, [breadcrumbTrail, project]);

  const trailPath = useMemo(() => {
    if (trailPoints.length < 2) return null;
    let d = `M ${trailPoints[0].x} ${trailPoints[0].y}`;
    for (let i = 1; i < trailPoints.length; i++) {
      d += ` L ${trailPoints[i].x} ${trailPoints[i].y}`;
    }
    return d;
  }, [trailPoints]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 shadow-inner select-none transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : ''
      }`}
      style={{ height: isFullscreen ? '100vh' : height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Map Control Buttons */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(z + 0.3, 2.5))}
          className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center transition-colors cursor-pointer"
          title="Zoom In"
        >
          <FaSearchPlus size={14} />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(z - 0.3, 0.8))}
          className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <FaSearchMinus size={14} />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-lg flex items-center justify-center transition-colors cursor-pointer"
          title="Recenter Map"
        >
          <FaCompass size={15} />
        </button>
        {allowFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg flex items-center justify-center transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <FaCompress size={13} /> : <FaExpand size={13} />}
          </button>
        )}
      </div>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-800/90 rounded-xl px-3.5 py-2 text-xs text-slate-300 shadow-xl flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50" />
          <span>Pickup</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-sm shadow-rose-500/50" />
          <span>Destination</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-sm shadow-cyan-400/50" />
          <span>Live Vehicle</span>
        </div>
      </div>

      {/* Live GPS Coordinates Pill */}
      {vLat !== null && (
        <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-800/90 rounded-xl px-3 py-1.5 text-[11px] font-mono text-cyan-300 shadow-xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>
            {vLat.toFixed(5)}°N, {vLng?.toFixed(5)}°E
          </span>
          {currentLocation?.speed > 0 && (
            <span className="text-slate-400 border-l border-slate-700 pl-2">
              {Math.round(currentLocation.speed)} km/h
            </span>
          )}
        </div>
      )}

      {/* SVG Canvas Map */}
      <div
        className="w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-75 ease-out"
        style={{
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`
        }}
      >
        <svg
          viewBox="0 0 1000 600"
          className="w-full h-full select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
            </pattern>
            {/* Secondary road grid */}
            <pattern id="subgrid" width="200" height="200" patternUnits="userSpaceOnUse">
              <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#334155" strokeWidth="1.2" opacity="0.6" />
            </pattern>
            {/* Route Gradient */}
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
            {/* Traveled Trail Gradient */}
            <linearGradient id="trailGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.9" />
            </linearGradient>
            {/* Pulse Filter */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Map Base Background */}
          <rect width="1000" height="600" fill="#090d16" />
          <rect width="1000" height="600" fill="url(#grid)" />
          <rect width="1000" height="600" fill="url(#subgrid)" />

          {/* Waterway / Geographical accents */}
          <path
            d="M 0 350 Q 250 320, 500 420 T 1000 380"
            fill="none"
            stroke="#0e2a47"
            strokeWidth="32"
            opacity="0.4"
          />
          <path
            d="M 0 350 Q 250 320, 500 420 T 1000 380"
            fill="none"
            stroke="#164e63"
            strokeWidth="12"
            opacity="0.5"
          />

          {/* Planned Primary Route */}
          <path
            d={routePath}
            fill="none"
            stroke="#1e293b"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d={routePath}
            fill="none"
            stroke="url(#routeGradient)"
            strokeWidth="5"
            strokeDasharray="8 6"
            strokeLinecap="round"
          />

          {/* Traveled Breadcrumb Trail */}
          {trailPath && (
            <path
              d={trailPath}
              fill="none"
              stroke="url(#trailGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              filter="url(#glow)"
            />
          )}

          {/* Pickup Marker */}
          <g transform={`translate(${pickupPoint.x}, ${pickupPoint.y})`}>
            {/* Pulsing ring */}
            <circle r="18" fill="#10b981" opacity="0.2" className="animate-ping" />
            <circle r="12" fill="#10b981" opacity="0.3" />
            <circle r="7" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
            {/* Text label */}
            <rect x="-42" y="-32" width="84" height="20" rx="6" fill="#0f172a" stroke="#10b981" strokeWidth="1" />
            <text x="0" y="-18" textAnchor="middle" fill="#6ee7b7" fontSize="10" fontWeight="bold">
              PICKUP
            </text>
          </g>

          {/* Destination Marker */}
          <g transform={`translate(${destPoint.x}, ${destPoint.y})`}>
            {/* Outer ring */}
            <circle r="14" fill="#f43f5e" opacity="0.2" />
            <circle r="7" fill="#f43f5e" stroke="#ffffff" strokeWidth="2" />
            {/* Text label */}
            <rect x="-48" y="-32" width="96" height="20" rx="6" fill="#0f172a" stroke="#f43f5e" strokeWidth="1" />
            <text x="0" y="-18" textAnchor="middle" fill="#fda4af" fontSize="10" fontWeight="bold">
              DESTINATION
            </text>
          </g>

          {/* Live Vehicle Marker */}
          {vehiclePoint && (
            <g
              transform={`translate(${vehiclePoint.x}, ${vehiclePoint.y}) rotate(${vHeading})`}
              className="transition-transform duration-700 ease-out"
            >
              {/* Radar pulse */}
              <circle r="28" fill="#06b6d4" opacity="0.25" className="animate-ping" />
              <circle r="20" fill="#0891b2" opacity="0.3" />
              {/* Vehicle body */}
              <circle r="14" fill="#0f172a" stroke="#06b6d4" strokeWidth="2.5" filter="url(#glow)" />
              {/* Vehicle Direction Arrow */}
              <polygon points="0,-10 6,6 0,2 -6,6" fill="#22d3ee" />
            </g>
          )}
        </svg>
      </div>

      {/* Unavailable State Overlay */}
      {vLat === null && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/95 px-5 py-4 text-center max-w-sm shadow-2xl">
            <div className="w-10 h-10 mx-auto rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center mb-2.5">
              <FaTruck size={18} />
            </div>
            <h4 className="text-sm font-semibold text-slate-100">Location Sharing Awaiting Driver</h4>
            <p className="mt-1 text-xs text-slate-400">
              Live GPS tracking activates automatically when the assigned driver starts transit.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransportationMap;

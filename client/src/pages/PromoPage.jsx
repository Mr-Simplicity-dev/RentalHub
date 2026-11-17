import React from 'react';
import { Helmet } from 'react-helmet';
import ProductDemoCommercial from '../components/promo/ProductDemoCommercial';
import CommercialVideoShowcase from '../components/promo/CommercialVideoShowcase';
import { FaFileAlt, FaShieldAlt, FaMobileAlt, FaDownload } from 'react-icons/fa';

export default function PromoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Helmet>
        <title>Commercial Video Studio | Amana RentalHub Nigeria</title>
        <meta name="description" content="Watch the official promotional commercials for Amana RentalHub NG featuring Abuja and Kano verified listings." />
      </Helmet>

      {/* Hero Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 py-8 px-4 text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Amana RentalHub <span className="text-amber-400">Commercial Studio</span>
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
          Interactive 3D product demo engine &amp; broadcast commercial suite featuring verified Abuja and Kano listings, transparent reviews, and escrow security.
        </p>
      </div>

      {/* 100% In-Engine 3D Interactive App Demo Section */}
      <div className="container mx-auto px-4 max-w-7xl py-10">
        <ProductDemoCommercial />
      </div>

      {/* Main Video Cuts Showcase */}
      <CommercialVideoShowcase isStandalone={true} />

      {/* Production & Campaign Documentation Section */}
      <div className="container mx-auto px-4 max-w-5xl py-12 border-t border-slate-800">
        <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <FaFileAlt className="text-emerald-400" />
          Production Assets &amp; Specifications
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="font-bold text-emerald-400 text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
              <FaMobileAlt /> Format &amp; Specs
            </h4>
            <ul className="text-xs text-slate-300 space-y-2">
              <li>• <strong>Vertical:</strong> 1080 × 1920 (9:16 Full HD)</li>
              <li>• <strong>Landscape:</strong> 1280 × 720 (16:9 HD)</li>
              <li>• <strong>Framerate:</strong> 30 fps kinetic UI motion</li>
              <li>• <strong>Codecs:</strong> H.264 High / AAC Stereo</li>
              <li>• <strong>Duration:</strong> 48.5 Seconds (Unclipped VO)</li>
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="font-bold text-amber-400 text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
              <FaShieldAlt /> Brand Compliance
            </h4>
            <ul className="text-xs text-slate-300 space-y-2">
              <li>• <strong>Style:</strong> Path 1 Kinetic 3D Product Tour</li>
              <li>• <strong>Locations:</strong> Abuja FCT &amp; Kano Only</li>
              <li>• <strong>Exclusions:</strong> Zero Lagos/Lekki mentions</li>
              <li>• <strong>Captions:</strong> Action-safe lower-third overlays</li>
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="font-bold text-cyan-400 text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
              <FaDownload /> Quick Downloads
            </h4>
            <div className="flex flex-col gap-2 mt-2">
              <a
                href="/promo/amana-app-tour-commercial.mp4"
                download="amana-app-tour-9x16.mp4"
                className="text-xs px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 hover:text-white transition flex justify-between"
              >
                <span>App Tour (9:16 Vertical)</span>
                <span className="text-emerald-400">MP4</span>
              </a>
              <a
                href="/promo/amana-app-tour-landscape.mp4"
                download="amana-app-tour-16x9.mp4"
                className="text-xs px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 hover:text-white transition flex justify-between"
              >
                <span>App Tour (16:9 Widescreen)</span>
                <span className="text-emerald-400">MP4</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

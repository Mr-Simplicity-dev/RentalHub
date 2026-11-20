import React from 'react';
import { Helmet } from 'react-helmet';
import ProductDemoCommercial from '../components/promo/ProductDemoCommercial';
import CommercialVideoShowcase from '../components/promo/CommercialVideoShowcase';
import { FaDownload, FaFileAlt, FaFilm, FaShieldAlt } from 'react-icons/fa';

export default function PromoPage() {
  return (
    <div className="min-h-screen bg-[#071A3D] text-white">
      <Helmet>
        <title>Product Presentation &amp; Commercials | Amana RentalHub NG</title>
        <meta
          name="description"
          content="Explore the interactive Amana RentalHub NG platform walkthrough and download official 9:16 vertical and 16:9 widescreen commercial videos."
        />
      </Helmet>

      {/* Executive Header */}
      <header className="border-b border-white/10 bg-[#051430] py-10">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E2C275]">
                Amana RentalHub NG · Corporate Presentation
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Product Walkthrough &amp; Media Assets
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                An executive overview of Nigeria&apos;s structured rental platform—covering nationwide property discovery, identity verification, tracked payments, digital tenancy agreements, and Property Protection.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              <span className="inline-block h-2 w-2 rounded-full bg-[#C89B3C]" aria-hidden="true" />
              <span>rentalhub.com.ng</span>
            </div>
          </div>
        </div>
      </header>

      {/* Interactive Product Demonstration */}
      <div className="container mx-auto max-w-7xl px-4 py-10">
        <ProductDemoCommercial />
      </div>

      {/* Rendered Commercial Videos Showcase */}
      <CommercialVideoShowcase isStandalone={true} />

      {/* Media Specifications & Direct Downloads */}
      <section className="border-t border-white/10 bg-[#051430] py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-6 flex items-center gap-2.5">
            <FaFileAlt className="text-[#E2C275]" size={16} aria-hidden="true" />
            <h2 className="text-xl font-semibold text-white">Media Specifications &amp; Downloads</h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-[#0C244E] p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E2C275]">
                <FaFilm size={12} aria-hidden="true" /> Technical Formats
              </h3>
              <ul className="space-y-2 text-xs leading-5 text-slate-300">
                <li>
                  <strong className="text-white">Vertical Master:</strong> 1080 × 1920 (9:16 Full HD)
                </li>
                <li>
                  <strong className="text-white">Widescreen Master:</strong> 1280 × 720 (16:9 HD)
                </li>
                <li>
                  <strong className="text-white">Video &amp; Audio:</strong> H.264 High · AAC Stereo · 30 fps
                </li>
                <li>
                  <strong className="text-white">Captions:</strong> Burned-in lower-third editorial overlays
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0C244E] p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E2C275]">
                <FaShieldAlt size={12} aria-hidden="true" /> Editorial Standards
              </h3>
              <ul className="space-y-2 text-xs leading-5 text-slate-300">
                <li>
                  <strong className="text-white">Coverage:</strong> Structured nationwide search (36 states + FCT)
                </li>
                <li>
                  <strong className="text-white">Product Accuracy:</strong> Reflects implemented web &amp; dashboard workflows
                </li>
                <li>
                  <strong className="text-white">Disclosures:</strong> Transparent fees, 14-working-day clearing, and optional paid services
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0C244E] p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E2C275]">
                <FaDownload size={12} aria-hidden="true" /> Direct Downloads
              </h3>
              <div className="flex flex-col gap-2.5">
                <a
                  href="/promo/amana-app-tour-commercial.mp4"
                  download="amana-app-tour-9x16.mp4"
                  className="flex items-center justify-between rounded-lg border border-white/15 bg-[#071A3D] px-3.5 py-2.5 text-xs font-medium text-slate-100 transition-colors hover:border-[#C89B3C]/60 hover:bg-white/10"
                >
                  <span>Product Commercial (9:16 Vertical)</span>
                  <span className="font-mono text-[#E2C275]">MP4</span>
                </a>
                <a
                  href="/promo/amana-app-tour-landscape.mp4"
                  download="amana-app-tour-16x9.mp4"
                  className="flex items-center justify-between rounded-lg border border-white/15 bg-[#071A3D] px-3.5 py-2.5 text-xs font-medium text-slate-100 transition-colors hover:border-[#C89B3C]/60 hover:bg-white/10"
                >
                  <span>Product Commercial (16:9 Widescreen)</span>
                  <span className="font-mono text-[#E2C275]">MP4</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

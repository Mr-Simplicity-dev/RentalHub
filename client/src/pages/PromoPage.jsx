import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import ProductDemoCommercial from '../components/promo/ProductDemoCommercial';
import CommercialVideoShowcase from '../components/promo/CommercialVideoShowcase';
import { FaChevronDown, FaChevronUp, FaDownload, FaFileAlt, FaFilm, FaShieldAlt } from 'react-icons/fa';

const PROMO_LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'ha', label: 'Hausa' },
  { code: 'ig', label: 'Igbo' },
  { code: 'yo', label: 'Yoruba' },
];

const DIRECT_DOWNLOAD_ITEMS = [
  { id: 'flagship', label: 'Flagship App Tour' },
  { id: 'tenant', label: 'Tenant Edition' },
  { id: 'landlord', label: 'Landlord & Agent Edition' },
  { id: 'protection', label: 'Property Protection Edition' },
];

const buildPromoDownloadHref = (edition, format, lang) =>
  `/api/promo-videos/download/${encodeURIComponent(edition)}/${encodeURIComponent(format)}/${encodeURIComponent(lang)}`;

const buildPromoDownloadName = (edition, format, lang) => {
  const names = {
    flagship: { vertical: 'amana-app-tour-9x16', landscape: 'amana-app-tour-16x9' },
    tenant: { vertical: 'amana-tenant-edition-9x16', landscape: 'amana-tenant-edition-16x9' },
    landlord: { vertical: 'amana-landlord-agent-9x16', landscape: 'amana-landlord-agent-16x9' },
    protection: { vertical: 'amana-property-protection-9x16', landscape: 'amana-property-protection-16x9' },
  };
  const base = names[edition]?.[format] || `amana-promo-${edition}-${format}`;
  return `${base}-${lang}.mp4`;
};

export default function PromoPage() {
  const [showMoreDownloads, setShowMoreDownloads] = useState(false);
  const [promoVideoLanguage, setPromoVideoLanguage] = useState('en');
  const selectedLang = PROMO_LANGUAGE_OPTIONS.some((l) => l.code === promoVideoLanguage) ? promoVideoLanguage : 'en';
  const isSelectedLanguageAvailable = selectedLang === 'en';
  const selectedLangLabel = PROMO_LANGUAGE_OPTIONS.find((l) => l.code === selectedLang)?.label || 'English';

  return (
    <div className="min-h-screen bg-[#071A3D] text-white">
      <Helmet>
        <title>Product Presentation &amp; Commercials | Amana RentalHub NG</title>
        <meta
          name="description"
          content="Explore the interactive Amana RentalHub NG platform walkthrough and download official 9:16 vertical and 16:9 widescreen commercial videos."
        />
      </Helmet>

      <header className="border-b border-white/10 bg-[#051430] py-10">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2.5">
                <img
                  src="/rentalhub-mark.svg"
                  alt="Amana RentalHub NG"
                  className="h-9 w-9 rounded-lg border border-[#C89B3C]/40 bg-[#071A3D] p-0.5 shadow-sm"
                />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E2C275]">
                  Amana RentalHub NG &bull; Corporate Presentation
                </p>
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Product Walkthrough &amp; Media Assets
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                An executive overview of Nigeria&apos;s structured rental platform&mdash;covering nationwide property discovery, identity verification, escrow-tracked rent clearing, digital tenancy agreements, and Property Protection.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
              <span className="inline-block h-2 w-2 rounded-full bg-[#C89B3C]" aria-hidden="true" />
              <span>rentalhub.com.ng</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-4 py-10">
        <ProductDemoCommercial />
      </div>

      <div className="container mx-auto max-w-7xl px-4 pb-2">
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0C244E]/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Promo video language</p>
            <p className="text-xs text-slate-300">Changes only promotional videos. It does not change the app language.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-200">
            <span className="sr-only">Select promo video language</span>
            <select
              value={selectedLang}
              onChange={(e) => setPromoVideoLanguage(e.target.value)}
              aria-label="Select promo video language"
              className="rounded-lg border border-white/20 bg-[#071A3D] px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#C89B3C] [&>option]:text-slate-900"
            >
              {PROMO_LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <CommercialVideoShowcase
        isStandalone={true}
        promoLanguage={selectedLang}
        onPromoLanguageChange={setPromoVideoLanguage}
      />

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
                <li><strong className="text-white">Vertical Masters:</strong> 1080 &times; 1920 (9:16 Full HD &bull; 4 editions)</li>
                <li><strong className="text-white">Widescreen Masters:</strong> 1280 &times; 720 (16:9 HD &bull; 4 editions)</li>
                <li><strong className="text-white">Video &amp; Audio:</strong> H.264 High &bull; AAC Stereo &bull; 24 fps cinematic</li>
                <li><strong className="text-white">Playback Reliability:</strong> Full pre-buffered browser playback for smooth viewing over variable networks</li>
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0C244E] p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E2C275]">
                <FaShieldAlt size={12} aria-hidden="true" /> Editorial Standards
              </h3>
              <ul className="space-y-2 text-xs leading-5 text-slate-300">
                <li><strong className="text-white">Coverage:</strong> Structured nationwide search (36 states + FCT)</li>
                <li><strong className="text-white">Product Accuracy:</strong> Reflects implemented web &amp; dashboard workflows</li>
                <li><strong className="text-white">Disclosures:</strong> Transparent fees, 14-working-day escrow clearing window, and optional paid services</li>
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0C244E] p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E2C275]">
                <FaDownload size={12} aria-hidden="true" /> Direct Downloads
              </h3>
              <p className="mb-3 text-[11px] leading-4 text-slate-300">
                Selected language: <span className="font-semibold text-white">{selectedLangLabel}</span>. {!isSelectedLanguageAvailable ? 'This language is awaiting approved native-language narration and reviewed localized video.' : 'English masters are available now.'}
              </p>
              <div className="flex flex-col gap-2.5">
                {isSelectedLanguageAvailable ? (
                  <>
                    <a
                      href={buildPromoDownloadHref('flagship', 'vertical', selectedLang)}
                      download={buildPromoDownloadName('flagship', 'vertical', selectedLang)}
                      className="flex items-center justify-between rounded-lg border border-white/15 bg-[#071A3D] px-3.5 py-2.5 text-xs font-medium text-slate-100 transition-colors hover:border-[#C89B3C]/60 hover:bg-white/10"
                    >
                      <span>Flagship Commercial (9:16 Vertical)</span>
                      <span className="font-mono text-[#E2C275]">MP4</span>
                    </a>
                    <a
                      href={buildPromoDownloadHref('flagship', 'landscape', selectedLang)}
                      download={buildPromoDownloadName('flagship', 'landscape', selectedLang)}
                      className="flex items-center justify-between rounded-lg border border-white/15 bg-[#071A3D] px-3.5 py-2.5 text-xs font-medium text-slate-100 transition-colors hover:border-[#C89B3C]/60 hover:bg-white/10"
                    >
                      <span>Flagship Commercial (16:9 Widescreen)</span>
                      <span className="font-mono text-[#E2C275]">MP4</span>
                    </a>
                  </>
                ) : (
                  <div className="rounded-lg border border-white/15 bg-[#071A3D] px-3.5 py-3 text-xs text-slate-300">
                    {selectedLangLabel} downloads are not available yet. Approved native-language narration and reviewed localized videos are required before publishing.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowMoreDownloads((prev) => !prev)}
                  aria-expanded={showMoreDownloads}
                  className="mt-1 flex items-center justify-between rounded-lg border border-[#C89B3C]/40 bg-[#C89B3C]/10 px-3.5 py-2 text-xs font-semibold text-[#E2C275] transition-colors hover:bg-[#C89B3C]/20"
                >
                  <span>{showMoreDownloads ? 'Hide Additional Editions' : 'More Commercial Downloads (3 Editions)'}</span>
                  {showMoreDownloads ? <FaChevronUp size={11} /> : <FaChevronDown size={11} />}
                </button>
              </div>
            </div>
          </div>

          {showMoreDownloads && (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {DIRECT_DOWNLOAD_ITEMS.filter((item) => item.id !== 'flagship').map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-[#0C244E] p-4">
                  <p className="text-xs font-semibold text-white">{item.label}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {isSelectedLanguageAvailable ? (
                      <>
                        <a
                          href={buildPromoDownloadHref(item.id, 'vertical', selectedLang)}
                          download={buildPromoDownloadName(item.id, 'vertical', selectedLang)}
                          className="flex items-center justify-between rounded-lg border border-white/15 bg-[#071A3D] px-3 py-2 text-xs text-slate-200 transition-colors hover:border-[#C89B3C]/60 hover:text-white"
                        >
                          <span>9:16 Vertical Master</span>
                          <span className="font-mono text-[#E2C275]">MP4</span>
                        </a>
                        <a
                          href={buildPromoDownloadHref(item.id, 'landscape', selectedLang)}
                          download={buildPromoDownloadName(item.id, 'landscape', selectedLang)}
                          className="flex items-center justify-between rounded-lg border border-white/15 bg-[#071A3D] px-3 py-2 text-xs text-slate-200 transition-colors hover:border-[#C89B3C]/60 hover:text-white"
                        >
                          <span>16:9 Widescreen Master</span>
                          <span className="font-mono text-[#E2C275]">MP4</span>
                        </a>
                      </>
                    ) : (
                      <div className="rounded-lg border border-white/15 bg-[#071A3D] px-3 py-2 text-xs text-slate-400">
                        {selectedLangLabel} version not available yet.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

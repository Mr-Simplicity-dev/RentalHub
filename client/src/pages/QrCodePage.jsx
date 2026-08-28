import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { FaApple, FaGooglePlay, FaArrowLeft, FaPrint } from 'react-icons/fa';

const DOWNLOAD_URL = 'https://rentalhub.com.ng/download';

const QrCodePage = () => {
  const { t } = useTranslation();
  const qrSize = Math.min(260, typeof window !== 'undefined' ? window.innerWidth - 96 : 260);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="hidden sm:block absolute top-0 left-0 z-20 print:hidden">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-br-xl bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-md transition hover:bg-white hover:text-primary-700"
        >
          <FaArrowLeft className="text-xs" />
          {t('qr.back_to_home', 'Back to Home')}
        </Link>
      </div>

      <div className="container mx-auto px-4 py-12 sm:py-20">
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="text-center mb-10 print:mb-6">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
              {t('qr.scan_to_download', 'Scan to Download')}
            </h1>
            <p className="text-gray-500 text-lg">
              {t('qr.point_camera', 'Point your phone camera at the QR code below')}
            </p>
          </div>

          {/* QR Code Card */}
          <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-10 text-center print:shadow-none print:border-2 print:border-gray-300 print:rounded-none print:p-6">
            {/* QR Code with Logo */}
            <div className="flex justify-center mb-8 print:mb-6">
              <div className="relative inline-block">
                <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm print:border print:border-gray-300 print:shadow-none print:p-2">
                  <QRCodeSVG
                    value={DOWNLOAD_URL}
                    size={qrSize}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    includeMargin={false}
                    imageSettings={{
                      src: '/rentalhub-mark.svg',
                      x: undefined,
                      y: undefined,
                      height: 48,
                      width: 48,
                      excavate: true,
                    }}
                  />
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap shadow-md print:bg-white print:text-gray-800 print:border print:border-gray-400 print:shadow-none">
                  RENTALHUB NG
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-3 mb-8 text-left max-w-xs mx-auto print:mb-6">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-bold print:bg-white print:border-2 print:border-primary-700 print:text-gray-900">1</span>
                <p className="text-gray-600 text-sm pt-0.5 print:text-gray-800">{t('qr.step1', 'Open your phone camera or QR scanner app')}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-bold print:bg-white print:border-2 print:border-primary-700 print:text-gray-900">2</span>
                <p className="text-gray-600 text-sm pt-0.5 print:text-gray-800">{t('qr.step2', 'Point it at the QR code above')}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-bold print:bg-white print:border-2 print:border-primary-700 print:text-gray-900">3</span>
                <p className="text-gray-600 text-sm pt-0.5 print:text-gray-800">{t('qr.step3', 'Tap the link that appears to download the app')}</p>
              </div>
            </div>

            {/* Download URL (print only) */}
            <div className="hidden print:block mb-4 text-center">
              <p className="text-xs text-gray-600 mb-1">{t('qr.or_visit', 'Or visit:')}</p>
              <p className="text-sm font-mono font-bold text-gray-900 tracking-wide">{DOWNLOAD_URL}</p>
            </div>

            {/* Store Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6 print:hidden">
              <a
                href="https://play.google.com/store/apps/details?id=com.rentalhub"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-black text-white px-5 py-3 rounded-xl hover:bg-gray-800 transition text-sm font-semibold"
              >
                <FaGooglePlay className="text-lg" />
                {t('qr.google_play', 'Google Play')}
              </a>
              <a
                href="https://apps.apple.com/app/rentalhub-ng"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-black text-white px-5 py-3 rounded-xl hover:bg-gray-800 transition text-sm font-semibold"
              >
                <FaApple className="text-lg" />
                {t('qr.app_store', 'App Store')}
              </a>
            </div>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 text-sm font-semibold transition print:hidden"
            >
              <FaPrint />
              {t('qr.print_page', 'Print this page')}
            </button>
          </div>

          {/* Footer note */}
          <p className="text-center text-gray-400 text-xs mt-8 print:mt-4">
            {t('qr.footer', "rentalhub.com.ng — Nigeria's trusted property platform")}
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden { display: none !important; }
          .print\\:mb-6 { margin-bottom: 1.5rem !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border { border: 1px solid #e5e7eb !important; }
          .print\\:p-2 { padding: 0.5rem !important; }
          .print\\:mt-4 { margin-top: 1rem !important; }
          img, svg { break-inside: avoid; }
          .min-h-screen { min-height: auto !important; }
          .bg-gray-50 { background: white !important; }
          .container { padding-top: 0 !important; padding-bottom: 0 !important; }
        }
        @media print and (orientation: portrait) {
          .max-w-lg { max-width: 400px !important; }
        }
        @media print and (orientation: landscape) {
          .max-w-lg { max-width: 350px !important; }
        }
      `}</style>
    </div>
  );
};

export default QrCodePage;

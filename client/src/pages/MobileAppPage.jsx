import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FaMobileAlt, FaDownload, FaShieldAlt, FaBell, FaComments, FaHome, FaArrowLeft } from 'react-icons/fa';

const MobileAppPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const features = [
    { icon: <FaBell />, title: t('mobile_app.feature_instant_alerts'), desc: t('mobile_app.feature_instant_alerts_desc') },
    { icon: <FaComments />, title: t('mobile_app.feature_in_app_chat'), desc: t('mobile_app.feature_in_app_chat_desc') },
    { icon: <FaHome />, title: t('mobile_app.feature_browse_properties'), desc: t('mobile_app.feature_browse_properties_desc') },
    { icon: <FaShieldAlt />, title: t('mobile_app.feature_legal_support'), desc: t('mobile_app.feature_legal_support_desc') },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 left-4 z-50 flex items-center gap-2 bg-white/90 backdrop-blur-sm text-slate-800 px-4 py-2.5 rounded-xl shadow-md hover:bg-white transition sm:hidden"
        aria-label="Go back"
      >
        <FaArrowLeft />
        <span className="text-sm font-medium">Back</span>
      </button>
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 text-white">
        <div className="container mx-auto px-4 py-20 text-center">
          <FaMobileAlt className="mx-auto text-6xl mb-6 text-primary-300" />
          <h1 className="text-4xl font-extrabold md:text-5xl mb-4">{t('mobile_app.title')}</h1>
          <p className="text-lg text-slate-200 max-w-2xl mx-auto mb-8">
            {t('mobile_app.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="/api/downloads/app"
              className="inline-flex items-center justify-center gap-2 bg-white text-primary-700 px-8 py-3 rounded-xl font-semibold hover:bg-gray-100 transition"
            >
              <FaDownload />
              {t('mobile_app.download_android')}
            </a>
            <a
              href={process.env.REACT_APP_IOS_APP_URL || '#'}
              className={`inline-flex items-center justify-center gap-2 border-2 border-white px-8 py-3 rounded-xl font-semibold text-white hover:bg-white/10 transition ${!process.env.REACT_APP_IOS_APP_URL ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={(e) => { if (!process.env.REACT_APP_IOS_APP_URL) e.preventDefault(); }}
            >
              <FaDownload />
              {t('mobile_app.download_ios')}
            </a>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">{t('mobile_app.features_heading')}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
              <div className="text-3xl text-primary-600 mb-3 flex justify-center">{f.icon}</div>
              <h3 className="font-semibold text-slate-900 mb-1">{f.title}</h3>
              <p className="text-sm text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-t border-slate-200 py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">{t('mobile_app.apk_heading')}</h2>
          <p className="text-sm text-slate-600 mb-4">{t('mobile_app.apk_desc')}</p>
          <a
            href="/api/downloads/app"
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition"
          >
            <FaDownload />
            {t('mobile_app.apk_download_button')}
          </a>
        </div>
      </section>
    </div>
  );
};

export default MobileAppPage;

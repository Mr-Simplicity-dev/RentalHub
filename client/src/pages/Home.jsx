import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import PropertyCard from '../components/properties/PropertyCard';
import Loader from '../components/common/Loader';
import AdSpace from '../components/common/AdSpace';
import { FaSearch, FaHome, FaCheckCircle, FaShieldAlt, FaMobileAlt, FaTimes, FaArrowRight, FaMapMarkerAlt, FaWhatsapp } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';

const HUBSPOT_LANG_MAP = {
  en: 'en',
  ar: 'ar',
  ru: 'ru',
  fr: 'fr',
  zh: 'zh-cn',
  'zh-CN': 'zh-cn',
};

const Home = () => {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();

  const [featuredProperties, setFeaturedProperties] = useState([]);
  const [popularLocations, setPopularLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAppPrompt, setShowAppPrompt] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const propertiesRef = useRef(null);
  const locationsRef = useRef(null);

  const androidAppUrl = process.env.REACT_APP_ANDROID_APP_URL || '';
  const iosAppUrl = process.env.REACT_APP_IOS_APP_URL || '';

  const loadData = useCallback(async () => {
    try {
      const [featured, locations] = await Promise.all([
        propertyService.getFeaturedProperties(10),
        propertyService.getPopularLocations(6),
      ]);

      if (featured?.success) {
        setFeaturedProperties(featured.data || []);
      }
      if (locations?.success) {
        setPopularLocations(locations.data || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isAuthenticated) {
      setShowAppPrompt(false);
      return;
    }

    const dismissedUntil = Number(localStorage.getItem('home_app_prompt_dismissed_until') || 0);
    setShowAppPrompt(Date.now() > dismissedUntil);
  }, [isAuthenticated]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
      
      // Trigger animations when sections come into view
      const scrollPosition = window.scrollY + window.innerHeight;
      
      if (heroRef.current && scrollPosition > heroRef.current.offsetTop + 100) {
        setHeroLoaded(true);
      }
      
      if (featuresRef.current && scrollPosition > featuresRef.current.offsetTop + 100) {
        setFeaturesLoaded(true);
      }
      
      if (propertiesRef.current && scrollPosition > propertiesRef.current.offsetTop + 100) {
        setPropertiesLoaded(true);
      }
      
      if (locationsRef.current && scrollPosition > locationsRef.current.offsetTop + 100) {
        setLocationsLoaded(true);
      }
    };

    window.addEventListener('scroll', handleScroll);
    
    // Initial check
    handleScroll();
    
    // Trigger hero animation on mount
    setTimeout(() => setHeroLoaded(true), 100);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const dismissAppPrompt = () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    localStorage.setItem('home_app_prompt_dismissed_until', String(Date.now() + oneDayMs));
    setShowAppPrompt(false);
  };

  const shareViaWhatsApp = (url) => {
    const text = `${t('home.share_app_text')} ${url}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    // Sync HubSpot language with i18next
    const hubspotLang =
      HUBSPOT_LANG_MAP[i18n.language] ||
      HUBSPOT_LANG_MAP[i18n.language?.split('-')[0]] ||
      'en';

    window.hsConversationsSettings = {
      language: hubspotLang,
    };

    // Load HubSpot embed script once
    if (!document.getElementById('hs-script-loader')) {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.id = 'hs-script-loader';
      script.async = true;
      script.defer = true;
      script.src = '//js-eu1.hs-scripts.com/147691769.js';
      document.body.appendChild(script);
    } else if (window.HubSpotConversations) {
      window.HubSpotConversations.widget.refresh();
    }
  }, [i18n.language]);

  const handleSearch = (e) => {
    e.preventDefault();
    window.location.href = `/properties?search=${encodeURIComponent(searchQuery)}`;
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      {showAppPrompt && (
        <section className="bg-white border border-soft shadow-card rounded-xl2 p-4 m-4 animate-slideInRight transform transition-all duration-300 hover:shadow-cardHover">
          <div className="container mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center transition-transform duration-300 hover:scale-110">
                <FaMobileAlt />
              </div>
              <div className="cursor-pointer" onClick={() => { const url = androidAppUrl || iosAppUrl || 'https://rentalhub.ng/mobile-app'; window.open(url, '_blank', 'noopener,noreferrer'); }}>
                <p className="font-semibold text-gray-900">{t('home.app_prompt_title')}</p>
                <p className="text-sm text-gray-600">
                  {t('home.app_prompt_text')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {androidAppUrl && (
                <a
                  href={androidAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {t('home.download_android')}
                </a>
              )}

              {iosAppUrl && (
                <a
                  href={iosAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-soft px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {t('home.download_iphone')}
                </a>
              )}

              {(androidAppUrl || iosAppUrl) && (
                <button
                  type="button"
                  onClick={() => shareViaWhatsApp(androidAppUrl || iosAppUrl)}
                  className="flex items-center gap-1.5 bg-green-500 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-green-600 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <FaWhatsapp />
                  {t('home.share_app')}
                </button>
              )}

              <button
                type="button"
                onClick={dismissAppPrompt}
                className="p-2 text-gray-500 hover:text-gray-700 transition-all duration-300 transform hover:scale-110"
                aria-label={t('home.close_app_prompt')}
                title={t('common.close')}
              >
                <FaTimes />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Hero Section */}
      <section 
        ref={heroRef}
        className={`w-full max-w-full overflow-x-hidden bg-gradient-to-r from-primary-600 to-primary-800 text-white py-16 transition-all duration-1000 sm:py-20 ${
          heroLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto w-full max-w-full px-4">
          <div className="mx-auto w-full max-w-3xl text-center">
            <h1 className="mb-6 max-w-full break-words text-3xl font-bold leading-tight animate-fadeIn sm:text-4xl md:text-5xl">
              {t('home.hero_title')}
            </h1>
            <p className="mx-auto mb-8 max-w-full text-base leading-7 text-primary-100 animate-fadeIn delay-100 sm:text-xl">
              {t('home.hero_subtitle')}
            </p>

            <form 
              onSubmit={handleSearch} 
              className="mx-auto flex w-full max-w-full min-w-0 flex-col gap-2 animate-fadeIn delay-200 sm:max-w-lg md:max-w-2xl md:flex-row md:gap-0"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('home.search_placeholder')}
                className="w-full min-w-0 max-w-full flex-1 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 transition-all duration-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 md:rounded-l-lg md:rounded-r-none md:px-6 md:py-4 md:text-base"
              />
              <button
                type="submit"
                aria-label={t('home.search')}
                className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full bg-primary-700 px-0 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-800 hover:shadow-lg md:h-auto md:w-auto md:self-stretch md:rounded-l-none md:rounded-r-lg md:px-6 md:py-4 md:text-base lg:px-8"
              >
                <FaSearch className="shrink-0 md:mr-2" />
                <span className="sr-only md:not-sr-only">{t('home.search')}</span>
              </button>
            </form>
            <div className="mt-4 animate-fadeIn delay-300">
              <Link
                to="/legal-support"
                className="underline text-primary-100 hover:text-white text-sm transition-colors duration-300 inline-block hover:scale-105"
              >
                {t('home.legal_support_link')}
              </Link>
              <div className="mt-2">
                <Link
                  to="/properties?request=1#tenant-request"
                  className="underline text-primary-100 hover:text-white text-sm transition-colors duration-300 inline-block hover:scale-105"
                >
                  {t('home.property_request_link')}
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/legal-support"
                  className="inline-block bg-white text-primary-700 px-5 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {t('home.use_lawyers')}
                </Link>
                <Link
                  to="/verify-case"
                  className="inline-block border border-white px-5 py-2 rounded-lg font-semibold text-white hover:bg-primary-700 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {t('home.verify_dispute_evidence')}
                </Link>
              </div>
              <div className="mt-3 flex justify-center">
                <Link
                  to="/properties?request=1#tenant-request"
                  className="inline-block border border-white px-5 py-2 rounded-lg font-semibold text-white hover:bg-primary-700 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {t('home.submit_request')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AdSpace placement="home_top" variant="marquee" className="bg-white py-6" />

      {/* Features */}
      <section 
        ref={featuresRef}
        className={`py-16 bg-white transition-all duration-1000 ${
          featuresLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <FaShieldAlt className="text-primary-600 text-2xl" />,
                title: t('home.features.verified.title'),
                text: t('home.features.verified.text'),
              },
              {
                icon: <FaHome className="text-primary-600 text-2xl" />,
                title: t('home.features.wide.title'),
                text: t('home.features.wide.text'),
              },
              {
                icon: <FaCheckCircle className="text-primary-600 text-2xl" />,
                title: t('home.features.easy.title'),
                text: t('home.features.easy.text'),
              },
            ].map((f, i) => (
              <div 
                key={i} 
                className="text-center transition-all duration-500 transform hover:-translate-y-2 hover:shadow-cardHover p-6 rounded-xl2"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-300 hover:scale-110 hover:bg-primary-200">
                  {f.icon}
                </div>
                <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Properties */}
      <section 
        ref={propertiesRef}
        className={`py-16 bg-gray-50 transition-all duration-1000 ${
          propertiesLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold animate-fadeIn">
              {t('home.featured_title')}
            </h2>
            <Link 
              to="/properties?featured=true" 
              className="text-primary-600 hover:text-primary-700 font-semibold transition-all duration-300 transform hover:translate-x-1 flex items-center gap-2"
            >
              {t('home.view_all')} <FaArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>

          {loading ? (
            <Loader />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredProperties.map((property, index) => (
                <div 
                  key={property?.id ?? `featured-${index}`}
                  className="transition-all duration-500 transform hover:-translate-y-2"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <PropertyCard
                    property={property}
                    showSaveButton={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <AdSpace placement="home_featured" variant="marquee" className="bg-gray-50 pb-8" />

      {/* Popular Locations */}
      <section 
        ref={locationsRef}
        className={`py-16 bg-white transition-all duration-1000 ${
          locationsLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8 text-center animate-fadeIn">
            {t('home.popular_locations')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {popularLocations.map((location, index) => (
              <Link
                key={location?.state_id ?? location?.state_name ?? `loc-${index}`}
                to={`/properties?state_id=${location?.state_id ?? ''}`}
                className="card text-center transition-all duration-500 transform hover:-translate-y-2 hover:shadow-cardHover group"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center mx-auto mb-3 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary-200">
                  <FaMapMarkerAlt />
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors duration-300">
                  {location?.state_name ?? t('home.unknown')}
                </h3>
                <p className="text-sm text-gray-600 mt-1 group-hover:text-gray-800 transition-colors duration-300">
                  {location?.property_count ?? 0} {t('home.properties')}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4 animate-fadeIn">
            {t('home.cta_title')}
          </h2>
          <p className="text-xl mb-8 text-primary-100 animate-fadeIn delay-100">
            {t('home.cta_text')}
          </p>
          <div className="flex flex-col justify-center gap-3 animate-fadeIn delay-200 sm:flex-row sm:gap-4">
            <Link 
              to="/register" 
              className="w-full rounded-lg bg-white px-8 py-3 font-semibold text-primary-600 transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-100 hover:shadow-lg sm:w-auto"
            >
              {t('home.get_started')}
            </Link>
            <Link 
              to="/properties" 
              className="w-full rounded-lg border-2 border-white px-8 py-3 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg sm:w-auto"
            >
              {t('home.browse')}
            </Link>
          </div>
          <div className="mt-8 pt-8 border-t border-primary-400 animate-fadeIn delay-300">
            <p className="text-lg mb-4 text-primary-100">{t('home.download_app_cta')}</p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
              <a
                href={androidAppUrl || 'https://rentalhub.ng/mobile-app'}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-lg bg-white px-8 py-3 font-semibold text-primary-600 transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-100 hover:shadow-lg sm:w-auto inline-flex items-center justify-center gap-2"
              >
                <FaMobileAlt />
                {t('home.download_android')}
              </a>
              {iosAppUrl && (
                <a
                  href={iosAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full rounded-lg border-2 border-white px-8 py-3 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg sm:w-auto inline-flex items-center justify-center gap-2"
                >
                  <FaMobileAlt />
                  {t('home.download_iphone')}
                </a>
              )}
              <button
                type="button"
                onClick={() => shareViaWhatsApp(androidAppUrl || 'https://rentalhub.ng/mobile-app')}
                className="w-full rounded-lg border-2 border-white px-8 py-3 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-green-600 hover:shadow-lg sm:w-auto inline-flex items-center justify-center gap-2"
              >
                <FaWhatsapp />
                {t('home.share_app')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* WhatsApp Floating Button (Multilingual) */}
      <a
        href={`https://wa.me/2348030601238?text=${encodeURIComponent(
          t('home.whatsapp_message')
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`fixed bottom-6 left-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-all duration-300 transform hover:scale-110 hover:shadow-xl ${
          isScrolled ? 'animate-bounce' : ''
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 32 32"
          fill="currentColor"
          className="w-7 h-7"
        >
          <path d="M16.001 2.002C8.27 2.002 2 8.272 2 16.003c0 2.803.733 5.539 2.122 7.958L2 30l6.2-2.063c2.338 1.276 4.973 1.95 7.801 1.95 7.73 0 14-6.27 14-14 0-7.731-6.27-14.001-14-14.001z" />
        </svg>
      </a>
    </div>
  );
};

export default Home

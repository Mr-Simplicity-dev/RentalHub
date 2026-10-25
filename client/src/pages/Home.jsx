import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import PropertyCard from '../components/properties/PropertyCard';
import Loader from '../components/common/Loader';
import AdSpace from '../components/common/AdSpace';
import ShareMenu from '../components/common/ShareMenu';
import { FaSearch, FaHome, FaCheckCircle, FaShieldAlt, FaMobileAlt, FaTimes, FaArrowRight, FaMapMarkerAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import FloatingContactWidget from '../components/common/FloatingContactWidget';
import WhatsAppBotWidget from '../components/common/WhatsAppBotWidget';
import api from '../services/api';

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
  const [treatedCases, setTreatedCases] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAppPrompt, setShowAppPrompt] = useState(false);
  const [appPromptVersionKey, setAppPromptVersionKey] = useState('');
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  
  
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const propertiesRef = useRef(null);
  const locationsRef = useRef(null);

  const mobileAppPageUrl = '/mobile-app';
  const appDownloadPageUrl = '/download';
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
    let isMounted = true;

    const loadTreatedCases = async () => {
      try {
        const response = await api.get('/legal/treated-cases');
        if (isMounted) {
          setTreatedCases(response.data?.data || null);
        }
      } catch (error) {
        console.error('Error loading legal treated cases:', error);
      }
    };

    loadTreatedCases();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setShowAppPrompt(false);
      return undefined;
    }

    let active = true;

    api
      .get('/downloads/version')
      .then((response) => {
        if (!active) return;
        const android = response?.data?.data?.android;
        const versionKey =
          android?.version && android?.buildNumber
            ? `${android.version}-${android.buildNumber}`
            : '';

        if (!versionKey) {
          setShowAppPrompt(false);
          return;
        }

        setAppPromptVersionKey(versionKey);
        const seenVersion = localStorage.getItem('home_app_prompt_seen_version');
        setShowAppPrompt(seenVersion !== versionKey);
      })
      .catch(() => {
        if (active) setShowAppPrompt(false);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const handleScroll = () => {
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

  const markAppPromptSeen = useCallback(() => {
    if (appPromptVersionKey) {
      localStorage.setItem('home_app_prompt_seen_version', appPromptVersionKey);
    }
    setShowAppPrompt(false);
  }, [appPromptVersionKey]);

  const dismissAppPrompt = () => {
    markAppPromptSeen();
  };

  const shareAppUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/mobile-app`
    : 'https://rentalhub.com.ng/mobile-app';
  const shareAppText = t('home.share_app_text');

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

  const features = [
    {
      icon: <FaShieldAlt className="text-2xl" />,
      title: t('home.features.verified.title'),
      text: t('home.features.verified.text'),
    },
    {
      icon: <FaHome className="text-2xl" />,
      title: t('home.features.wide.title'),
      text: t('home.features.wide.text'),
    },
    {
      icon: <FaCheckCircle className="text-2xl" />,
      title: t('home.features.easy.title'),
      text: t('home.features.easy.text'),
    },
  ];

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-white">
      {showAppPrompt && (
        <section className="relative mx-4 mt-4 overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 to-white shadow-card animate-slideInRight transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cardHover">
          <button
            type="button"
            onClick={dismissAppPrompt}
            className="absolute right-3 top-3 z-10 rounded-full bg-white/95 p-2 text-gray-500 shadow-sm transition-all duration-300 hover:scale-110 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
            aria-label={t('home.close_app_prompt')}
            title={t('common.close')}
          >
            <FaTimes />
          </button>

          <Link
            to={mobileAppPageUrl}
            onClick={markAppPromptSeen}
            className="group block px-5 py-5 pr-12 text-center transition-colors duration-300 hover:bg-primary-50/60 sm:px-6"
            aria-label={t('home.app_prompt_title')}
          >
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700 shadow-inner transition-transform duration-300 group-hover:scale-110">
                <FaMobileAlt />
              </div>
              <div className="space-y-1">
                <p className="mx-auto max-w-[18rem] text-center text-base font-extrabold leading-snug text-gray-900 sm:max-w-none sm:text-lg">
                  {t('home.app_prompt_title')}
                </p>
                <p className="mx-auto max-w-sm text-center text-sm leading-5 text-gray-600">
                  {t('home.app_prompt_text')}
                </p>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Hero Section */}
      <section
        ref={heroRef}
        className={`relative w-full max-w-full overflow-hidden text-white transition-all duration-1000 ${
          heroLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <img
          src="/hero-main.avif"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-primary-900/80 to-primary-700/80" />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-state-500/10 blur-3xl" />
        </div>

        <div className="relative container mx-auto w-full max-w-full px-4 py-24 sm:py-32">
          <div className="mx-auto w-full max-w-4xl text-center">
            <h1 className="mb-6 max-w-full break-words text-4xl font-extrabold leading-[1.08] tracking-tight animate-fadeInUp sm:text-5xl lg:text-6xl">
              {t('home.hero_title')}
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-base leading-7 text-primary-100 animate-fadeInUp sm:text-xl">
              {t('home.hero_subtitle')}
            </p>

            <form
              onSubmit={handleSearch}
              className="mx-auto mb-8 flex w-full max-w-2xl min-w-0 flex-row items-center gap-2 rounded-2xl bg-white/95 p-1.5 shadow-elevated-lg backdrop-blur animate-fadeInUp sm:p-2"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('home.search_placeholder')}
                className="w-full min-w-0 max-w-full flex-1 rounded-xl border-0 bg-transparent px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 sm:px-4 sm:py-3 sm:text-base"
              />
              <button
                type="submit"
                aria-label={t('home.search')}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-0 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg sm:h-12 sm:w-auto sm:px-6 sm:text-base"
              >
                <FaSearch className="shrink-0" />
                <span className="hidden sm:inline">{t('home.search')}</span>
              </button>
            </form>

            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 animate-fadeInUp">
              <Link
                to="/legal-support"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-primary-700 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cardHover"
              >
                <FaShieldAlt /> {t('legalCases.title')}
              </Link>
              <Link
                to="/verify-case"
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/20"
              >
                <FaCheckCircle /> {t('home.verify_dispute_evidence')}
              </Link>
              <Link
                to="/properties?request=1#tenant-request"
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/20"
              >
                <FaHome /> {t('home.submit_request')}
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <Link
                to="/legal-support"
                className="text-primary-100 underline decoration-primary-300/60 underline-offset-4 transition-colors duration-300 hover:text-white"
              >
                {t('legalCases.title')}
              </Link>
              <Link
                to="/properties?request=1#tenant-request"
                className="text-primary-100 underline decoration-primary-300/60 underline-offset-4 transition-colors duration-300 hover:text-white"
              >
                {t('home.property_request_link')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <AdSpace placement="home_top" variant="marquee" className="bg-white py-4" />

      {treatedCases && (
        <section className="bg-slate-50 py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-5xl">
              <div className="mb-8 flex flex-col items-center gap-3 text-center">
                <FaShieldAlt className="text-3xl text-primary-600" aria-hidden="true" />
                <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                  {t('home.legal_protection_title', 'Legal protection: solved cases')}
                </h2>
                <p className="max-w-2xl text-slate-600">
                  {t('home.legal_cases_intro', 'See anonymized rental disputes resolved with support.')}
                </p>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold text-primary-600">{treatedCases.stats?.total_resolved || 0}</p>
                  <p className="text-sm text-slate-500">{t('home.solved_cases', 'Solved cases')}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold text-primary-600">{treatedCases.stats?.tenant_against_landlord || 0}</p>
                  <p className="text-sm text-slate-500">{t('lawyers_directory.tenant_cases', 'Tenant cases')}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold text-primary-600">{treatedCases.stats?.landlord_against_tenant || 0}</p>
                  <p className="text-sm text-slate-500">{t('lawyers_directory.landlord_cases', 'Landlord cases')}</p>
                </div>
              </div>

              {(treatedCases.cases || []).length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(treatedCases.cases || []).slice(0, 3).map((caseItem) => (
                    <div key={caseItem.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
                      <FaCheckCircle className="mt-0.5 shrink-0 text-green-500" aria-hidden="true" />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {caseItem.direction === 'tenant_landlord'
                            ? t('lawyers_directory.tenant_to_landlord', 'Tenant → landlord')
                            : t('lawyers_directory.landlord_to_tenant', 'Landlord → tenant')}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {[caseItem.state, caseItem.resolved_at ? new Date(caseItem.resolved_at).toLocaleDateString() : null]
                            .filter(Boolean)
                            .join(' · ') || t('lawyers_directory.resolved_matter', 'Resolved matter')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-slate-500">
                  {t('home.no_solved_cases', 'No resolved cases to show yet.')}
                </p>
              )}

              <div className="mt-8 text-center">
                <Link
                  to="/legal-support"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-primary-700"
                >
                  <FaShieldAlt aria-hidden="true" />
                  {t('legalCases.title')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section
        ref={featuresRef}
        className={`bg-white py-20 transition-all duration-1000 ${
          featuresLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="group rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-card transition-all duration-500 hover:-translate-y-2 hover:shadow-cardHover"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-elevated transition-transform duration-300 group-hover:scale-110">
                  {f.icon}
                </div>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">{f.title}</h3>
                <p className="leading-relaxed text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Properties */}
      <section
        ref={propertiesRef}
        className={`bg-slate-50 py-20 transition-all duration-1000 ${
          propertiesLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="mb-10 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl animate-fadeIn">
              {t('home.featured_title')}
            </h2>
            <Link
              to="/properties?featured=true"
              className="group inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-primary-600 transition-all duration-300 hover:text-primary-700"
            >
              {t('home.view_all')} <FaArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>

          {loading ? (
            <Loader />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {featuredProperties.map((property, index) => (
                <div
                  key={property?.id ?? `featured-${index}`}
                  className="transition-all duration-500 hover:-translate-y-2"
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

      <AdSpace placement="home_featured" variant="marquee" className="bg-slate-50 pb-5" />

      {/* Popular Locations */}
      <section
        ref={locationsRef}
        className={`bg-white py-20 transition-all duration-1000 ${
          locationsLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <h2 className="mb-10 text-center text-2xl font-bold text-slate-900 sm:text-3xl animate-fadeIn">
            {t('home.popular_locations')}
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {popularLocations.map((location, index) => (
              <Link
                key={location?.state_id ?? location?.state_name ?? `loc-${index}`}
                to={`/properties?state_id=${location?.state_id ?? ''}`}
                className="group rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-card transition-all duration-500 hover:-translate-y-2 hover:border-primary-200 hover:shadow-cardHover"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary-100">
                  <FaMapMarkerAlt />
                </div>
                <h3 className="font-semibold text-slate-900 transition-colors duration-300 group-hover:text-primary-700">
                  {location?.state_name ?? t('home.unknown')}
                </h3>
                <p className="mt-1 text-sm text-slate-500 transition-colors duration-300 group-hover:text-slate-700">
                  {location?.property_count ?? 0} {t('home.properties')}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-primary-900 to-primary-700 py-20 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-state-500/10 blur-3xl" />
        </div>
        <div className="relative container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold animate-fadeInUp sm:text-4xl">
            {t('home.cta_title')}
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-primary-100 animate-fadeInUp">
            {t('home.cta_text')}
          </p>
          <div className="flex flex-col justify-center gap-3 animate-fadeInUp sm:flex-row sm:gap-4">
            <Link
              to="/register"
              className="w-full rounded-xl bg-white px-8 py-3 font-semibold text-primary-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-100 hover:shadow-lg sm:w-auto"
            >
              {t('home.get_started')}
            </Link>
            <Link
              to="/properties"
              className="w-full rounded-xl border-2 border-white px-8 py-3 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg sm:w-auto"
            >
              {t('home.browse')}
            </Link>
          </div>

          <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur sm:p-8">
            <p className="mb-4 text-lg font-semibold text-white">{t('home.download_app_cta')}</p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                to={appDownloadPageUrl}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-3 font-semibold text-primary-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-100 hover:shadow-lg sm:w-auto"
              >
                <FaMobileAlt />
                {t('home.download_android')}
              </Link>
              {iosAppUrl && (
                <a
                  href={iosAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white px-8 py-3 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg sm:w-auto"
                >
                  <FaMobileAlt />
                  {t('home.download_iphone')}
                </a>
              )}
              <ShareMenu
                url={shareAppUrl}
                text={shareAppText}
                title="Amana RentalHub NG"
                buttonLabel={t('home.share_app')}
                buttonClassName="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white px-8 py-3 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-green-600 hover:shadow-lg sm:w-auto"
                headerLabel={`Share ${t('home.share_app')}`}
                copySuccessMessage="App link copied to clipboard"
              />
            </div>
          </div>
        </div>
      </section>

      <WhatsAppBotWidget />
      <FloatingContactWidget />
    </div>
  );
};

export default Home

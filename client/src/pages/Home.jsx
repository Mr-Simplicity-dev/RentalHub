import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import PropertyCard from '../components/properties/PropertyCard';
import Loader from '../components/common/Loader';
import { FaSearch, FaHome, FaCheckCircle, FaShieldAlt, FaMobileAlt, FaTimes, FaArrowRight, FaMapMarkerAlt } from 'react-icons/fa';
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
    <div className="overflow-hidden">
      {showAppPrompt && (
        <section className="bg-white border border-soft shadow-card rounded-xl2 p-4 m-4 animate-slideInRight transform transition-all duration-300 hover:shadow-cardHover">
          <div className="container mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center transition-transform duration-300 hover:scale-110">
                <FaMobileAlt />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Click Here to Get the RentalHub mobile app</p>
                <p className="text-sm text-gray-600">
                  Faster search alerts, instant chats, and case updates directly on your phone.
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
                  Download Android
                </a>
              )}

              {iosAppUrl && (
                <a
                  href={iosAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-soft px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  Download iPhone
                </a>
              )}

              <button
                type="button"
                onClick={dismissAppPrompt}
                className="p-2 text-gray-500 hover:text-gray-700 transition-all duration-300 transform hover:scale-110"
                aria-label="Close app download notification"
                title="Close"
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
        className={`bg-gradient-to-r from-primary-600 to-primary-800 text-white py-20 transition-all duration-1000 ${
          heroLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 animate-fadeIn">
              {t('home.hero_title')}
            </h1>
            <p className="text-xl mb-8 text-primary-100 animate-fadeIn delay-100">
              {t('home.hero_subtitle')}
            </p>

            <form 
              onSubmit={handleSearch} 
              className="flex max-w-2xl mx-auto animate-fadeIn delay-200"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('home.search_placeholder')}
                className="flex-1 px-6 py-4 rounded-l-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-300"
              />
              <button
                type="submit"
                className="bg-primary-700 hover:bg-primary-800 px-8 py-4 rounded-r-lg font-semibold transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg flex items-center"
              >
                <FaSearch className="inline mr-2" />
                {t('home.search')}
              </button>
            </form>
            <div className="mt-4 animate-fadeIn delay-300">
              <Link
                to="/lawyers"
                className="underline text-primary-100 hover:text-white text-sm transition-colors duration-300 inline-block hover:scale-105"
              >
                Need legal support? Explore RentalHub NG lawyers and unlock full contact details after payment.
              </Link>
              <div className="mt-2">
                <Link
                  to="/properties?request=1#tenant-request"
                  className="underline text-primary-100 hover:text-white text-sm transition-colors duration-300 inline-block hover:scale-105"
                >
                  Can't find your preferred property type? Submit a request on the properties page.
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/lawyers"
                  className="inline-block bg-white text-primary-700 px-5 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  Use RentalHub NG Lawyers
                </Link>
                <Link
                  to="/verify-case"
                  className="inline-block border border-white px-5 py-2 rounded-lg font-semibold text-white hover:bg-primary-700 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  Verify Dispute Evidence
                </Link>
              </div>
              <div className="mt-3 flex justify-center">
                <Link
                  to="/properties?request=1#tenant-request"
                  className="inline-block border border-white px-5 py-2 rounded-lg font-semibold text-white hover:bg-primary-700 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  Submit Request
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

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
          <div className="flex justify-center space-x-4 animate-fadeIn delay-200">
            <Link 
              to="/register" 
              className="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
            >
              {t('home.get_started')}
            </Link>
            <Link 
              to="/properties" 
              className="border-2 border-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
            >
              {t('home.browse')}
                        </Link>
          </div>
        </div>
      </section>

      {/* WhatsApp Floating Button (Multilingual) */}
      <a
        href={`https://wa.me/2347067012884?text=${encodeURIComponent(
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
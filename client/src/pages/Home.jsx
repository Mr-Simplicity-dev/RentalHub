import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import PropertyCard from '../components/properties/PropertyCard';
import Loader from '../components/common/Loader';
import { FaSearch, FaHome, FaCheckCircle, FaShieldAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const Home = () => {
  const { t, i18n } = useTranslation();

  const [featuredProperties, setFeaturedProperties] = useState([]);
  const [popularLocations, setPopularLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const HUBSPOT_LANG_MAP = { en: 'en', ar: 'ar', ru: 'ru', fr: 'fr', zh: 'zh-cn', 'zh-CN': 'zh-cn', };


      useEffect(() => {
      loadData();

      // Sync HubSpot language with i18next
      const hubspotLang =
        HUBSPOT_LANG_MAP[i18n.language] ||
        HUBSPOT_LANG_MAP[i18n.language?.split('-')[0]] ||
        'en';

      window.hsConversationsSettings = {
        language: hubspotLang,
      };

      // Load HubSpot Embed Script once
      if (!document.getElementById('hs-script-loader')) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.id = 'hs-script-loader';
        script.async = true;
        script.defer = true;
        script.src = '//js-eu1.hs-scripts.com/147691769.js';

        document.body.appendChild(script);
      } else {
        // Reload widget when language changes
        if (window.HubSpotConversations) {
          window.HubSpotConversations.widget.refresh();
        }
      }
    }, [i18n.language]);




  const loadData = async () => {
    try {
      const [featured, locations] = await Promise.all([
        propertyService.getFeaturedProperties(6),
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
  };

  const handleSearch = (e) => {
    e.preventDefault();
    window.location.href = `/properties?search=${encodeURIComponent(searchQuery)}`;
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary-600 to-primary-800 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              {t('home.hero_title')}
            </h1>
            <p className="text-xl mb-8 text-primary-100">
              {t('home.hero_subtitle')}
            </p>

            <form onSubmit={handleSearch} className="flex max-w-2xl mx-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('home.search_placeholder')}
                className="flex-1 px-6 py-4 rounded-l-lg text-gray-900 focus:outline-none"
              />
              <button
                type="submit"
                className="bg-primary-700 hover:bg-primary-800 px-8 py-4 rounded-r-lg font-semibold transition-colors"
              >
                <FaSearch className="inline mr-2" />
                {t('home.search')}
              </button>
            </form>
            <div className="mt-4">
              <Link
                to="/properties"
                className="underline text-primary-100 hover:text-white text-sm"
              >
                Can't find your preferred property type? Submit a request on the properties page.
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-white">
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
              <div key={i} className="text-center">
                <div className="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
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
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold">
              {t('home.featured_title')}
            </h2>
            <Link to="/properties" className="text-primary-600 hover:text-primary-700 font-semibold">
              {t('home.view_all')} →
            </Link>
          </div>

          {loading ? (
            <Loader />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredProperties.map((property, index) => (
                <PropertyCard
                  key={property?.id ?? `featured-${index}`}
                  property={property}
                  showSaveButton={false}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Popular Locations */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8 text-center">
            {t('home.popular_locations')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {popularLocations.map((location, index) => (
              <Link
                key={location?.state_id ?? location?.state_name ?? `loc-${index}`}
                to={`/properties?state_id=${location?.state_id ?? ''}`}
                className="card text-center hover:shadow-lg transition-shadow"
              >
                <h3 className="font-semibold text-gray-900">
                  {location?.state_name ?? t('home.unknown')}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
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
          <h2 className="text-3xl font-bold mb-4">
            {t('home.cta_title')}
          </h2>
          <p className="text-xl mb-8 text-primary-100">
            {t('home.cta_text')}
          </p>
          <div className="flex justify-center space-x-4">
            <Link to="/register" className="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              {t('home.get_started')}
            </Link>
            <Link to="/properties" className="border-2 border-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
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
        className="fixed bottom-6 left-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition"
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

export default Home;

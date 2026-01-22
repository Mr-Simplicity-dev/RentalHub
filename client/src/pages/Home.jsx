import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import PropertyCard from '../components/properties/PropertyCard';
import Loader from '../components/common/Loader';
import { FaSearch, FaHome, FaCheckCircle, FaShieldAlt } from 'react-icons/fa';

const Home = () => {
  const [featuredProperties, setFeaturedProperties] = useState([]);
  const [popularLocations, setPopularLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();

    // Load JivoChat only on Home
    const script = document.createElement('script');
    script.src = 'https://code.jivosite.com/widget/YOUR_JIVO_WIDGET_ID';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

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
    window.location.href = `/properties?search=${searchQuery}`;
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary-600 to-primary-800 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Find Your Perfect Home in Nigeria
            </h1>
            <p className="text-xl mb-8 text-primary-100">
              Browse thousands of verified properties across all 36 states + FCT
            </p>

            <form onSubmit={handleSearch} className="flex max-w-2xl mx-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by location, property type..."
                className="flex-1 px-6 py-4 rounded-l-lg text-gray-900 focus:outline-none"
              />
              <button
                type="submit"
                className="bg-primary-700 hover:bg-primary-800 px-8 py-4 rounded-r-lg font-semibold transition-colors"
              >
                <FaSearch className="inline mr-2" />
                Search
              </button>
            </form>
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
                title: 'Verified Properties',
                text: 'All properties and landlords are verified with NIN for your safety',
              },
              {
                icon: <FaHome className="text-primary-600 text-2xl" />,
                title: 'Wide Selection',
                text: 'Thousands of properties across Nigeria to choose from',
              },
              {
                icon: <FaCheckCircle className="text-primary-600 text-2xl" />,
                title: 'Easy Process',
                text: 'Simple application and payment process, all online',
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
            <h2 className="text-3xl font-bold">Featured Properties</h2>
            <Link to="/properties" className="text-primary-600 hover:text-primary-700 font-semibold">
              View All →
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
          <h2 className="text-3xl font-bold mb-8 text-center">Popular Locations</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {popularLocations.map((location, index) => (
              <Link
                key={location?.state_id ?? location?.state_name ?? `loc-${index}`}
                to={`/properties?state_id=${location?.state_id ?? ''}`}
                className="card text-center hover:shadow-lg transition-shadow"
              >
                <h3 className="font-semibold text-gray-900">
                  {location?.state_name ?? 'Unknown'}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {location?.property_count ?? 0} properties
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to find your next home?</h2>
          <p className="text-xl mb-8 text-primary-100">
            Join thousands of Nigerians who have found their perfect rental
          </p>
          <div className="flex justify-center space-x-4">
            <Link to="/register" className="bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              Get Started
            </Link>
            <Link to="/properties" className="border-2 border-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors">
              Browse Properties
            </Link>
          </div>
        </div>
      </section>

      {/* WhatsApp Floating Button */}
      <a
        href="https://wa.me/2347067012884?text=Hello%20RentalHub%20NG"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition"
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

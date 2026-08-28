import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FaSprayCan,
  FaBroom,
  FaShieldAlt,
  FaStar,
  FaClock,
  FaUsers,
  FaCheckCircle,
  FaSearch,
  FaFilter,
  FaSortAmountDown
} from 'react-icons/fa';
import Loader from '../common/Loader';
import { useTranslation } from 'react-i18next';

const FumigationCleaningCatalog = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('price_low_high');
  const [expandedService, setExpandedService] = useState(null);
  
  // Load service catalog
  useEffect(() => {
    const loadCatalog = async () => {
      setLoading(true);
      try {
        // Load categories
        const categoriesRes = await api.get('/fumigation-cleaning/categories');
        setCategories(categoriesRes.data?.data || []);
        
        // Load all services
        const servicesRes = await api.get('/fumigation-cleaning/services');
        setServices(servicesRes.data?.data || []);
        setFilteredServices(servicesRes.data?.data || []);
      } catch (error) {
        console.error('Error loading service catalog:', error);
        toast.error(t('fumigation_catalog.load_failed', 'Failed to load service catalog'));
      } finally {
        setLoading(false);
      }
    };
    
    loadCatalog();
  }, []);
  
  // Filter and sort services
  useEffect(() => {
    let result = [...services];
    
    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter(service => 
        service.category_type === selectedCategory
      );
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(service =>
        service.service_name.toLowerCase().includes(query) ||
        service.service_description.toLowerCase().includes(query) ||
        service.category_name.toLowerCase().includes(query)
      );
    }
    
    // Sort services
    switch (sortBy) {
      case 'price_low_high':
        result.sort((a, b) => a.base_price - b.base_price);
        break;
      case 'price_high_low':
        result.sort((a, b) => b.base_price - a.base_price);
        break;
      case 'duration_low_high':
        result.sort((a, b) => a.duration_hours - b.duration_hours);
        break;
      case 'duration_high_low':
        result.sort((a, b) => b.duration_hours - a.duration_hours);
        break;
      case 'name_asc':
        result.sort((a, b) => a.service_name.localeCompare(b.service_name));
        break;
      case 'name_desc':
        result.sort((a, b) => b.service_name.localeCompare(a.service_name));
        break;
      default:
        break;
    }
    
    setFilteredServices(result);
  }, [services, selectedCategory, searchQuery, sortBy]);
  
  const getServiceIcon = (categoryType) => {
    switch (categoryType) {
      case 'fumigation': return <FaSprayCan className="text-red-600" />;
      case 'cleaning': return <FaBroom className="text-blue-600" />;
      case 'deep_cleaning': return <FaShieldAlt className="text-green-600" />;
      default: return <FaSprayCan className="text-gray-600" />;
    }
  };
  
  const getCategoryName = (categoryType) => {
    switch (categoryType) {
      case 'fumigation': return t('fumigation_catalog.cat_fumigation', 'Fumigation Services');
      case 'cleaning': return t('fumigation_catalog.cat_cleaning', 'Cleaning Services');
      case 'deep_cleaning': return t('fumigation_catalog.cat_deep_cleaning', 'Deep Cleaning');
      default: return t('fumigation_catalog.cat_other', 'Other Services');
    }
  };
  
    const handleBookService = (serviceId) => {
    if (!user) {
      toast.error(t('fumigation_catalog.login_required', 'Please login to book services'));
      navigate('/login');
      return;
    }
    
    if (user.user_type !== 'tenant') {
      toast.error(t('fumigation_catalog.only_tenants', 'Only tenants can book fumigation/cleaning services'));
      navigate('/dashboard');
      return;
    }
    
    // Navigate to booking page where they can select a property
    navigate(`/fumigation-cleaning/booking?serviceId=${serviceId}`);
  };
  
  const toggleServiceDetails = (serviceId) => {
    if (expandedService === serviceId) {
      setExpandedService(null);
    } else {
      setExpandedService(serviceId);
    }
  };
  
  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <FaStar
          key={i}
          className={i <= rating ? 'text-yellow-500' : 'text-gray-300'}
        />
      );
    }
    return stars;
  };
  
  if (loading) {
    return <Loader />;
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {t('fumigation_catalog.title', 'Fumigation & Cleaning Services')}
          </h1>
          <p className="text-gray-600 max-w-3xl mx-auto">
            {t('fumigation_catalog.subtitle', 'Professional fumigation and cleaning services for your rental property. Book certified professionals for pest control, deep cleaning, and maintenance services.')}
          </p>
        </div>
        
        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaFilter className="inline mr-2" />
                {t('fumigation_catalog.service_category', 'Service Category')}
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input w-full"
              >
                <option value="all">{t('fumigation_catalog.all_categories', 'All Categories')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.category_type}>
                    {getCategoryName(category.category_type)}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaSearch className="inline mr-2" />
                {t('fumigation_catalog.search_services', 'Search Services')}
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('fumigation_catalog.search_placeholder', 'Search by service name or description...')}
                className="input w-full"
              />
            </div>
            
            {/* Sort */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaSortAmountDown className="inline mr-2" />
                {t('fumigation_catalog.sort_by', 'Sort By')}
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input w-full"
              >
                <option value="price_low_high">{t('fumigation_catalog.sort_price_low_high', 'Price: Low to High')}</option>
                <option value="price_high_low">{t('fumigation_catalog.sort_price_high_low', 'Price: High to Low')}</option>
                <option value="duration_low_high">{t('fumigation_catalog.sort_duration_low_high', 'Duration: Short to Long')}</option>
                <option value="duration_high_low">{t('fumigation_catalog.sort_duration_high_low', 'Duration: Long to Short')}</option>
                <option value="name_asc">{t('fumigation_catalog.sort_name_asc', 'Name: A to Z')}</option>
                <option value="name_desc">{t('fumigation_catalog.sort_name_desc', 'Name: Z to A')}</option>
              </select>
            </div>
          </div>
          
          {/* Active Filters */}
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedCategory !== 'all' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {t('fumigation_catalog.active_category', 'Category: {{name}}', { name: getCategoryName(selectedCategory) })}
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                {t('fumigation_catalog.active_search', 'Search: {{query}}', { query: searchQuery })}
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-2 text-green-600 hover:text-green-800"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        </div>
        
        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
            >
              {/* Service Header */}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="text-3xl mr-3">
                      {getServiceIcon(service.category_type)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">
                        {service.service_name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {service.category_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      ₦{service.base_price.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500">{t('fumigation_catalog.starting_from', 'starting from')}</div>
                  </div>
                </div>
                
                {/* Service Description */}
                <p className="text-gray-600 mb-4 line-clamp-2">
                  {service.service_description}
                </p>
                
                {/* Service Details */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center text-sm">
                    <FaClock className="text-gray-400 mr-2" />
                    <span>{t('fumigation_catalog.hours', '{{count}} hours', { count: service.duration_hours })}</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <FaUsers className="text-gray-400 mr-2" />
                    <span>{t('fumigation_catalog.people', '{{count}} people', { count: service.team_size })}</span>
                  </div>
                </div>
                
                {/* Rating */}
                <div className="flex items-center mb-4">
                  <div className="flex items-center mr-2">
                    {renderStars(service.average_rating || 4.5)}
                  </div>
                  <span className="text-sm text-gray-600">
                    {t('fumigation_catalog.reviews', '({{count}} reviews)', { count: service.review_count || 0 })}
                  </span>
                </div>
                
                {/* Action Buttons */}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => handleBookService(service.id)}
                    className="btn btn-primary w-full sm:flex-1"
                  >
                    {t('fumigation_catalog.book_now', 'Book Now')}
                  </button>
                  <button
                    onClick={() => toggleServiceDetails(service.id)}
                    className="btn btn-outline w-full sm:w-auto"
                  >
                    {expandedService === service.id ? t('fumigation_catalog.less', 'Less') : t('fumigation_catalog.details', 'Details')}
                  </button>
                </div>
              </div>
              
              {/* Expanded Details */}
              {expandedService === service.id && (
                <div className="border-t border-gray-200 p-6 bg-gray-50">
                  <h4 className="font-bold text-gray-900 mb-3">{t('fumigation_catalog.service_details', 'Service Details')}</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <h5 className="font-semibold text-gray-700 mb-1">{t('fumigation_catalog.whats_included', "What's Included")}</h5>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li className="flex items-start">
                          <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          {t('fumigation_catalog.included_team', 'Professional {{type}} team', { type: service.category_type === 'fumigation' ? t('fumigation_catalog.pest_control', 'pest control') : t('fumigation_catalog.cleaning', 'cleaning') })}
                        </li>
                        <li className="flex items-start">
                          <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          {t('fumigation_catalog.included_equipment', 'All necessary equipment and supplies')}
                        </li>
                        <li className="flex items-start">
                          <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          {t('fumigation_catalog.included_safety', 'Safety gear and protective equipment')}
                        </li>
                        <li className="flex items-start">
                          <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          {t('fumigation_catalog.included_inspection', 'Post-service inspection')}
                        </li>
                        {service.category_type === 'fumigation' && (
                          <li className="flex items-start">
                            <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                            {t('fumigation_catalog.included_follow_up', 'Follow-up inspection (if needed)')}
                          </li>
                        )}
                      </ul>
                    </div>
                    
                    <div>
                      <h5 className="font-semibold text-gray-700 mb-1">{t('fumigation_catalog.preparation_required', 'Preparation Required')}</h5>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>{t('fumigation_catalog.prep_clear_access', '• Clear access to all areas')}</li>
                        <li>{t('fumigation_catalog.prep_remove_items', '• Remove personal items from surfaces')}</li>
                        <li>{t('fumigation_catalog.prep_secure_pets', '• Secure pets and children')}</li>
                        <li>{t('fumigation_catalog.prep_ventilation', '• Ensure proper ventilation')}</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h5 className="font-semibold text-gray-700 mb-1">{t('fumigation_catalog.service_coverage', 'Service Coverage')}</h5>
                      <p className="text-sm text-gray-600">
                        {t('fumigation_catalog.coverage_text', 'Covers up to {{sqm}} sqm. Additional charges apply for larger properties.', { sqm: service.max_coverage_sqm || 150 })}
                      </p>
                    </div>
                    
                    {service.addons && service.addons.length > 0 && (
                      <div>
                        <h5 className="font-semibold text-gray-700 mb-1">{t('fumigation_catalog.available_addons', 'Available Addons')}</h5>
                        <div className="space-y-2">
                          {service.addons.slice(0, 3).map((addon) => (
                            <div key={addon.id} className="flex justify-between text-sm">
                              <span className="text-gray-600">{addon.addon_name}</span>
                              <span className="font-semibold">+₦{addon.addon_price.toLocaleString()}</span>
                            </div>
                          ))}
                          {service.addons.length > 3 && (
                            <p className="text-xs text-gray-500">
                              {t('fumigation_catalog.more_addons', '+{{count}} more addons available', { count: service.addons.length - 3 })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* Empty State */}
        {filteredServices.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-5xl mb-4">
              <FaSprayCan className="inline-block" />
              <FaBroom className="inline-block ml-2" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t('fumigation_catalog.no_services_found', 'No Services Found')}</h3>
            <p className="text-gray-600 mb-6">
              {t('fumigation_catalog.no_services_hint', 'Try adjusting your filters or search criteria')}
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="btn btn-primary"
            >
              {t('fumigation_catalog.clear_all_filters', 'Clear All Filters')}
            </button>
          </div>
        )}
        
        {/* Service Categories Summary */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            {t('fumigation_catalog.service_categories', 'Service Categories')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categories.map((category) => (
              <div
                key={category.id}
                className="bg-white rounded-lg shadow p-6 text-center hover:shadow-lg transition-shadow"
              >
                <div className="text-4xl mb-4 flex justify-center">
                  {getServiceIcon(category.category_type)}
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">
                  {getCategoryName(category.category_type)}
                </h3>
                <p className="text-gray-600 mb-4">
                  {category.category_description}
                </p>
                <div className="text-sm text-gray-500">
                  {t('fumigation_catalog.services_available', '{{count}} services available', { count: services.filter(s => s.category_id === category.id).length })}
                </div>
              </div>
            ))}
          </div>
        </div>
        
                {/* Call to Action */}
        <div className="mt-12 bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg shadow-lg p-8 text-center text-white">
          <h2 className="text-2xl font-bold mb-4">
            {t('fumigation_catalog.cta_title', 'Ready to Book Professional Services?')}
          </h2>
          <p className="mb-6 opacity-90">
            {t('fumigation_catalog.cta_text', 'Schedule fumigation or cleaning services for your rental property today. Certified professionals, guaranteed quality, and easy booking.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              user.user_type === 'tenant' ? (
                <button
                  onClick={() => navigate('/my-properties?service=fumigation-cleaning')}
                  className="btn bg-white text-blue-600 hover:bg-gray-100"
                >
                  {t('fumigation_catalog.book_service_now', 'Book a Service Now')}
                </button>
              ) : (
                <div className="text-white opacity-90">
                  <p>{t('fumigation_catalog.tenants_only_text', 'Fumigation & Cleaning services are available for tenants only.')}</p>
                  <p className="text-sm mt-2">{t('fumigation_catalog.switch_tenant_account', 'Switch to a tenant account to book services.')}</p>
                </div>
              )
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="btn bg-white text-blue-600 hover:bg-gray-100"
                >
                  {t('fumigation_catalog.login_to_book', 'Login to Book')}
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="btn bg-transparent border-2 border-white text-white hover:bg-white hover:text-blue-600"
                >
                  {t('fumigation_catalog.create_account', 'Create Account')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            {t('fumigation_catalog.faq_title', 'Frequently Asked Questions')}
          </h2>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-gray-900 mb-2">
                  {t('fumigation_catalog.faq_advance_q', 'How far in advance should I book?')}
                </h3>
                <p className="text-gray-600">
                  {t('fumigation_catalog.faq_advance_a', "We recommend booking at least 24-48 hours in advance to ensure availability. For urgent requests, please call our support line.")}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-2">
                  {t('fumigation_catalog.faq_safety_q', 'What safety measures are in place?')}
                </h3>
                <p className="text-gray-600">
                  {t('fumigation_catalog.faq_safety_a', "All our teams are trained in safety protocols, use approved chemicals and equipment, and follow strict compliance guidelines. We provide safety briefings and use proper PPE.")}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-2">
                  {t('fumigation_catalog.faq_cancel_q', 'Can I cancel or reschedule my booking?')}
                </h3>
                <p className="text-gray-600">
                  {t('fumigation_catalog.faq_cancel_a', 'Yes, you can cancel or reschedule up to 12 hours before the scheduled service without any penalty. Cancellations within 12 hours may incur a 50% fee.')}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-2">
                  {t('fumigation_catalog.faq_pricing_q', 'How is pricing calculated?')}
                </h3>
                <p className="text-gray-600">
                  {t('fumigation_catalog.faq_pricing_a', "Pricing is based on property size, service type, and any additional addons. You'll see the exact price before confirming your booking.")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="mt-8 text-center">
          <p className="text-gray-600">
            {t('fumigation_catalog.contact_hint', 'Need help choosing the right service? Contact our support team:')}
          </p>
          <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
            <span className="text-blue-600 font-medium">📞 +234 800 123 4567</span>
            <span className="text-blue-600 font-medium">✉️ cleaning@rentalhub.com</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FumigationCleaningCatalog;

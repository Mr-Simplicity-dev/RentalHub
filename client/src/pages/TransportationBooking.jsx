import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import {
  FaTruck,
  FaShuttleVan,
  FaCar,
  FaBox,
  FaCalendarAlt,
  FaClock,
  FaMapMarkerAlt,
  FaRoute,
  FaMoneyBillWave,
  FaCheckCircle,
  FaTimesCircle
} from 'react-icons/fa';
import Loader from '../components/common/Loader';

const TransportationBooking = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const propertyId = queryParams.get('propertyId');

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [property, setProperty] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    pickup_address: '',
    destination_address: '',
    estimated_distance_km: '',
    booking_date: '',
    booking_time: '09:00',
    items_description: '',
    special_requirements: ''
  });
  
  const [priceCalculation, setPriceCalculation] = useState(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);

  // Check eligibility and load data
  useEffect(() => {
    const loadData = async () => {
      if (!user || user.user_type !== 'tenant') {
        toast.error(t('transportation_booking.only_tenants'));
        navigate('/dashboard');
        return;
      }

      setLoading(true);
      try {
        // Check eligibility
        if (propertyId) {
          const eligibilityRes = await api.get(`/transportation/eligibility/${propertyId}`);
          setEligibility(eligibilityRes.data?.data);
          
          if (!eligibilityRes.data?.data?.can_book) {
            toast.error(eligibilityRes.data?.data?.reason || t('transportation_booking.cannot_book'));
            navigate('/dashboard');
            return;
          }
          
          // Load property details
          const propertyRes = await api.get(`/properties/${propertyId}`);
          setProperty(propertyRes.data?.data);
          
          // Set pickup address as property address
          if (propertyRes.data?.data?.full_address) {
            setFormData(prev => ({
              ...prev,
              pickup_address: propertyRes.data.data.full_address
            }));
          }
        }
        
        // Load transportation services
        const servicesRes = await api.get('/transportation/services');
        setServices(servicesRes.data?.data || []);
        
        // Select first service by default
        if (servicesRes.data?.data?.length > 0) {
          setSelectedService(servicesRes.data.data[0]);
        }
      } catch (error) {
        console.error('Error loading transportation data:', error);
        toast.error(t('transportation_booking.failed_load_services'));
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, propertyId, navigate]);

  // Calculate price when service or distance changes
  useEffect(() => {
    const calculatePrice = async () => {
      if (!selectedService || !formData.estimated_distance_km) return;
      
      setCalculatingPrice(true);
      try {
        const response = await api.post('/transportation/calculate-price', {
          serviceId: selectedService.id,
          distanceKm: formData.estimated_distance_km
        });
        
        if (response.data?.success) {
          setPriceCalculation(response.data.data);
        }
      } catch (error) {
        console.error('Error calculating price:', error);
        toast.error(t('transportation_booking.failed_calc_price'));
      } finally {
        setCalculatingPrice(false);
      }
    };

    // Debounce price calculation
    const timeoutId = setTimeout(() => {
      if (formData.estimated_distance_km) {
        calculatePrice();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [selectedService, formData.estimated_distance_km]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleServiceSelect = (service) => {
    setSelectedService(service);
  };

  const getServiceIcon = (serviceType) => {
    switch (serviceType) {
      case 'van': return <FaShuttleVan className="text-blue-600" />;
      case 'truck': return <FaTruck className="text-green-600" />;
      case 'pickup': return <FaCar className="text-orange-600" />;
      case 'moving_company': return <FaBox className="text-purple-600" />;
      default: return <FaTruck className="text-gray-600" />;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedService) {
      toast.error(t('transportation_booking.select_service'));
      return;
    }
    
    if (!priceCalculation) {
      toast.error(t('transportation_booking.enter_distance'));
      return;
    }
    
    // Validate required fields
    const requiredFields = ['pickup_address', 'destination_address', 'booking_date', 'booking_time'];
    for (const field of requiredFields) {
      if (!formData[field]) {
        toast.error(t('transportation_booking.fill_in', { field: field.replace('_', ' ') }));
        return;
      }
    }
    
    setCreatingBooking(true);
    try {
      const bookingData = {
        property_id: propertyId,
        service_id: selectedService.id,
        ...formData,
        estimated_distance_km: parseFloat(formData.estimated_distance_km)
      };
      
      const response = await api.post('/transportation/bookings', bookingData);
      
      if (response.data?.success) {
        toast.success(t('transportation_booking.created_success'));
        // Navigate to payment page
        navigate(`/transportation/payment/${response.data.data.id}`);
      } else {
        toast.error(response.data?.message || t('transportation_booking.failed_create'));
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error(error.response?.data?.message || t('transportation_booking.failed_create_booking'));
    } finally {
      setCreatingBooking(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  if (!eligibility?.can_book) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <FaTimesCircle className="text-red-500 text-5xl mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('transportation_booking.cannot_book_title')}</h1>
            <p className="text-gray-600 mb-6">{eligibility?.reason || t('transportation_booking.not_eligible')}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-primary"
            >
              {t('transportation_booking.return_dashboard')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('transportation_booking.page_title')}</h1>
          <p className="text-gray-600">
            {t('transportation_booking.page_subtitle', { property: property?.title || t('transportation_booking.your_new_property') })}
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Service selection */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <FaTruck className="mr-2" />
                {t('transportation_booking.select_service_title')}
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedService?.id === service.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                    onClick={() => handleServiceSelect(service)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center">
                        <div className="text-2xl mr-3">
                          {getServiceIcon(service.service_type)}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{service.service_name}</h3>
                          <p className="text-sm text-gray-600 capitalize">{service.service_type.replace('_', ' ')}</p>
                        </div>
                      </div>
                      {selectedService?.id === service.id && (
                        <FaCheckCircle className="text-green-500 text-xl" />
                      )}
                    </div>
                    
                    <div className="mb-3">
                      <p className="text-gray-600 text-sm">{service.description}</p>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm text-gray-600">{t('transportation_booking.capacity')}</div>
                        <div className="font-semibold">{service.capacity_kg} kg</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">{t('transportation_booking.base_price')}</div>
                        <div className="font-bold text-lg text-blue-600">
                          ₦{service.base_price.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-3 text-sm text-gray-500">
                      {t('transportation_booking.per_km', { price: service.price_per_km.toLocaleString() })}
                    </div>
                  </div>
                ))}
              </div>
              
              {selectedService && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-bold text-blue-800 mb-2">{t('transportation_booking.selected_service', { name: selectedService.service_name })}</h3>
                  <p className="text-blue-700">{selectedService.description}</p>
                  <div className="mt-2 text-sm text-blue-600">
                    {t('transportation_booking.provider_info', { name: selectedService.provider_name, phone: selectedService.provider_phone })}
                  </div>
                </div>
              )}
            </div>

                        {/* Booking Form */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <FaCalendarAlt className="mr-2" />
                {t('transportation_booking.booking_details')}
              </h2>
              
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <FaMapMarkerAlt className="inline mr-1" />
                      {t('transportation_booking.pickup_address')} *
                    </label>
                    <input
                      type="text"
                      name="pickup_address"
                      value={formData.pickup_address}
                      onChange={handleInputChange}
                      className="input w-full"
                      placeholder={t('transportation_booking.pickup_placeholder')}
                      required
                    />
                    {property && (
                      <p className="text-xs text-gray-500 mt-1">
                        {t('transportation_booking.property_address', { address: property.full_address })}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <FaMapMarkerAlt className="inline mr-1" />
                      {t('transportation_booking.destination_address')} *
                    </label>
                    <input
                      type="text"
                      name="destination_address"
                      value={formData.destination_address}
                      onChange={handleInputChange}
                      className="input w-full"
                      placeholder={t('transportation_booking.destination_placeholder')}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <FaRoute className="inline mr-1" />
                      {t('transportation_booking.estimated_distance')} *
                    </label>
                    <input
                      type="number"
                      name="estimated_distance_km"
                      value={formData.estimated_distance_km}
                      onChange={handleInputChange}
                      className="input w-full"
                      placeholder={t('transportation_booking.distance_placeholder')}
                      min="0"
                      step="0.1"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('transportation_booking.distance_hint')}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <FaCalendarAlt className="inline mr-1" />
                      {t('transportation_booking.booking_date')} *
                    </label>
                    <input
                      type="date"
                      name="booking_date"
                      value={formData.booking_date}
                      onChange={handleInputChange}
                      className="input w-full"
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <FaClock className="inline mr-1" />
                      {t('transportation_booking.preferred_time')} *
                    </label>
                    <select
                      name="booking_time"
                      value={formData.booking_time}
                      onChange={handleInputChange}
                      className="input w-full"
                      required
                    >
                      <option value="08:00">{t('transportation_booking.time_0800')}</option>
                      <option value="09:00">{t('transportation_booking.time_0900')}</option>
                      <option value="10:00">{t('transportation_booking.time_1000')}</option>
                      <option value="11:00">{t('transportation_booking.time_1100')}</option>
                      <option value="12:00">{t('transportation_booking.time_1200')}</option>
                      <option value="13:00">{t('transportation_booking.time_1300')}</option>
                      <option value="14:00">{t('transportation_booking.time_1400')}</option>
                      <option value="15:00">{t('transportation_booking.time_1500')}</option>
                      <option value="16:00">{t('transportation_booking.time_1600')}</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('transportation_booking.items_to_move')}
                    </label>
                    <input
                      type="text"
                      name="items_description"
                      value={formData.items_description}
                      onChange={handleInputChange}
                      className="input w-full"
                      placeholder={t('transportation_booking.items_placeholder')}
                    />
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('transportation_booking.special_requirements')}
                  </label>
                  <textarea
                    name="special_requirements"
                    value={formData.special_requirements}
                    onChange={handleInputChange}
                    className="input w-full h-24"
                    placeholder={t('transportation_booking.special_placeholder')}
                  />
                </div>
                
                {/* Price Summary */}
                {priceCalculation && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <h3 className="font-bold text-green-800 mb-3 flex items-center">
                      <FaMoneyBillWave className="mr-2" />
                      {t('transportation_booking.price_summary')}
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">{t('transportation_booking.base_price_label')}:</span>
                        <span className="font-semibold">₦{priceCalculation.base_price.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">{t('transportation_booking.distance_charge', { km: formData.estimated_distance_km })}:</span>
                        <span className="font-semibold">₦{priceCalculation.distance_price.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t border-green-200 pt-2 mt-2">
                        <span className="text-lg font-bold text-green-800">{t('transportation_booking.total_price_label')}:</span>
                        <span className="text-2xl font-bold text-green-800">
                          ₦{priceCalculation.total_price.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="btn btn-gray w-full sm:flex-1"
                    disabled={creatingBooking}
                  >
                    {t('transportation_booking.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary w-full sm:flex-1"
                    disabled={creatingBooking || !priceCalculation || calculatingPrice}
                  >
                    {creatingBooking ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {t('transportation_booking.creating')}
                      </>
                    ) : (
                      t('transportation_booking.proceed_payment')
                    )}
                  </button>
                </div>
                
                {calculatingPrice && (
                  <div className="text-center mt-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-sm text-gray-600 mt-2">{t('transportation_booking.calculating')}</p>
                  </div>
                )}
              </form>
            </div>
          </div>
          
          {/* Right column - Summary and Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">{t('transportation_booking.booking_info')}</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('transportation_booking.property_details')}</h4>
                  {property ? (
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="font-medium">{property.title}</p>
                      <p className="text-sm text-gray-600">{property.full_address}</p>
                      <p className="text-sm text-gray-600">
                        {t('transportation_booking.bed_bath', { bed: property.bedrooms, bath: property.bathrooms })}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">{t('transportation_booking.no_property')}</p>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('transportation_booking.eligibility_status')}</h4>
                  <div className={`p-3 rounded ${
                    eligibility?.can_book 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-center">
                      {eligibility?.can_book ? (
                        <>
                          <FaCheckCircle className="text-green-500 mr-2" />
                          <span className="text-green-700 font-medium">{t('transportation_booking.eligible')}</span>
                        </>
                      ) : (
                        <>
                          <FaTimesCircle className="text-red-500 mr-2" />
                          <span className="text-red-700 font-medium">{t('transportation_booking.not_eligible_label')}</span>
                        </>
                      )}
                    </div>
                    {eligibility?.reason && (
                      <p className="text-sm mt-2">
                        {eligibility.can_book ? '✓ ' : '✗ '}
                        {eligibility.reason}
                      </p>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('transportation_booking.important_notes')}</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      {t('transportation_booking.note_24h')}
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      {t('transportation_booking.note_cancel')}
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      {t('transportation_booking.note_parking')}
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      {t('transportation_booking.note_driver')}
                    </li>
                  </ul>
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-700 mb-2">{t('transportation_booking.need_help')}</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    {t('transportation_booking.contact_support')}
                  </p>
                  <div className="text-sm">
                    <p className="text-gray-700">📞 +234 800 123 4567</p>
                    <p className="text-gray-700">✉️ transport@rentalhub.com</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransportationBooking;

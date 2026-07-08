import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  FaSprayCan,
  FaBroom,
  FaCalendarAlt,
  FaClock,
  FaHome,
  FaRulerCombined,
  FaDoorOpen,
  FaClipboardList,
  FaMoneyBillWave,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaShieldAlt
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import Loader from '../components/common/Loader';

const FumigationCleaningBooking = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const propertyId = queryParams.get('propertyId');

const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [property, setProperty] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  
  // Form state
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Service Selection
    service_id: '',
    
    // Step 2: Property Details
    property_size_sqm: '',
    number_of_rooms: '',
    property_condition: 'normal',
    
    // Step 3: Date & Time
    booking_date: '',
    preferred_time_slot: 'morning',
    specific_time: '09:00',
    
    // Step 4: Addons
    selected_addons: [],
    
    // Step 5: Special Instructions
    special_instructions: '',
    
    // Step 6: Price Calculation
    base_service_price: 0,
    addons_total_price: 0,
    total_price: 0
  });
  
  const [serviceAddons, setServiceAddons] = useState([]);
  const [priceCalculation, setPriceCalculation] = useState(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);

  // Check eligibility and load data
  useEffect(() => {
    const loadData = async () => {
      if (!user || user.user_type !== 'tenant') {
        toast.error(t('fumigation_cleaning_booking.only_tenants'));
        navigate('/dashboard');
        return;
      }

      setLoading(true);
      try {
        if (propertyId) {
          const eligibilityRes = await api.get(`/fumigation-cleaning/eligibility/${propertyId}`);
          setEligibility(eligibilityRes.data?.data);
          
          if (!eligibilityRes.data?.data?.can_book) {
            toast.error(eligibilityRes.data?.data?.reason || t('fumigation_cleaning_booking.cannot_book'));
            navigate('/dashboard');
            return;
          }
          
          // Load property details
          const propertyRes = await api.get(`/properties/${propertyId}`);
          setProperty(propertyRes.data?.data);
          
          // Pre-fill property details
          if (propertyRes.data?.data) {
            const prop = propertyRes.data.data;
            setFormData(prev => ({
              ...prev,
              number_of_rooms: prop.bedrooms || 1,
              property_size_sqm: prop.size_sqm || ''
            }));
          }
        }
        
        // Load service categories
        const categoriesRes = await api.get('/fumigation-cleaning/categories');
        setCategories(categoriesRes.data?.data || []);
        
        // Load all services
        const servicesRes = await api.get('/fumigation-cleaning/services');
        setServices(servicesRes.data?.data || []);
        
      } catch (error) {
        console.error('Error loading fumigation/cleaning data:', error);
        toast.error(t('fumigation_cleaning_booking.load_failed'));
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, propertyId, navigate]);

  // Load addons when service is selected
  useEffect(() => {
    const loadAddons = async () => {
      if (!formData.service_id) return;
      
      try {
        const serviceRes = await api.get(`/fumigation-cleaning/services/${formData.service_id}`);
        if (serviceRes.data?.data?.addons) {
          setServiceAddons(serviceRes.data.data.addons);
        }
      } catch (error) {
        console.error('Error loading service addons:', error);
      }
    };

    loadAddons();
  }, [formData.service_id]);

  // Calculate price when service or property details change
  useEffect(() => {
    const calculatePrice = async () => {
      if (!formData.service_id || !formData.property_size_sqm) return;
      
      setCalculatingPrice(true);
      try {
        const response = await api.post('/fumigation-cleaning/calculate-price', {
          serviceId: formData.service_id,
          propertySizeSqm: formData.property_size_sqm,
          selectedAddons: formData.selected_addons
        });
        
        if (response.data?.success) {
          setPriceCalculation(response.data.data);
          setFormData(prev => ({
            ...prev,
            base_service_price: response.data.data.base_price,
            addons_total_price: response.data.data.addons_total,
            total_price: response.data.data.total_price
          }));
        }
      } catch (error) {
        console.error('Error calculating price:', error);
        toast.error(t('fumigation_cleaning_booking.price_calc_failed'));
      } finally {
        setCalculatingPrice(false);
      }
    };

    // Debounce price calculation
    const timeoutId = setTimeout(() => {
      if (formData.service_id && formData.property_size_sqm) {
        calculatePrice();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.service_id, formData.property_size_sqm, formData.selected_addons]);

  // Load available dates when service and month/year are known
  useEffect(() => {
    const loadAvailableDates = async () => {
      if (!formData.service_id || !formData.booking_date) return;
      
      const date = new Date(formData.booking_date);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      
      try {
        const response = await api.get(`/fumigation-cleaning/available-dates/${formData.service_id}/${month}/${year}`);
        if (response.data?.success) {
          setAvailableDates(response.data.data.fullyBookedDates || []);
        }
      } catch (error) {
        console.error('Error loading available dates:', error);
      }
    };

    loadAvailableDates();
  }, [formData.service_id, formData.booking_date]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleServiceSelect = (service) => {
    setSelectedService(service);
    setFormData(prev => ({
      ...prev,
      service_id: service.id
    }));
    setCurrentStep(2);
  };

  const handleAddonToggle = (addonId) => {
    setFormData(prev => {
      const currentAddons = [...prev.selected_addons];
      const index = currentAddons.indexOf(addonId);
      
      if (index > -1) {
        currentAddons.splice(index, 1);
      } else {
        currentAddons.push(addonId);
      }
      
      return {
        ...prev,
        selected_addons: currentAddons
      };
    });
  };

  const getServiceIcon = (categoryType) => {
    switch (categoryType) {
      case 'fumigation': return <FaSprayCan className="text-red-600" />;
      case 'cleaning': return <FaBroom className="text-blue-600" />;
      case 'deep_cleaning': return <FaShieldAlt className="text-green-600" />;
      default: return <FaHome className="text-gray-600" />;
    }
  };

  const getCategoryName = (categoryType) => {
    switch (categoryType) {
      case 'fumigation': return t('fumigation_cleaning_booking.category_fumigation');
      case 'cleaning': return t('fumigation_cleaning_booking.category_cleaning');
      case 'deep_cleaning': return t('fumigation_cleaning_booking.category_deep_cleaning');
      default: return t('fumigation_cleaning_booking.category_other');
    }
  };

  const nextStep = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        return !!formData.service_id;
      case 2:
        return !!formData.property_size_sqm && !!formData.number_of_rooms;
      case 3:
        return !!formData.booking_date;
      case 4:
        return true; // Addons are optional
      case 5:
        return true; // Instructions are optional
      case 6:
        return !!priceCalculation;
      default:
        return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateStep(6)) {
      toast.error(t('fumigation_cleaning_booking.complete_required'));
      return;
    }
    
    setCreatingBooking(true);
    try {
      const bookingData = {
        property_id: propertyId,
        ...formData,
        property_size_sqm: parseFloat(formData.property_size_sqm),
        number_of_rooms: parseInt(formData.number_of_rooms)
      };
      
      const response = await api.post('/fumigation-cleaning/bookings', bookingData);
      
      if (response.data?.success) {
        toast.success(t('fumigation_cleaning_booking.booking_created'));
        navigate(`/fumigation-cleaning/payment/${response.data.data.id}`);
      } else {
        toast.error(response.data?.message || t('fumigation_cleaning_booking.create_failed'));
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error(error.response?.data?.message || t('fumigation_cleaning_booking.create_failed'));
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
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('fumigation_cleaning_booking.cannot_book_title')}</h1>
            <p className="text-gray-600 mb-6">{eligibility?.reason || t('fumigation_cleaning_booking.cannot_book')}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-primary"
            >
              {t('fumigation_cleaning_booking.return_to_dashboard')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step indicators
  const steps = [
    { number: 1, title: t('fumigation_cleaning_booking.step1'), icon: <FaSprayCan /> },
    { number: 2, title: t('fumigation_cleaning_booking.step2'), icon: <FaHome /> },
    { number: 3, title: t('fumigation_cleaning_booking.step3'), icon: <FaCalendarAlt /> },
    { number: 4, title: t('fumigation_cleaning_booking.step4'), icon: <FaClipboardList /> },
    { number: 5, title: t('fumigation_cleaning_booking.step5'), icon: <FaClipboardList /> },
    { number: 6, title: t('fumigation_cleaning_booking.step6'), icon: <FaMoneyBillWave /> }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('fumigation_cleaning_booking.page_title')}</h1>
          <p className="text-gray-600">
            {t('fumigation_cleaning_booking.page_subtitle')} {property?.title || t('fumigation_cleaning_booking.your_property')}
          </p>
        </div>
        
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                  currentStep >= step.number 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {step.icon}
                </div>
                <span className={`text-sm font-medium ${
                  currentStep >= step.number ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {step.title}
                </span>
              </div>
            ))}
          </div>
          <div className="h-1 bg-gray-200 mt-4">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${((currentStep - 1) / 5) * 100}%` }}
            ></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <form onSubmit={handleSubmit}>
                {/* Step 1: Service Selection */}
                {currentStep === 1 && (
                  <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <FaSprayCan className="mr-2" />
                        {t('fumigation_cleaning_booking.select_service')}
                      </h2>
                    
                    <div className="space-y-6">
                      {categories.map((category) => (
                        <div key={category.id} className="border rounded-lg p-4">
                          <div className="flex items-center mb-4">
                            <div className="text-2xl mr-3">
                              {getServiceIcon(category.category_type)}
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900">{getCategoryName(category.category_type)}</h3>
                              <p className="text-sm text-gray-600">{category.category_description}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {services
                              .filter(service => service.category_id === category.id)
                              .map((service) => (
                                <div
                                  key={service.id}
                                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                                    formData.service_id === service.id
                                      ? 'border-blue-500 bg-blue-50'
                                      : 'border-gray-200 hover:border-blue-300'
                                  }`}
                                  onClick={() => handleServiceSelect(service)}
                                >
                                  <div className="flex justify-between items-start mb-3">
                                    <div>
                                      <h4 className="font-bold text-gray-900">{service.service_name}</h4>
                                      <p className="text-sm text-gray-600">{service.service_description}</p>
                                    </div>
                                    {formData.service_id === service.id && (
                                      <FaCheckCircle className="text-green-500 text-xl" />
                                    )}
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                    <div>
                                      <span className="text-gray-600">{t('fumigation_cleaning_booking.duration')}:</span>
                                      <span className="font-semibold ml-1">{service.duration_hours} {t('fumigation_cleaning_booking.hours')}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">{t('fumigation_cleaning_booking.team')}:</span>
                                      <span className="font-semibold ml-1">{service.team_size} {t('fumigation_cleaning_booking.people')}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="text-right">
                                      <div className="text-sm text-gray-600">{t('fumigation_cleaning_booking.starting_from')}</div>
                                    <div className="font-bold text-lg text-blue-600">
                                      ₦{service.base_price.toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Step 2: Property Details */}
                {currentStep === 2 && (
                  <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <FaHome className="mr-2" />
                        {t('fumigation_cleaning_booking.property_details')}
                      </h2>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <FaRulerCombined className="inline mr-1" />
                            {t('fumigation_cleaning_booking.property_size')}
                          </label>
                          <input
                            type="number"
                            name="property_size_sqm"
                            value={formData.property_size_sqm}
                            onChange={handleInputChange}
                            className="input w-full"
                            placeholder={t('fumigation_cleaning_booking.size_placeholder')}
                            min="0"
                            step="0.1"
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {t('fumigation_cleaning_booking.size_help')}
                          </p>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <FaDoorOpen className="inline mr-1" />
                            {t('fumigation_cleaning_booking.num_rooms')}
                          </label>
                                                  <input
                            type="number"
                            name="number_of_rooms"
                            value={formData.number_of_rooms}
                            onChange={handleInputChange}
                            className="input w-full"
                            placeholder={t('fumigation_cleaning_booking.rooms_placeholder')}
                            min="1"
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {t('fumigation_cleaning_booking.rooms_help')}
                          </p>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <FaExclamationTriangle className="inline mr-1" />
                            {t('fumigation_cleaning_booking.property_condition')}
                          </label>
                          <select
                            name="property_condition"
                            value={formData.property_condition}
                            onChange={handleInputChange}
                            className="input w-full"
                          >
                            <option value="normal">{t('fumigation_cleaning_booking.condition_normal')}</option>
                            <option value="dirty">{t('fumigation_cleaning_booking.condition_dirty')}</option>
                            <option value="very_dirty">{t('fumigation_cleaning_booking.condition_very_dirty')}</option>
                            <option value="infested">{t('fumigation_cleaning_booking.condition_infested')}</option>
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            {t('fumigation_cleaning_booking.condition_help')}
                          </p>
                        </div>
                      </div>
                  </div>
                )}
                
                {/* Step 3: Date & Time */}
                {currentStep === 3 && (
                  <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <FaCalendarAlt className="mr-2" />
                        {t('fumigation_cleaning_booking.select_date_time')}
                      </h2>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('fumigation_cleaning_booking.booking_date')}
                          </label>
                          <input
                            type="date"
                            name="booking_date"
                            value={formData.booking_date}
                            onChange={handleInputChange}
                            className="input w-full"
                            min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                            required
                          />
                          {availableDates.includes(formData.booking_date) && (
                            <p className="text-sm text-red-600 mt-1">
                              {t('fumigation_cleaning_booking.fully_booked')}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {t('fumigation_cleaning_booking.advance_notice')}
                          </p>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <FaClock className="inline mr-1" />
                            {t('fumigation_cleaning_booking.preferred_time')}
                          </label>
                          <select
                            name="preferred_time_slot"
                            value={formData.preferred_time_slot}
                            onChange={handleInputChange}
                            className="input w-full"
                            required
                          >
                            <option value="morning">{t('fumigation_cleaning_booking.time_morning')}</option>
                            <option value="afternoon">{t('fumigation_cleaning_booking.time_afternoon')}</option>
                            <option value="evening">{t('fumigation_cleaning_booking.time_evening')}</option>
                            <option value="specific">{t('fumigation_cleaning_booking.time_specific')}</option>
                          </select>
                        </div>
                        
                        {formData.preferred_time_slot === 'specific' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {t('fumigation_cleaning_booking.specific_time')}
                            </label>
                            <select
                              name="specific_time"
                              value={formData.specific_time}
                              onChange={handleInputChange}
                              className="input w-full"
                              required
                            >
                              <option value="08:00">{t('fumigation_cleaning_booking.time_0800')}</option>
                              <option value="09:00">{t('fumigation_cleaning_booking.time_0900')}</option>
                              <option value="10:00">{t('fumigation_cleaning_booking.time_1000')}</option>
                              <option value="11:00">{t('fumigation_cleaning_booking.time_1100')}</option>
                              <option value="12:00">{t('fumigation_cleaning_booking.time_1200')}</option>
                              <option value="13:00">{t('fumigation_cleaning_booking.time_1300')}</option>
                              <option value="14:00">{t('fumigation_cleaning_booking.time_1400')}</option>
                              <option value="15:00">{t('fumigation_cleaning_booking.time_1500')}</option>
                              <option value="16:00">{t('fumigation_cleaning_booking.time_1600')}</option>
                              <option value="17:00">{t('fumigation_cleaning_booking.time_1700')}</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                              {t('fumigation_cleaning_booking.service_hours')}
                            </p>
                          </div>
                        )}
                      </div>
                  </div>
                )}
                
                {/* Step 4: Addons */}
                {currentStep === 4 && (
                  <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <FaClipboardList className="mr-2" />
                        {t('fumigation_cleaning_booking.additional_services')}
                      </h2>
                      
                      {serviceAddons.length > 0 ? (
                        <div className="space-y-3">
                          {serviceAddons.map((addon) => (
                            <div
                              key={addon.id}
                              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                                formData.selected_addons.includes(addon.id)
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-blue-300'
                              }`}
                              onClick={() => handleAddonToggle(addon.id)}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-bold text-gray-900">{addon.addon_name}</h4>
                                  <p className="text-sm text-gray-600">{addon.addon_description}</p>
                                  {addon.duration_addition_hours > 0 && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {t('fumigation_cleaning_booking.addon_duration', { hours: addon.duration_addition_hours })}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="font-bold text-lg text-blue-600">
                                    ₦{addon.addon_price.toLocaleString()}
                                  </div>
                                  {formData.selected_addons.includes(addon.id) && (
                                    <FaCheckCircle className="text-green-500 text-xl mt-2" />
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-gray-500">{t('fumigation_cleaning_booking.no_addons')}</p>
                        </div>
                      )}
                  </div>
                )}
                
                {/* Step 5: Special Instructions */}
                {currentStep === 5 && (
                  <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <FaClipboardList className="mr-2" />
                        {t('fumigation_cleaning_booking.special_instructions')}
                      </h2>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('fumigation_cleaning_booking.additional_info')}
                        </label>
                        <textarea
                          name="special_instructions"
                          value={formData.special_instructions}
                          onChange={handleInputChange}
                          className="input w-full h-40"
                          placeholder={t('fumigation_cleaning_booking.instructions_placeholder')}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {t('fumigation_cleaning_booking.instructions_help')}
                        </p>
                      </div>
                  </div>
                )}
                
                {/* Step 6: Review & Pay */}
                {currentStep === 6 && (
                  <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <FaMoneyBillWave className="mr-2" />
                        {t('fumigation_cleaning_booking.review_payment')}
                      </h2>
                      
                      {calculatingPrice ? (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                          <p className="text-gray-600 mt-2">{t('fumigation_cleaning_booking.calculating')}</p>
                        </div>
                      ) : priceCalculation ? (
                        <div className="space-y-6">
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="font-bold text-gray-900 mb-3">{t('fumigation_cleaning_booking.service_summary')}</h3>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">{t('fumigation_cleaning_booking.service')}:</span>
                                <span className="font-semibold">{selectedService?.service_name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">{t('fumigation_cleaning_booking.property_size')}:</span>
                                <span className="font-semibold">{formData.property_size_sqm} {t('fumigation_cleaning_booking.sqm')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">{t('fumigation_cleaning_booking.rooms')}:</span>
                                <span className="font-semibold">{formData.number_of_rooms}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">{t('fumigation_cleaning_booking.date')}:</span>
                                <span className="font-semibold">
                                  {new Date(formData.booking_date).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">{t('fumigation_cleaning_booking.time')}:</span>
                                <span className="font-semibold">
                                  {formData.preferred_time_slot === 'specific' 
                                    ? formData.specific_time 
                                    : formData.preferred_time_slot}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="font-bold text-blue-800 mb-3">{t('fumigation_cleaning_booking.price_breakdown')}</h3>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">{t('fumigation_cleaning_booking.base_service')}:</span>
                                <span className="font-semibold">₦{priceCalculation.base_price.toLocaleString()}</span>
                              </div>
                              
                              {formData.selected_addons.length > 0 && (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">{t('fumigation_cleaning_booking.additional_services')}:</span>
                                    <span className="font-semibold">₦{priceCalculation.addons_total.toLocaleString()}</span>
                                  </div>
                                  <div className="pl-4 text-sm text-gray-600">
                                    {priceCalculation.addon_details?.map((addon, index) => (
                                      <div key={index} className="flex justify-between">
                                        <span>• {addon.addon_name}:</span>
                                        <span>₦{addon.addon_price.toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              
                              <div className="flex justify-between border-t border-blue-200 pt-2 mt-2">
                                <span className="text-lg font-bold text-blue-800">{t('fumigation_cleaning_booking.total_amount')}:</span>
                                <span className="text-2xl font-bold text-blue-800">
                                  ₦{priceCalculation.total_price.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <h3 className="font-bold text-yellow-800 mb-2 flex items-center">
                              <FaExclamationTriangle className="mr-2" />
                              {t('fumigation_cleaning_booking.important_info')}
                            </h3>
                            <ul className="text-sm text-yellow-700 space-y-1">
                              <li>{t('fumigation_cleaning_booking.info_advance_booking')}</li>
                              <li>{t('fumigation_cleaning_booking.info_cancellation_fee')}</li>
                              <li>{t('fumigation_cleaning_booking.info_arrival_window')}</li>
                              <li>{t('fumigation_cleaning_booking.info_accessible')}</li>
                              <li>{t('fumigation_cleaning_booking.info_payment_required')}</li>
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-gray-500">{t('fumigation_cleaning_booking.complete_steps_first')}</p>
                        </div>
                      )}
                  </div>
                )}
                
                {/* Navigation Buttons */}
                <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
                  {currentStep > 1 ? (
                    <button
                      type="button"
                      onClick={prevStep}
                      className="btn btn-gray"
                      disabled={creatingBooking}
                    >
                      {t('fumigation_cleaning_booking.back')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="btn btn-gray"
                      disabled={creatingBooking}
                    >
                      {t('fumigation_cleaning_booking.cancel')}
                    </button>
                  )}
                  
                  {currentStep < 6 ? (
                    <button
                      type="button"
                      onClick={nextStep}
                      className="btn btn-primary"
                      disabled={!validateStep(currentStep) || creatingBooking}
                    >
                      {t('fumigation_cleaning_booking.continue')}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!validateStep(6) || creatingBooking || !priceCalculation}
                    >
                      {creatingBooking ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          {t('fumigation_cleaning_booking.creating')}
                        </>
                      ) : (
                        t('fumigation_cleaning_booking.proceed_to_payment')
                      )}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
          
          {/* Right column - Summary and Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">{t('fumigation_cleaning_booking.booking_info')}</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking.property_details')}</h4>
                  {property ? (
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="font-medium">{property.title}</p>
                      <p className="text-sm text-gray-600">{property.full_address}</p>
                      <p className="text-sm text-gray-600">
                        {property.bedrooms} {t('fumigation_cleaning_booking.bed')} • {property.bathrooms} {t('fumigation_cleaning_booking.bath')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">{t('fumigation_cleaning_booking.no_property')}</p>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking.selected_service')}</h4>
                  {selectedService ? (
                    <div className="bg-blue-50 p-3 rounded">
                      <p className="font-medium">{selectedService.service_name}</p>
                      <p className="text-sm text-gray-600">{selectedService.service_description}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                        <div>
                          <span className="text-gray-600">{t('fumigation_cleaning_booking.duration')}:</span>
                          <span className="font-semibold ml-1">{selectedService.duration_hours} {t('fumigation_cleaning_booking.hours')}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">{t('fumigation_cleaning_booking.team')}:</span>
                          <span className="font-semibold ml-1">{selectedService.team_size} {t('fumigation_cleaning_booking.people')}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">{t('fumigation_cleaning_booking.no_service')}</p>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking.current_step')}</h4>
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center mr-2">
                        {currentStep}
                      </div>
                      <div>
                        <p className="font-medium text-green-800">{steps[currentStep - 1]?.title}</p>
                        <p className="text-xs text-green-600">{t('fumigation_cleaning_booking.step_of', { current: currentStep, total: 6 })}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking.safety_info')}</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start">
                      <FaShieldAlt className="text-green-500 mr-2 mt-0.5" />
                      {t('fumigation_cleaning_booking.safety_trained')}
                    </li>
                    <li className="flex items-start">
                      <FaShieldAlt className="text-green-500 mr-2 mt-0.5" />
                      {t('fumigation_cleaning_booking.safety_chemicals')}
                    </li>
                    <li className="flex items-start">
                      <FaShieldAlt className="text-green-500 mr-2 mt-0.5" />
                      {t('fumigation_cleaning_booking.safety_ventilation')}
                    </li>
                    <li className="flex items-start">
                      <FaShieldAlt className="text-green-500 mr-2 mt-0.5" />
                      {t('fumigation_cleaning_booking.safety_pets')}
                    </li>
                  </ul>
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking.need_help')}</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    {t('fumigation_cleaning_booking.contact_support')}
                  </p>
                  <div className="text-sm">
                    <p className="text-gray-700">{t('fumigation_cleaning_booking.phone')}: +234 800 123 4567</p>
                    <p className="text-gray-700">{t('fumigation_cleaning_booking.email')}: cleaning@rentalhub.com</p>
                    <p className="text-gray-700">{t('fumigation_cleaning_booking.hours')}: {t('fumigation_cleaning_booking.mon_sat_hours')}</p>
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

export default FumigationCleaningBooking;


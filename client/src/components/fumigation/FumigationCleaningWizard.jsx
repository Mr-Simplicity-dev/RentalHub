import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
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
  FaShieldAlt,
  FaUserCheck,
  FaFileAlt,
  FaClipboardCheck,
  FaUserFriends,
  FaStar,
  FaThumbsUp
} from 'react-icons/fa';
import Loader from '../common/Loader';
import { useTranslation } from 'react-i18next';

const FumigationCleaningWizard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const propertyId = queryParams.get('propertyId');
  const serviceId = queryParams.get('serviceId');

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [property, setProperty] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  
  // Form state for 9-step process
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Service Selection
    service_id: serviceId || '',
    
    // Step 2: Property Details
    property_size_sqm: '',
    number_of_rooms: '',
    property_condition: 'normal',
    property_type: 'apartment',
    
    // Step 3: Date & Time
    booking_date: '',
    preferred_time_slot: 'morning',
    specific_time: '09:00',
    
    // Step 4: Addons
    selected_addons: [],
    
    // Step 5: Special Instructions
    special_instructions: '',
    access_instructions: '',
    pet_information: '',
    allergy_information: '',
    
    // Step 6: Safety Checklist
    safety_checklist: {
      pets_secured: false,
      children_secured: false,
      ventilation_adequate: false,
      valuables_removed: false,
      access_clear: false
    },
    
    // Step 7: Provider Preferences
    provider_preferences: {
      certified_only: true,
      english_speaking: false,
      female_preferred: false,
      specific_team: ''
    },
    
    // Step 8: Price Calculation
    base_service_price: 0,
    addons_total_price: 0,
    discount_amount: 0,
    total_price: 0,
    
    // Step 9: Final Review
    terms_accepted: false,
    privacy_policy_accepted: false
  });
  
  const [serviceAddons, setServiceAddons] = useState([]);
  const [priceCalculation, setPriceCalculation] = useState(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);

  // Check eligibility and load data
  useEffect(() => {
    const loadData = async () => {
      if (!user || user.user_type !== 'tenant') {
        toast.error(t('only_tenants', 'Only tenants can book fumigation/cleaning services'));
        navigate('/dashboard');
        return;
      }

      setLoading(true);
      try {
        // Check eligibility
        if (propertyId) {
          const eligibilityRes = await api.get(`/fumigation-cleaning/eligibility/${propertyId}`);
          setEligibility(eligibilityRes.data?.data);
          
          if (!eligibilityRes.data?.data?.can_book) {
            toast.error(eligibilityRes.data?.data?.reason || t('cannot_book_property', 'Cannot book fumigation/cleaning for this property'));
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
              property_size_sqm: prop.size_sqm || '',
              property_type: prop.property_type || 'apartment'
            }));
          }
        }
        
        // Load service categories
        const categoriesRes = await api.get('/fumigation-cleaning/categories');
        setCategories(categoriesRes.data?.data || []);
        
        // Load all services
        const servicesRes = await api.get('/fumigation-cleaning/services');
        setServices(servicesRes.data?.data || []);
        
        // If serviceId is provided, pre-select it
        if (serviceId) {
          const service = servicesRes.data?.data?.find(s => s.id === parseInt(serviceId));
          if (service) {
            setSelectedService(service);
            setFormData(prev => ({ ...prev, service_id: service.id }));
          }
        }
        
      } catch (error) {
        console.error('Error loading fumigation/cleaning data:', error);
        toast.error(t('load_failed', 'Failed to load services'));
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, propertyId, serviceId, navigate]);

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
          selectedAddons: formData.selected_addons,
          propertyType: formData.property_type,
          propertyCondition: formData.property_condition
        });
        
        if (response.data?.success) {
          setPriceCalculation(response.data.data);
          setFormData(prev => ({
            ...prev,
            base_service_price: response.data.data.base_price,
            addons_total_price: response.data.data.addons_total,
            discount_amount: response.data.data.discount_amount || 0,
            total_price: response.data.data.total_price
          }));
        }
      } catch (error) {
        console.error('Error calculating price:', error);
        toast.error(t('price_calc_failed', 'Failed to calculate price'));
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
  }, [formData.service_id, formData.property_size_sqm, formData.selected_addons, formData.property_type, formData.property_condition]);

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

  // Load available providers
  useEffect(() => {
    const loadProviders = async () => {
      if (!formData.service_id || !formData.booking_date) return;
      
      try {
                const response = await 
api.get('/fumigation-cleaning/admin/providers');
        
        if (response.data?.success) {
          setProviders(response.data.data || []);
        }
      } catch (error) {
        console.error('Error loading providers:', error);
      }
    };

    if (currentStep >= 7) {
      loadProviders();
    }
  }, [formData.service_id, formData.booking_date, formData.preferred_time_slot, currentStep]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('safety_checklist.')) {
      const checklistField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        safety_checklist: {
          ...prev.safety_checklist,
          [checklistField]: checked
        }
      }));
    } else if (name.startsWith('provider_preferences.')) {
      const prefField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        provider_preferences: {
          ...prev.provider_preferences,
          [prefField]: type === 'checkbox' ? checked : value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
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

  const handleProviderSelect = (provider) => {
    setSelectedProvider(provider);
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
      case 'fumigation': return t('cat_fumigation', 'Fumigation Services');
      case 'cleaning': return t('cat_cleaning', 'Cleaning Services');
      case 'deep_cleaning': return t('cat_deep_cleaning', 'Deep Cleaning');
      default: return t('cat_other', 'Other Services');
    }
  };

  const nextStep = () => {
    if (currentStep < 9) {
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
        // Check if all safety checklist items are true
        return Object.values(formData.safety_checklist).every(item => item === true);
      case 7:
        return true; // Provider preferences are optional
      case 8:
        return !!priceCalculation;
      case 9:
        return formData.terms_accepted && formData.privacy_policy_accepted;
      default:
        return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateStep(9)) {
      toast.error(t('complete_required', 'Please complete all required fields'));
      return;
    }
    
    setCreatingBooking(true);
    try {
      const bookingData = {
        property_id: propertyId,
        ...formData,
        property_size_sqm: parseFloat(formData.property_size_sqm),
        number_of_rooms: parseInt(formData.number_of_rooms),
        selected_provider_id: selectedProvider?.id
      };
      
      const response = await api.post('/fumigation-cleaning/bookings', bookingData);
      
      if (response.data?.success) {
        toast.success(t('booking_created', 'Booking created successfully!'));
        // Navigate to payment page
        navigate(`/fumigation-cleaning/payment/${response.data.data.id}`);
      } else {
        toast.error(response.data?.message || t('booking_failed', 'Failed to create booking'));
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error(error.response?.data?.message || t('booking_failed', 'Failed to create booking'));
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
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('cannot_book_title', 'Cannot Book Service')}</h1>
            <p className="text-gray-600 mb-6">{eligibility?.reason || t('cannot_book_reason', 'You are not eligible to book fumigation/cleaning for this property')}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-primary"
            >
              {t('return_dashboard', 'Return to Dashboard')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step indicators for 9-step process
  const steps = [
    { number: 1, title: t('step_select_service', 'Select Service'), icon: <FaSprayCan /> },
    { number: 2, title: t('step_property_details', 'Property Details'), icon: <FaHome /> },
    { number: 3, title: t('step_date_time', 'Date & Time'), icon: <FaCalendarAlt /> },
    { number: 4, title: t('step_addons', 'Addons'), icon: <FaClipboardList /> },
    { number: 5, title: t('step_instructions', 'Instructions'), icon: <FaFileAlt /> },
    { number: 6, title: t('step_safety_checklist', 'Safety Checklist'), icon: <FaShieldAlt /> },
    { number: 7, title: t('step_provider', 'Provider'), icon: <FaUserFriends /> },
    { number: 8, title: t('step_price_review', 'Price Review'), icon: <FaMoneyBillWave /> },
    { number: 9, title: t('step_confirmation', 'Confirmation'), icon: <FaCheckCircle /> }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('book_service_title', 'Book Fumigation/Cleaning Service')}</h1>
          <p className="text-gray-600">
            {t('booking_subtitle', 'Complete 9-step booking process for {{property}}', {
              property: property?.title || t('your_property', 'your property')
            })}
          </p>
        </div>
        
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between overflow-x-auto pb-4">
            {steps.map((step, index) => (
              <div key={step.number} className="flex flex-col items-center min-w-20">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                  currentStep >= step.number 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {step.icon}
                </div>
                <span className={`text-xs font-medium text-center ${
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
              style={{ width: `${((currentStep - 1) / 8) * 100}%` }}
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
                      {t('select_service_type', 'Select Service Type')}
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
                                      <span className="text-gray-600">{t('duration', 'Duration:')}</span>
                                      <span className="font-semibold ml-1">{t('hours', '{{count}} hours', { count: service.duration_hours })}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">{t('team', 'Team:')}</span>
                                      <span className="font-semibold ml-1">{t('people', '{{count}} people', { count: service.team_size })}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="text-right">
                                    <div className="text-sm text-gray-600">{t('starting_from', 'Starting from')}</div>
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
                      Property Details
                    </h2>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          <FaRulerCombined className="inline mr-1" />
                          {t('property_size', 'Property Size (sqm) *')}
                        </label>
                        <input
                          type="number"
                          name="property_size_sqm"
                          value={formData.property_size_sqm}
                          onChange={handleInputChange}
                          className="input w-full"
                          placeholder={t('prop_size_placeholder', 'e.g., 120')}
                          min="0"
                          step="0.1"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {t('prop_size_hint', 'Enter the total area of your property in square meters')}
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          <FaDoorOpen className="inline mr-1" />
                          {t('number_of_rooms', 'Number of Rooms *')}
                        </label>
                        <input
                          type="number"
                          name="number_of_rooms"
                          value={formData.number_of_rooms}
                          onChange={handleInputChange}
                          className="input w-full"
                          placeholder={t('rooms_placeholder', 'e.g., 3')}
                          min="1"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {t('rooms_hint', 'Total number of rooms including bedrooms, living room, kitchen, etc.')}
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('property_type', 'Property Type *')}
                        </label>
                        <select
                          name="property_type"
                          value={formData.property_type}
                          onChange={handleInputChange}
                          className="input w-full"
                          required
                        >
                          <option value="apartment">{t('type_apartment', 'Apartment')}</option>
                          <option value="house">{t('type_house', 'House')}</option>
                          <option value="duplex">{t('type_duplex', 'Duplex')}</option>
                          <option value="bungalow">{t('type_bungalow', 'Bungalow')}</option>
                          <option value="studio">{t('type_studio', 'Studio')}</option>
                          <option value="commercial">{t('type_commercial', 'Commercial')}</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          <FaExclamationTriangle className="inline mr-1" />
                          {t('property_condition', 'Property Condition')}
                        </label>
                        <select
                          name="property_condition"
                          value={formData.property_condition}
                          onChange={handleInputChange}
                          className="input w-full"
                        >
                          <option value="normal">{t('cond_normal', 'Normal (Regular cleaning needed)')}</option>
                          <option value="dirty">{t('cond_dirty', 'Dirty (Extra cleaning required)')}</option>
                          <option value="very_dirty">{t('cond_very_dirty', 'Very Dirty (Deep cleaning needed)')}</option>
                          <option value="infested">{t('cond_infested', 'Infested (Pest/fumigation required)')}</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          {t('condition_hint', 'This helps us prepare the right equipment and team')}
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
                      {t('select_date_time', 'Select Date & Time')}
                    </h2>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('booking_date', 'Booking Date *')}
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
                            {t('date_fully_booked', '⚠️ This date is fully booked. Please select another date.')}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {t('advance_notice', 'Bookings require at least 24 hours advance notice')}
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          <FaClock className="inline mr-1" />
                          {t('preferred_time_slot', 'Preferred Time Slot *')}
                        </label>
                        <select
                          name="preferred_time_slot"
                          value={formData.preferred_time_slot}
                          onChange={handleInputChange}
                          className="input w-full"
                          required
                        >
                          <option value="morning">{t('slot_morning', 'Morning (8 AM - 12 PM)')}</option>
                          <option value="afternoon">{t('slot_afternoon', 'Afternoon (12 PM - 4 PM)')}</option>
                          <option value="evening">{t('slot_evening', 'Evening (4 PM - 6 PM)')}</option>
                          <option value="specific">{t('slot_specific', 'Specific Time')}</option>
                        </select>
                      </div>
                      
                      {formData.preferred_time_slot === 'specific' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('specific_time', 'Specific Time *')}
                          </label>
                          <select
                            name="specific_time"
                            value={formData.specific_time}
                            onChange={handleInputChange}
                            className="input w-full"
                            required
                          >
                            <option value="08:00">{t('time_0800', '08:00 AM')}</option>
                            <option value="09:00">{t('time_0900', '09:00 AM')}</option>
                            <option value="10:00">{t('time_1000', '10:00 AM')}</option>
                            <option value="11:00">{t('time_1100', '11:00 AM')}</option>
                            <option value="12:00">{t('time_1200', '12:00 PM')}</option>
                            <option value="13:00">{t('time_1300', '01:00 PM')}</option>
                            <option value="14:00">{t('time_1400', '02:00 PM')}</option>
                            <option value="15:00">{t('time_1500', '03:00 PM')}</option>
                            <option value="16:00">{t('time_1600', '04:00 PM')}</option>
                            <option value="17:00">{t('time_1700', '05:00 PM')}</option>
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            {t('service_hours', 'Service hours are between 8 AM and 6 PM')}
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
                      {t('additional_services', 'Additional Services (Optional)')}
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
                                    {t('addon_duration', '+{{count}} hours to service duration', { count: addon.duration_addition_hours })}
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
                        <p className="text-gray-500">{t('no_addons', 'No additional services available for this service')}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Step 5: Special Instructions */}
                {currentStep === 5 && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                      <FaFileAlt className="mr-2" />
                      {t('special_instructions', 'Special Instructions (Optional)')}
                    </h2>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('additional_information', 'Additional Information')}
                        </label>
                        <textarea
                          name="special_instructions"
                          value={formData.special_instructions}
                          onChange={handleInputChange}
                          className="input w-full h-32"
                          placeholder={t('special_instructions_placeholder', 'Any special requirements, specific areas to focus on, or additional notes...')}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('access_instructions', 'Access Instructions')}
                        </label>
                        <textarea
                          name="access_instructions"
                          value={formData.access_instructions}
                          onChange={handleInputChange}
                          className="input w-full h-24"
                          placeholder={t('access_instructions_placeholder', 'How to access the property, gate codes, security information...')}
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('pet_information', 'Pet Information')}
                          </label>
                          <textarea
                            name="pet_information"
                            value={formData.pet_information}
                            onChange={handleInputChange}
                            className="input w-full h-24"
                            placeholder={t('pet_information_placeholder', 'Information about pets in the property...')}
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('allergy_information', 'Allergy Information')}
                          </label>
                          <textarea
                            name="allergy_information"
                            value={formData.allergy_information}
                            onChange={handleInputChange}
                            className="input w-full h-24"
                            placeholder={t('allergy_information_placeholder', 'Any allergies or sensitivities to cleaning products...')}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Step 6: Safety Checklist */}
                {currentStep === 6 && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                      <FaShieldAlt className="mr-2" />
                      {t('safety_checklist', 'Safety Checklist')}
                    </h2>
                    
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                      <h3 className="font-bold text-yellow-800 mb-2">{t('safety_requirements_title', 'Important Safety Requirements')}</h3>
                      <p className="text-yellow-700 text-sm">
                        {t('safety_requirements_intro', 'For the safety of our team and your property, please confirm the following:')}
                      </p>
                    </div>
                    
                    <div className="space-y-4">
                      {Object.entries(formData.safety_checklist).map(([key, value]) => (
                        <div key={key} className="flex items-start">
                          <input
                            type="checkbox"
                            id={`safety_${key}`}
                            name={`safety_checklist.${key}`}
                            checked={value}
                            onChange={handleInputChange}
                            className="mt-1 mr-3"
                          />
                          <label htmlFor={`safety_${key}`} className="text-gray-700">
                            <span className="font-medium">
                              {key === 'pets_secured' && t('check_pets_secured', 'Pets are secured or removed from the property')}
                              {key === 'children_secured' && t('check_children_secured', 'Children are supervised or away from work areas')}
                              {key === 'ventilation_adequate' && t('check_ventilation_adequate', 'Adequate ventilation is available')}
                              {key === 'valuables_removed' && t('check_valuables_removed', 'Valuables and breakables are removed from work areas')}
                              {key === 'access_clear' && t('check_access_clear', 'Clear access to all areas is provided')}
                            </span>
                            <p className="text-sm text-gray-500 mt-1">
                              {key === 'pets_secured' && t('check_pets_secured_hint', 'Ensure pets are in a secure area away from the service team')}
                              {key === 'children_secured' && t('check_children_secured_hint', 'Keep children away from chemicals and equipment')}
                              {key === 'ventilation_adequate' && t('check_ventilation_adequate_hint', 'Open windows or ensure proper ventilation system')}
                              {key === 'valuables_removed' && t('check_valuables_removed_hint', 'Remove valuable items from surfaces to be cleaned')}
                              {key === 'access_clear' && t('check_access_clear_hint', 'Clear pathways and ensure all rooms are accessible')}
                            </p>
                          </label>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-bold text-blue-800 mb-2">{t('safety_reminders', 'Safety Reminders')}</h4>
                      <ul className="text-sm text-blue-700 space-y-1">
                        <li>{t('reminder_ppe', '• Our team will wear appropriate PPE')}</li>
                        <li>{t('reminder_chemicals', '• We use approved, safe chemicals')}</li>
                        <li>{t('reminder_ventilation', '• Proper ventilation is maintained during service')}</li>
                        <li>{t('reminder_briefings', '• Safety briefings are conducted before work begins')}</li>
                        <li>{t('reminder_emergency', '• Emergency procedures are in place')}</li>
                      </ul>
                    </div>
                  </div>
                )}
                
                {/* Step 7: Provider Preferences */}
                {currentStep === 7 && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                      <FaUserFriends className="mr-2" />
                      {t('provider_preferences', 'Provider Preferences')}
                    </h2>
                    
                    <div className="space-y-6">
                      {/* Available Providers */}
                      <div>
                        <h3 className="font-bold text-gray-700 mb-3">{t('available_providers', 'Available Providers')}</h3>
                        {providers.length > 0 ? (
                          <div className="space-y-3">
                            {providers.map((provider) => (
                              <div
                                key={provider.id}
                                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                                  selectedProvider?.id === provider.id
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300'
                                }`}
                                onClick={() => handleProviderSelect(provider)}
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h4 className="font-bold text-gray-900">{provider.company_name}</h4>
                                    <p className="text-sm text-gray-600">{provider.service_specialization}</p>
                                    <div className="flex items-center mt-2">
                                      <div className="flex items-center mr-4">
                                        {[...Array(5)].map((_, i) => (
                                          <FaStar
                                            key={i}
                                            className={i < Math.floor(provider.average_rating || 4) 
                                              ? 'text-yellow-500' 
                                              : 'text-gray-300'
                                            }
                                            size={14}
                                          />
                                        ))}
                                      </div>
                                      <span className="text-sm text-gray-600">
                                        {t('reviews', '({{count}} reviews)', { count: provider.review_count || 0 })}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                                      <div>
                                        <span className="text-gray-600">{t('experience', 'Experience:')}</span>
                                        <span className="font-semibold ml-1">{t('years', '{{count}} years', { count: provider.years_experience })}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600">{t('certified', 'Certified:')}</span>
                                        <span className="font-semibold ml-1">
                                          {provider.is_certified ? t('yes', 'Yes') : t('no', 'No')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {selectedProvider?.id === provider.id && (
                                    <FaCheckCircle className="text-green-500 text-xl" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-gray-500">{t('no_providers', 'No providers available for the selected date/time')}</p>
                            <p className="text-sm text-gray-400 mt-1">
                              {t('no_providers_hint', 'Try selecting a different date or time slot')}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Provider Preferences */}
                      <div>
                        <h3 className="font-bold text-gray-700 mb-3">{t('preferences', 'Preferences')}</h3>
                        <div className="space-y-3">
                          <div className="flex items-start">
                            <input
                              type="checkbox"
                              id="certified_only"
                              name="provider_preferences.certified_only"
                              checked={formData.provider_preferences.certified_only}
                              onChange={handleInputChange}
                              className="mt-1 mr-3"
                            />
                            <label htmlFor="certified_only" className="text-gray-700">
                              <span className="font-medium">{t('pref_certified_only', 'Certified providers only')}</span>
                              <p className="text-sm text-gray-500 mt-1">
                                {t('pref_certified_only_hint', 'Only show providers with valid certifications')}
                              </p>
                            </label>
                          </div>
                          
                          <div className="flex items-start">
                            <input
                              type="checkbox"
                              id="english_speaking"
                              name="provider_preferences.english_speaking"
                              checked={formData.provider_preferences.english_speaking}
                              onChange={handleInputChange}
                              className="mt-1 mr-3"
                            />
                            <label htmlFor="english_speaking" className="text-gray-700">
                              <span className="font-medium">{t('pref_english_speaking', 'English-speaking team preferred')}</span>
                              <p className="text-sm text-gray-500 mt-1">
                                {t('pref_english_speaking_hint', 'Prefer providers with English-speaking staff')}
                              </p>
                            </label>
                          </div>
                          
                          <div className="flex items-start">
                            <input
                              type="checkbox"
                              id="female_preferred"
                              name="provider_preferences.female_preferred"
                              checked={formData.provider_preferences.female_preferred}
                              onChange={handleInputChange}
                              className="mt-1 mr-3"
                            />
                            <label htmlFor="female_preferred" className="text-gray-700">
                              <span className="font-medium">{t('pref_female', 'Female team members preferred')}</span>
                              <p className="text-sm text-gray-500 mt-1">
                                {t('pref_female_hint', 'Prefer providers with female team members')}
                              </p>
                            </label>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {t('specific_team_request', 'Specific Team Request')}
                            </label>
                            <input
                              type="text"
                              name="provider_preferences.specific_team"
                              value={formData.provider_preferences.specific_team}
                              onChange={handleInputChange}
                              className="input w-full"
                              placeholder={t('specific_team_placeholder', 'e.g., Request specific team if previously worked with')}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Step 8: Price Review */}
                {currentStep === 8 && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                      <FaMoneyBillWave className="mr-2" />
                      {t('price_review', 'Price Review')}
                    </h2>
                    
                    {calculatingPrice ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-gray-600 mt-2">{t('calculating_price', 'Calculating final price...')}</p>
                      </div>
                    ) : priceCalculation ? (
                      <div className="space-y-6">
                        {/* Service Summary */}
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h3 className="font-bold text-gray-900 mb-3">{t('service_summary', 'Service Summary')}</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">{t('service', 'Service:')}</span>
                              <span className="font-semibold">{selectedService?.service_name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">{t('property_size_label', 'Property Size:')}</span>
                              <span className="font-semibold">{t('sqm', '{{count}} sqm', { count: formData.property_size_sqm })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">{t('rooms', 'Rooms:')}</span>
                              <span className="font-semibold">{formData.number_of_rooms}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">{t('property_type_label', 'Property Type:')}</span>
                              <span className="font-semibold capitalize">{formData.property_type}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">{t('condition', 'Condition:')}</span>
                              <span className="font-semibold capitalize">{formData.property_condition.replace('_', ' ')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">{t('date', 'Date:')}</span>
                              <span className="font-semibold">
                                {new Date(formData.booking_date).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">{t('time', 'Time:')}</span>
                              <span className="font-semibold">
                                {formData.preferred_time_slot === 'specific' 
                                  ? formData.specific_time 
                                  : formData.preferred_time_slot}
                              </span>
                            </div>
                            {selectedProvider && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">{t('selected_provider', 'Selected Provider:')}</span>
                                <span className="font-semibold">{selectedProvider.company_name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Price Breakdown */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h3 className="font-bold text-blue-800 mb-3">{t('price_breakdown', 'Price Breakdown')}</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">{t('base_service', 'Base Service:')}</span>
                              <span className="font-semibold">₦{priceCalculation.base_price.toLocaleString()}</span>
                            </div>
                            
                            {formData.selected_addons.length > 0 && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">{t('additional_services_label', 'Additional Services:')}</span>
                                  <span className="font-semibold">₦{priceCalculation.addons_total.toLocaleString()}</span>
                                </div>
                                <div className="pl-4 text-sm text-gray-600">
                                  {priceCalculation.addon_details?.map((addon, index) => (
                                    <div key={index} className="flex justify-between">
                                      <span>{t('addon_line', '• {{name}}:', { name: addon.addon_name })}</span>
                                      <span>₦{addon.addon_price.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                            
                            {priceCalculation.discount_amount > 0 && (
                              <div className="flex justify-between text-green-600">
                                <span>{t('discount', 'Discount:')}</span>
                                <span className="font-semibold">-₦{priceCalculation.discount_amount.toLocaleString()}</span>
                              </div>
                            )}
                            
                            <div className="flex justify-between border-t border-blue-200 pt-2 mt-2">
                              <span className="text-lg font-bold text-blue-800">{t('total_amount', 'Total Amount:')}</span>
                              <span className="text-2xl font-bold text-blue-800">
                                ₦{priceCalculation.total_price.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Terms & Conditions */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <h3 className="font-bold text-yellow-800 mb-2 flex items-center">
                            <FaExclamationTriangle className="mr-2" />
                            {t('important_information', 'Important Information')}
                          </h3>
                          <ul className="text-sm text-yellow-700 space-y-1">
                            <li>{t('info_advance_booking', '• Service requires at least 24 hours advance booking')}</li>
                            <li>{t('info_cancellation', '• Cancellation within 12 hours incurs 50% fee')}</li>
                            <li>{t('info_arrival', '• Team will arrive within the selected time window')}</li>
                            <li>{t('info_accessible', '• Please ensure property is accessible')}</li>
                            <li>{t('info_payment', '• Payment must be completed to confirm booking')}</li>
                            <li>{t('info_safety_checklist', '• Safety checklist must be completed before service')}</li>
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-500">{t('complete_steps', 'Please complete all previous steps to see the price')}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Step 9: Final Confirmation */}
                {currentStep === 9 && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                      <FaCheckCircle className="mr-2" />
                      {t('final_confirmation', 'Final Confirmation')}
                    </h2>
                    
                    <div className="space-y-6">
                      {/* Confirmation Summary */}
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h3 className="font-bold text-green-800 mb-3">{t('ready_to_book', 'Ready to Book!')}</h3>
                        <p className="text-green-700">
                          {t('ready_to_book_hint', 'Review your booking details and confirm to proceed to payment.')}
                        </p>
                      </div>
                      
                      {/* Terms Acceptance */}
                      <div className="space-y-4">
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            id="terms_accepted"
                            name="terms_accepted"
                            checked={formData.terms_accepted}
                            onChange={handleInputChange}
                            className="mt-1 mr-3"
                            required
                          />
                          <label htmlFor="terms_accepted" className="text-gray-700">
                            <span className="font-medium">{t('accept_terms', 'Accept Terms of Service')}</span>
                            <p className="text-sm text-gray-500 mt-1">
                              {t('terms_agreement', 'I agree to the Fumigation & Cleaning Service Terms and Conditions')}
                            </p>
                          </label>
                        </div>
                        
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            id="privacy_policy_accepted"
                            name="privacy_policy_accepted"
                            checked={formData.privacy_policy_accepted}
                            onChange={handleInputChange}
                            className="mt-1 mr-3"
                            required
                          />
                          <label htmlFor="privacy_policy_accepted" className="text-gray-700">
                            <span className="font-medium">
                              {t('accept', 'Accept')}{' '}
                              <a
                                href="/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="font-semibold text-primary-700 underline decoration-primary-300 underline-offset-2 hover:text-primary-900"
                              >
                                {t('privacy_policy', 'Privacy Policy')}
                              </a>
                            </span>
                            <p className="text-sm text-gray-500 mt-1">
                              {t('privacy_agreement', 'I agree to the processing of my personal data as described in the Privacy Policy')}
                            </p>
                          </label>
                        </div>
                      </div>
                      
                      {/* Final Notes */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-bold text-blue-800 mb-2">{t('what_happens_next', 'What Happens Next?')}</h4>
                        <ul className="text-sm text-blue-700 space-y-1">
                          <li>{t('next_payment_redirect', "1. You'll be redirected to the secure payment page")}</li>
                          <li>{t('next_complete_payment', '2. Complete payment to confirm your booking')}</li>
                          <li>{t('next_email_confirmation', '3. Receive booking confirmation via email')}</li>
                          <li>{t('next_provider_contact', '4. Provider will contact you 24 hours before service')}</li>
                          <li>{t('next_team_arrival', '5. Service team arrives at scheduled time')}</li>
                        </ul>
                      </div>
                    </div>
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
                      {t('back', 'Back')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="btn btn-gray"
                      disabled={creatingBooking}
                    >
                      {t('cancel', 'Cancel')}
                    </button>
                  )}
                  
                  {currentStep < 9 ? (
                    <button
                      type="button"
                      onClick={nextStep}
                      className="btn btn-primary"
                      disabled={!validateStep(currentStep) || creatingBooking}
                    >
                      {t('continue', 'Continue')}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!validateStep(9) || creatingBooking || !priceCalculation}
                    >
                      {creatingBooking ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          {t('creating_booking', 'Creating Booking...')}
                        </>
                      ) : (
                        t('confirm_proceed', 'Confirm & Proceed to Payment')
                      )}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
          
          {/* Right column - Summary and Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 mb-6 sticky top-6">
              <h3 className="font-bold text-gray-900 mb-4">{t('booking_information', 'Booking Information')}</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('property_details', 'Property Details')}</h4>
                  {property ? (
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="font-medium">{property.title}</p>
                      <p className="text-sm text-gray-600">{property.full_address}</p>
                      <p className="text-sm text-gray-600">
                        {property.bedrooms} bed • {property.bathrooms} bath
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">{t('no_property', 'No property selected')}</p>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('selected_service', 'Selected Service')}</h4>
                  {selectedService ? (
                    <div className="bg-blue-50 p-3 rounded">
                      <p className="font-medium">{selectedService.service_name}</p>
                      <p className="text-sm text-gray-600">{selectedService.service_description}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                        <div>
                          <span className="text-gray-600">{t('duration', 'Duration:')}</span>
                          <span className="font-semibold ml-1">{t('hours', '{{count}} hours', { count: selectedService.duration_hours })}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">{t('team', 'Team:')}</span>
                          <span className="font-semibold ml-1">{t('people', '{{count}} people', { count: selectedService.team_size })}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">{t('no_service', 'No service selected')}</p>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('current_step', 'Current Step')}</h4>
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center mr-2">
                        {currentStep}
                      </div>
                      <div>
                        <p className="font-medium text-green-800">{steps[currentStep - 1]?.title}</p>
                        <p className="text-xs text-green-600">{t('step_of', 'Step {{current}} of {{total}}', { current: currentStep, total: 9 })}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {priceCalculation && (
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">{t('estimated_price', 'Estimated Price')}</h4>
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-800">
                          ₦{priceCalculation.total_price.toLocaleString()}
                        </div>
                        <p className="text-xs text-yellow-600 mt-1">{t('final_price_note', 'Final price after confirmation')}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">{t('safety_information', 'Safety Information')}</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start">
                      <FaShieldAlt className="text-green-500 mr-2 mt-0.5" />
                      {t('safety_trained_teams', 'All our teams are trained in safety protocols')}
                    </li>
                    <li className="flex items-start">
                      <FaShieldAlt className="text-green-500 mr-2 mt-0.5" />
                      {t('safety_approved_chemicals', 'We use approved chemicals and equipment')}
                    </li>
                    <li className="flex items-start">
                                           <FaShieldAlt className="text-green-500 mr-2 mt-0.5" />
                      {t('safety_ventilation', 'Proper ventilation required during service')}
                    </li>
                    <li className="flex items-start">
                      <FaShieldAlt className="text-green-500 mr-2 mt-0.5" />
                      {t('safety_pets_children', 'Keep pets and children away during service')}
                    </li>
                  </ul>
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-700 mb-2">{t('need_help', 'Need Help?')}</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    {t('support_contact', 'Contact our fumigation/cleaning support team:')}
                  </p>
                  <div className="text-sm">
                    <p className="text-gray-700">📞 +234 800 123 4567</p>
                    <p className="text-gray-700">✉️ cleaning@rentalhub.com</p>
                    <p className="text-gray-700">{t('support_hours', '🕒 Mon-Sat: 8 AM - 6 PM')}</p>
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

export default FumigationCleaningWizard;

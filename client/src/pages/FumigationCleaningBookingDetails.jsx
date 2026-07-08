import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  FaSprayCan,
  FaBroom,
  FaCalendarAlt,
  FaClock,
  FaHome,
  FaMoneyBillWave,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaShieldAlt,
  FaUser,
  FaPhone,
  FaEnvelope,
  FaStar,
  FaSpinner,
  FaFileInvoice,
  FaPrint,
  FaArrowLeft,
  FaUndo
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import Loader from '../components/common/Loader';
import BackToDashboard from '../components/common/BackToDashboard';

const FumigationCleaningBookingDetails = () => {
  const { t } = useTranslation();
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [provider, setProvider] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [reviews, setReviews] = useState([]);
  
  // Load booking details
  useEffect(() => {
    const loadBookingDetails = async () => {
      if (!user) {
        toast.error(t('fumigation_cleaning_booking_details.login_required'));
        navigate('/login');
        return;
      }
      
      setLoading(true);
      try {
        const response = await api.get(`/fumigation-cleaning/bookings/${bookingId}`);
        
        if (response.data?.success) {
          const bookingData = response.data.data;
          
          // Check if booking belongs to user (for tenants) or user has admin access
          if (user.user_type === 'tenant' && bookingData.tenant_id !== user.id) {
            toast.error(t('fumigation_cleaning_booking_details.access_denied'));
            navigate('/dashboard');
            return;
          }
          
          setBooking(bookingData);
          
          // Load additional data if available
          if (bookingData.provider_id) {
            try {
              const providerRes = await api.get(`/fumigation-cleaning/providers/${bookingData.provider_id}`);
              if (providerRes.data?.success) {
                setProvider(providerRes.data.data);
              }
            } catch (error) {
              console.error('Error loading provider details:', error);
            }
          }
          
          // Load compliance record
          try {
            const complianceRes = await api.get(`/fumigation-cleaning/compliance/${bookingId}`);
            if (complianceRes.data?.success) {
              setCompliance(complianceRes.data.data);
            }
          } catch (error) {
            console.error('Error loading compliance record:', error);
          }
          
          // Load service reviews
          try {
            const reviewsRes = await api.get(`/fumigation-cleaning/services/${bookingData.service_id}/reviews`);
            if (reviewsRes.data?.success) {
              setReviews(reviewsRes.data.data);
            }
          } catch (error) {
            console.error('Error loading service reviews:', error);
          }
          
        } else {
          toast.error(t('fumigation_cleaning_booking_details.not_found'));
          navigate('/fumigation-cleaning/bookings');
        }
      } catch (error) {
        console.error('Error loading booking details:', error);
        toast.error(t('fumigation_cleaning_booking_details.load_failed'));
        navigate('/fumigation-cleaning/bookings');
      } finally {
        setLoading(false);
      }
    };
    
    loadBookingDetails();
  }, [bookingId, user, navigate]);
  
  const handleCancelBooking = async () => {
    if (!cancellationReason.trim()) {
      toast.error(t('fumigation_cleaning_booking_details.cancel_reason_required'));
      return;
    }
    
    setCancelling(true);
    try {
      const response = await api.delete(`/fumigation-cleaning/bookings/${bookingId}/cancel`, {
        data: { cancellation_reason: cancellationReason }
      });
      
      if (response.data?.success) {
        toast.success(t('fumigation_cleaning_booking_details.cancelled_success'));
        setBooking(prev => ({ ...prev, booking_status: 'cancelled' }));
        setShowCancelModal(false);
        setCancellationReason('');
      } else {
        toast.error(response.data?.message || t('fumigation_cleaning_booking_details.cancel_failed'));
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast.error(error.response?.data?.message || t('fumigation_cleaning_booking_details.cancel_failed'));
    } finally {
      setCancelling(false);
    }
  };
  
  const handleReschedule = () => {
    toast.info(t('fumigation_cleaning_booking_details.reschedule_coming'));
    // In a real implementation, this would navigate to a rescheduling page
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return t('fumigation_cleaning_booking_details.na');
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  const formatTime = (timeString) => {
    if (!timeString) return t('fumigation_cleaning_booking_details.na');
    if (timeString.includes(':')) {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? t('fumigation_cleaning_booking_details.pm') : t('fumigation_cleaning_booking_details.am');
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    }
    return timeString;
  };
  
  const getServiceIcon = (categoryType) => {
    switch (categoryType) {
      case 'fumigation': return <FaSprayCan className="text-red-600" />;
      case 'cleaning': return <FaBroom className="text-blue-600" />;
      case 'deep_cleaning': return <FaShieldAlt className="text-green-600" />;
      default: return <FaHome className="text-gray-600" />;
    }
  };
  
  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: <FaClock /> },
      confirmed: { color: 'bg-green-100 text-green-800', icon: <FaCheckCircle /> },
      in_progress: { color: 'bg-blue-100 text-blue-800', icon: <FaSpinner className="animate-spin" /> },
      completed: { color: 'bg-purple-100 text-purple-800', icon: <FaCheckCircle /> },
      cancelled: { color: 'bg-red-100 text-red-800', icon: <FaTimesCircle /> },
      failed: { color: 'bg-gray-100 text-gray-800', icon: <FaExclamationTriangle /> }
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        {config.icon}
        <span className="ml-1 capitalize">{status.replace('_', ' ')}</span>
      </span>
    );
  };
  
  const getPaymentStatusBadge = (status) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: <FaClock /> },
      completed: { color: 'bg-green-100 text-green-800', icon: <FaCheckCircle /> },
      failed: { color: 'bg-red-100 text-red-800', icon: <FaTimesCircle /> },
      refunded: { color: 'bg-gray-100 text-gray-800', icon: <FaUndo /> }
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        {config.icon}
        <span className="ml-1 capitalize">{status}</span>
      </span>
    );
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
  
  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('fumigation_cleaning_booking_details.not_found_title')}</h1>
            <p className="text-gray-600 mb-6">{t('fumigation_cleaning_booking_details.not_found_message')}</p>
            <button
              onClick={() => navigate('/fumigation-cleaning/bookings')}
              className="btn btn-primary"
            >
              {t('fumigation_cleaning_booking_details.view_my_bookings')}
            </button>
            <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-outline ml-2"
          >
            {t('fumigation_cleaning_booking_details.return_dashboard')}
          </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => navigate('/fumigation-cleaning/bookings')}
              className="btn btn-gray inline-flex items-center justify-center"
            >
              <FaArrowLeft className="mr-2" />
              {t('fumigation_cleaning_booking_details.back_to_bookings')}
            </button>
            <BackToDashboard />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {t('fumigation_cleaning_booking_details.page_title')}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <div className="text-gray-600">
                  {t('fumigation_cleaning_booking_details.booking_id')}: <span className="font-mono font-semibold">FC-{booking.id.toString().padStart(6, '0')}</span>
                </div>
                <div>
                  {getStatusBadge(booking.booking_status)}
                </div>
                <div>
                  {getPaymentStatusBadge(booking.payment_status)}
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex w-full flex-col gap-2 md:mt-0 md:w-auto md:flex-row">
              {booking.booking_status === 'pending' && booking.payment_status === 'completed' && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="btn btn-red w-full md:w-auto"
                >
                  <FaTimesCircle className="mr-2" />
                  {t('fumigation_cleaning_booking_details.cancel_booking')}
                </button>
              )}
              
              {booking.booking_status === 'pending' && booking.payment_status === 'pending' && (
                <button
                  onClick={() => navigate(`/fumigation-cleaning/payment/${bookingId}`)}
                  className="btn btn-primary w-full md:w-auto"
                >
                  <FaMoneyBillWave className="mr-2" />
                  {t('fumigation_cleaning_booking_details.complete_payment')}
                </button>
              )}
              
              <button
                onClick={() => window.print()}
                className="btn btn-outline w-full md:w-auto"
              >
                <FaPrint className="mr-2" />
                {t('fumigation_cleaning_booking_details.print')}
              </button>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Main Details */}
          <div className="lg:col-span-2">
            {/* Service Summary Card */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                {getServiceIcon(booking.category_type)}
                <span className="ml-2">{t('fumigation_cleaning_booking_details.service_summary')}</span>
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">{t('fumigation_cleaning_booking_details.service_info')}</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.service_type')}</p>
                      <p className="font-medium">{booking.service_name}</p>
                      <p className="text-sm text-gray-500">{booking.category_name}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.duration')}</p>
                        <p className="font-medium">{booking.duration_hours} {t('fumigation_cleaning_booking_details.hours')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.team_size')}</p>
                        <p className="font-medium">{booking.team_size} {t('fumigation_cleaning_booking_details.people')}</p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.property_condition')}</p>
                      <p className="font-medium capitalize">{booking.property_condition?.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">{t('fumigation_cleaning_booking_details.schedule_details')}</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.booking_date')}</p>
                      <p className="font-medium">{formatDate(booking.booking_date)}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.time_slot')}</p>
                      <p className="font-medium">
                        {booking.preferred_time_slot === 'specific' 
                          ? formatTime(booking.specific_time)
                          : booking.preferred_time_slot.charAt(0).toUpperCase() + booking.preferred_time_slot.slice(1)}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.created_on')}</p>
                      <p className="font-medium">{formatDate(booking.created_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {booking.special_instructions && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking_details.special_instructions')}</h3>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded">{booking.special_instructions}</p>
                </div>
              )}
            </div>
            
            {/* Property Details Card */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <FaHome className="mr-2" />
                {t('fumigation_cleaning_booking_details.property_details')}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.property_address')}</p>
                  <p className="font-medium">{booking.property_address}</p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.size')}</p>
                    <p className="font-medium">{booking.property_size_sqm} {t('fumigation_cleaning_booking_details.sqm')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.rooms')}</p>
                    <p className="font-medium">{booking.number_of_rooms}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.booking_reference')}</p>
                    <p className="font-medium font-mono">{booking.booking_reference}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.addons')}</p>
                    <p className="font-medium">{booking.addons_count || 0}</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Provider Information Card */}
            {provider && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  <FaUser className="mr-2" />
                  {t('fumigation_cleaning_booking_details.assigned_provider')}
                </h2>
                
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <FaUser className="text-blue-600 text-2xl" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-gray-900">{provider.company_name}</h3>
                    <p className="text-gray-600">{provider.contact_person}</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                      <div className="flex min-w-0 items-center text-sm text-gray-500">
                        <FaPhone className="mr-1" />
                        {provider.phone_number}
                      </div>
                      <div className="flex min-w-0 items-center text-sm text-gray-500">
                        <FaEnvelope className="mr-1 shrink-0" />
                        <span className="break-words">{provider.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.rating')}</div>
                    <div className="flex items-center">
                      {renderStars(provider.average_rating || 4.5)}
                      <span className="ml-2 text-sm text-gray-600">
                        ({provider.total_reviews || 0})
                      </span>
                    </div>
                  </div>
                </div>
                
                {provider.service_areas && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking_details.service_areas')}</h4>
                    <p className="text-gray                      600">{provider.service_areas}</p>
                  </div>
                )}
                
                {provider.certifications && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking_details.certifications')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {provider.certifications.split(',').map((cert, index) => (
                        <span key={index} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                          {cert.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Compliance Record Card */}
            {compliance && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  <FaShieldAlt className="mr-2" />
                  {t('fumigation_cleaning_booking_details.safety_compliance')}
                </h2>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.compliance_status')}</p>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        compliance.compliance_status === 'passed' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {compliance.compliance_status === 'passed' ? t('fumigation_cleaning_booking_details.passed') : t('fumigation_cleaning_booking_details.failed')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.checked_by')}</p>
                      <p className="font-medium">{compliance.checked_by_name}</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.check_date')}</p>
                    <p className="font-medium">{formatDate(compliance.check_date)}</p>
                  </div>
                  
                  {compliance.notes && (
                    <div>
                      <p className="text-sm text-gray-600">{t('fumigation_cleaning_booking_details.notes')}</p>
                      <p className="text-gray-600 bg-gray-50 p-3 rounded">{compliance.notes}</p>
                    </div>
                  )}
                  
                  {compliance.photos_urls && compliance.photos_urls.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">{t('fumigation_cleaning_booking_details.compliance_photos')}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {compliance.photos_urls.map((url, index) => (
                          <div key={index} className="border rounded overflow-hidden">
                                                        <img 
                              src={url} 
                              alt={`Compliance ${index + 1}`}
                              className="w-full h-24 object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Price Breakdown Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <FaMoneyBillWave className="mr-2" />
                {t('fumigation_cleaning_booking_details.price_breakdown')}
              </h2>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{t('fumigation_cleaning_booking_details.base_service')}</span>
                  <span className="font-semibold">₦{booking.base_service_price?.toLocaleString()}</span>
                </div>
                
                {booking.addons_total_price > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">{t('fumigation_cleaning_booking_details.additional_services')}</span>
                    <span className="font-semibold">₦{booking.addons_total_price?.toLocaleString()}</span>
                  </div>
                )}
                
                {booking.addon_details && booking.addon_details.length > 0 && (
                  <div className="pl-4 border-l-2 border-gray-200">
                    {booking.addon_details.map((addon, index) => (
                      <div key={index} className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">• {addon.addon_name}</span>
                        <span className="text-gray-500">₦{addon.addon_price?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">{t('fumigation_cleaning_booking_details.total_amount')}</span>
                    <span className="text-2xl font-bold text-blue-600">
                      ₦{booking.total_price?.toLocaleString()}
                    </span>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('fumigation_cleaning_booking_details.payment_method')}</span>
                    <span className="font-medium capitalize">{booking.payment_method || t('fumigation_cleaning_booking_details.not_specified')}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-600">{t('fumigation_cleaning_booking_details.payment_date')}</span>
                    <span className="font-medium">
                      {booking.payment_date ? formatDate(booking.payment_date) : t('fumigation_cleaning_booking_details.not_paid')}
                    </span>
                  </div>
                  {booking.payment_reference && (
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-600">{t('fumigation_cleaning_booking_details.payment_reference')}</span>
                      <span className="font-medium font-mono">{booking.payment_reference}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Right column - Actions and Info */}
          <div className="lg:col-span-1">
            {/* Quick Actions Card */}
            <div className="bg-white rounded-lg shadow p-6 mb-6 sticky top-6">
              <h3 className="font-bold text-gray-900 mb-4">{t('fumigation_cleaning_booking_details.quick_actions')}</h3>
              
              <div className="space-y-3">
                {booking.booking_status === 'pending' && booking.payment_status === 'pending' && (
                  <button
                    onClick={() => navigate(`/fumigation-cleaning/payment/${bookingId}`)}
                    className="btn btn-primary w-full"
                  >
                    <FaMoneyBillWave className="mr-2" />
                    {t('fumigation_cleaning_booking_details.complete_payment')}
                  </button>
                )}
                
                {booking.booking_status === 'pending' && booking.payment_status === 'completed' && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="btn btn-red w-full"
                  >
                    <FaTimesCircle className="mr-2" />
                    {t('fumigation_cleaning_booking_details.cancel_booking')}
                  </button>
                )}
                
                {['confirmed', 'in_progress'].includes(booking.booking_status) && (
                  <button
                    onClick={handleReschedule}
                    className="btn btn-outline w-full"
                  >
                    <FaCalendarAlt className="mr-2" />
                    {t('fumigation_cleaning_booking_details.reschedule')}
                  </button>
                )}
                
                <button
                  onClick={() => window.print()}
                  className="btn btn-outline w-full"
                >
                  <FaPrint className="mr-2" />
                  {t('fumigation_cleaning_booking_details.print_details')}
                </button>
                
                <button
                  onClick={() => {/* Generate invoice */}}
                  className="btn btn-outline w-full"
                >
                  <FaFileInvoice className="mr-2" />
                  {t('fumigation_cleaning_booking_details.download_invoice')}
                </button>
                
                <button
                  onClick={() => navigate('/fumigation-cleaning/bookings')}
                  className="btn btn-gray w-full"
                >
                  <FaArrowLeft className="mr-2" />
                  {t('fumigation_cleaning_booking_details.all_bookings')}
                </button>
              </div>
              
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-semibold text-gray-700 mb-3">{t('fumigation_cleaning_booking_details.service_timeline')}</h4>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${booking.created_at ? 'bg-green-500' : 'bg-gray-300'} mr-3`}></div>
                    <div>
                      <p className="text-sm font-medium">{t('fumigation_cleaning_booking_details.booking_created')}</p>
                      <p className="text-xs text-gray-500">{formatDate(booking.created_at)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${booking.payment_date ? 'bg-green-500' : 'bg-gray-300'} mr-3`}></div>
                    <div>
                      <p className="text-sm font-medium">{t('fumigation_cleaning_booking_details.payment', { status: booking.payment_status === 'completed' ? t('fumigation_cleaning_booking_details.completed') : t('fumigation_cleaning_booking_details.pending') })}</p>
                      {booking.payment_date && (
                        <p className="text-xs text-gray-500">{formatDate(booking.payment_date)}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${booking.booking_status === 'confirmed' ? 'bg-green-500' : 'bg-gray-300'} mr-3`}></div>
                    <div>
                      <p className="text-sm font-medium">{t('fumigation_cleaning_booking_details.service_confirmed')}</p>
                      {booking.confirmed_at && (
                        <p className="text-xs text-gray-500">{formatDate(booking.confirmed_at)}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${booking.booking_status === 'completed' ? 'bg-green-500' : 'bg-gray-300'} mr-3`}></div>
                    <div>
                      <p className="text-sm font-medium">{t('fumigation_cleaning_booking_details.service_completed')}</p>
                      {booking.completed_at && (
                        <p className="text-xs text-gray-500">{formatDate(booking.completed_at)}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Service Reviews Card */}
            {reviews.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="font-bold text-gray-900 mb-4">{t('fumigation_cleaning_booking_details.service_reviews')}</h3>
                
                <div className="space-y-4">
                  {reviews.slice(0, 3).map((review, index) => (
                    <div key={index} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center mb-2">
                        <div className="flex items-center mr-2">
                          {renderStars(review.rating)}
                        </div>
                        <span className="text-sm text-gray-600">
                          {t('fumigation_cleaning_booking_details.by')} {review.reviewer_name}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{review.comment}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(review.created_at)}
                      </p>
                    </div>
                  ))}
                  
                  {reviews.length > 3 && (
                    <button
                      onClick={() => {/* Show all reviews */}}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {t('fumigation_cleaning_booking_details.view_all_reviews', { count: reviews.length })}
                    </button>
                  )}
                </div>
              </div>
            )}
            
            <div className="bg-white rounded-lg shadow p-6">
              <h4 className="font-bold text-gray-900 mb-3">{t('fumigation_cleaning_booking_details.need_help')}</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t('fumigation_cleaning_booking_details.booking_support')}</p>
                  <p className="text-blue-600 font-medium">+234 800 123 4567</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t('fumigation_cleaning_booking_details.email_support')}</p>
                  <p className="text-blue-600 font-medium">cleaning@rentalhub.com</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t('fumigation_cleaning_booking_details.operating_hours')}</p>
                  <p className="text-gray-700">{t('fumigation_cleaning_booking_details.mon_sat_hours')}</p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h5 className="font-semibold text-gray-700 mb-2">{t('fumigation_cleaning_booking_details.important_notes')}</h5>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>{t('fumigation_cleaning_booking_details.note_ventilation')}</li>
                  <li>{t('fumigation_cleaning_booking_details.note_pets')}</li>
                  <li>{t('fumigation_cleaning_booking_details.note_post_service')}</li>
                  <li>{t('fumigation_cleaning_booking_details.note_report_issues')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Cancel Booking Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">{t('fumigation_cleaning_booking_details.cancel_booking')}</h3>
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-600 mb-4">
                  {t('fumigation_cleaning_booking_details.cancel_confirm')}
                </p>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('fumigation_cleaning_booking_details.cancel_reason')}
                  </label>
                  <textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    className="input w-full h-32"
                    placeholder={t('fumigation_cleaning_booking_details.cancel_reason_placeholder')}
                    required
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="btn btn-gray w-full sm:flex-1"
                  disabled={cancelling}
                >
                  {t('fumigation_cleaning_booking_details.go_back')}
                </button>
                <button
                  onClick={handleCancelBooking}
                  className="btn btn-red w-full sm:flex-1"
                  disabled={cancelling || !cancellationReason.trim()}
                >
                  {cancelling ? (
                    <>
                      <FaSpinner className="animate-spin mr-2" />
                      {t('fumigation_cleaning_booking_details.cancelling')}
                    </>
                  ) : (
                    t('fumigation_cleaning_booking_details.confirm_cancellation')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FumigationCleaningBookingDetails;

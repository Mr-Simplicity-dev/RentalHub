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
import Loader from '../components/common/Loader';

const FumigationCleaningBookingDetails = () => {
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
        toast.error('Please login to view booking details');
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
            toast.error('Access denied');
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
          toast.error('Booking not found');
          navigate('/fumigation-cleaning/bookings');
        }
      } catch (error) {
        console.error('Error loading booking details:', error);
        toast.error('Failed to load booking details');
        navigate('/fumigation-cleaning/bookings');
      } finally {
        setLoading(false);
      }
    };
    
    loadBookingDetails();
  }, [bookingId, user, navigate]);
  
  const handleCancelBooking = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }
    
    setCancelling(true);
    try {
      const response = await api.delete(`/fumigation-cleaning/bookings/${bookingId}/cancel`, {
        data: { cancellation_reason: cancellationReason }
      });
      
      if (response.data?.success) {
        toast.success('Booking cancelled successfully');
        setBooking(prev => ({ ...prev, booking_status: 'cancelled' }));
        setShowCancelModal(false);
        setCancellationReason('');
      } else {
        toast.error(response.data?.message || 'Failed to cancel booking');
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };
  
  const handleReschedule = () => {
    toast.info('Rescheduling feature coming soon');
    // In a real implementation, this would navigate to a rescheduling page
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    if (timeString.includes(':')) {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
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
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Booking Not Found</h1>
            <p className="text-gray-600 mb-6">The fumigation/cleaning booking could not be found.</p>
            <button
              onClick={() => navigate('/fumigation-cleaning/bookings')}
              className="btn btn-primary"
            >
              View My Bookings
            </button>
            <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-outline ml-2"
          >
            Return to Dashboard
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
          <button
            onClick={() => navigate('/fumigation-cleaning/bookings')}
            className="btn btn-gray mb-4"
          >
            <FaArrowLeft className="mr-2" />
            Back to Bookings
          </button>
          
      <button
      onClick={() => navigate('/dashboard')}
      className="btn btn-gray mb-4 ml-2 flex items-center"
    >
      Back to Dashboard
    </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Booking Details
              </h1>
              <div className="flex items-center space-x-4">
                <div className="text-gray-600">
                  Booking ID: <span className="font-mono font-semibold">FC-{booking.id.toString().padStart(6, '0')}</span>
                </div>
                <div>
                  {getStatusBadge(booking.booking_status)}
                </div>
                <div>
                  {getPaymentStatusBadge(booking.payment_status)}
                </div>
              </div>
            </div>
            
            <div className="mt-4 md:mt-0 flex space-x-2">
              {booking.booking_status === 'pending' && booking.payment_status === 'completed' && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="btn btn-red"
                >
                  <FaTimesCircle className="mr-2" />
                  Cancel Booking
                </button>
              )}
              
              {booking.booking_status === 'pending' && booking.payment_status === 'pending' && (
                <button
                  onClick={() => navigate(`/fumigation-cleaning/payment/${bookingId}`)}
                  className="btn btn-primary"
                >
                  <FaMoneyBillWave className="mr-2" />
                  Complete Payment
                </button>
              )}
              
              <button
                onClick={() => window.print()}
                className="btn btn-outline"
              >
                <FaPrint className="mr-2" />
                Print
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
                <span className="ml-2">Service Summary</span>
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Service Information</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">Service Type</p>
                      <p className="font-medium">{booking.service_name}</p>
                      <p className="text-sm text-gray-500">{booking.category_name}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Duration</p>
                        <p className="font-medium">{booking.duration_hours} hours</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Team Size</p>
                        <p className="font-medium">{booking.team_size} people</p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">Property Condition</p>
                      <p className="font-medium capitalize">{booking.property_condition?.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Schedule Details</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">Booking Date</p>
                      <p className="font-medium">{formatDate(booking.booking_date)}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">Time Slot</p>
                      <p className="font-medium">
                        {booking.preferred_time_slot === 'specific' 
                          ? formatTime(booking.specific_time)
                          : booking.preferred_time_slot.charAt(0).toUpperCase() + booking.preferred_time_slot.slice(1)}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">Created On</p>
                      <p className="font-medium">{formatDate(booking.created_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Special Instructions */}
              {booking.special_instructions && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="font-semibold text-gray-700 mb-2">Special Instructions</h3>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded">{booking.special_instructions}</p>
                </div>
              )}
            </div>
            
            {/* Property Details Card */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <FaHome className="mr-2" />
                Property Details
              </h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Property Address</p>
                  <p className="font-medium">{booking.property_address}</p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Size</p>
                    <p className="font-medium">{booking.property_size_sqm} sqm</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Rooms</p>
                    <p className="font-medium">{booking.number_of_rooms}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Booking Reference</p>
                    <p className="font-medium font-mono">{booking.booking_reference}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Addons</p>
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
                  Assigned Provider
                </h2>
                
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <FaUser className="text-blue-600 text-2xl" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900">{provider.company_name}</h3>
                    <p className="text-gray-600">{provider.contact_person}</p>
                    <div className="flex items-center space-x-4 mt-2">
                      <div className="flex items-center text-sm text-gray-500">
                        <FaPhone className="mr-1" />
                        {provider.phone_number}
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        <FaEnvelope className="mr-1" />
                        {provider.email}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Rating</div>
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
                    <h4 className="font-semibold text-gray-700 mb-2">Service Areas</h4>
                    <p className="text-gray                      600">{provider.service_areas}</p>
                  </div>
                )}
                
                {provider.certifications && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="font-semibold text-gray-700 mb-2">Certifications</h4>
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
                  Safety Compliance Record
                </h2>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Compliance Status</p>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        compliance.compliance_status === 'passed' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {compliance.compliance_status === 'passed' ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Checked By</p>
                      <p className="font-medium">{compliance.checked_by_name}</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600">Check Date</p>
                    <p className="font-medium">{formatDate(compliance.check_date)}</p>
                  </div>
                  
                  {compliance.notes && (
                    <div>
                      <p className="text-sm text-gray-600">Notes</p>
                      <p className="text-gray-600 bg-gray-50 p-3 rounded">{compliance.notes}</p>
                    </div>
                  )}
                  
                  {compliance.photos_urls && compliance.photos_urls.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Compliance Photos</p>
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
                Price Breakdown
              </h2>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Base Service</span>
                  <span className="font-semibold">₦{booking.base_service_price?.toLocaleString()}</span>
                </div>
                
                {booking.addons_total_price > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Additional Services</span>
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
                    <span className="text-lg font-bold text-gray-900">Total Amount</span>
                    <span className="text-2xl font-bold text-blue-600">
                      ₦{booking.total_price?.toLocaleString()}
                    </span>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Payment Method</span>
                    <span className="font-medium capitalize">{booking.payment_method || 'Not specified'}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-600">Payment Date</span>
                    <span className="font-medium">
                      {booking.payment_date ? formatDate(booking.payment_date) : 'Not paid'}
                    </span>
                  </div>
                  {booking.payment_reference && (
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-600">Payment Reference</span>
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
              <h3 className="font-bold text-gray-900 mb-4">Quick Actions</h3>
              
              <div className="space-y-3">
                {booking.booking_status === 'pending' && booking.payment_status === 'pending' && (
                  <button
                    onClick={() => navigate(`/fumigation-cleaning/payment/${bookingId}`)}
                    className="btn btn-primary w-full"
                  >
                    <FaMoneyBillWave className="mr-2" />
                    Complete Payment
                  </button>
                )}
                
                {booking.booking_status === 'pending' && booking.payment_status === 'completed' && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="btn btn-red w-full"
                  >
                    <FaTimesCircle className="mr-2" />
                    Cancel Booking
                  </button>
                )}
                
                {['confirmed', 'in_progress'].includes(booking.booking_status) && (
                  <button
                    onClick={handleReschedule}
                    className="btn btn-outline w-full"
                  >
                    <FaCalendarAlt className="mr-2" />
                    Reschedule
                  </button>
                )}
                
                <button
                  onClick={() => window.print()}
                  className="btn btn-outline w-full"
                >
                  <FaPrint className="mr-2" />
                  Print Details
                </button>
                
                <button
                  onClick={() => {/* Generate invoice */}}
                  className="btn btn-outline w-full"
                >
                  <FaFileInvoice className="mr-2" />
                  Download Invoice
                </button>
                
                <button
                  onClick={() => navigate('/fumigation-cleaning/bookings')}
                  className="btn btn-gray w-full"
                >
                  <FaArrowLeft className="mr-2" />
                  All Bookings
                </button>
              </div>
              
              {/* Service Timeline */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-semibold text-gray-700 mb-3">Service Timeline</h4>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${booking.created_at ? 'bg-green-500' : 'bg-gray-300'} mr-3`}></div>
                    <div>
                      <p className="text-sm font-medium">Booking Created</p>
                      <p className="text-xs text-gray-500">{formatDate(booking.created_at)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${booking.payment_date ? 'bg-green-500' : 'bg-gray-300'} mr-3`}></div>
                    <div>
                      <p className="text-sm font-medium">Payment {booking.payment_status === 'completed' ? 'Completed' : 'Pending'}</p>
                      {booking.payment_date && (
                        <p className="text-xs text-gray-500">{formatDate(booking.payment_date)}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${booking.booking_status === 'confirmed' ? 'bg-green-500' : 'bg-gray-300'} mr-3`}></div>
                    <div>
                      <p className="text-sm font-medium">Service Confirmed</p>
                      {booking.confirmed_at && (
                        <p className="text-xs text-gray-500">{formatDate(booking.confirmed_at)}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${booking.booking_status === 'completed' ? 'bg-green-500' : 'bg-gray-300'} mr-3`}></div>
                    <div>
                      <p className="text-sm font-medium">Service Completed</p>
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
                <h3 className="font-bold text-gray-900 mb-4">Service Reviews</h3>
                
                <div className="space-y-4">
                  {reviews.slice(0, 3).map((review, index) => (
                    <div key={index} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center mb-2">
                        <div className="flex items-center mr-2">
                          {renderStars(review.rating)}
                        </div>
                        <span className="text-sm text-gray-600">
                          by {review.reviewer_name}
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
                      View all {reviews.length} reviews →
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Support Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h4 className="font-bold text-gray-900 mb-3">Need Help?</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Booking Support</p>
                  <p className="text-blue-600 font-medium">+234 800 123 4567</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Email Support</p>
                  <p className="text-blue-600 font-medium">cleaning@rentalhub.com</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Operating Hours</p>
                  <p className="text-gray-700">Mon - Sat: 7:00 AM - 6:00 PM</p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h5 className="font-semibold text-gray-700 mb-2">Important Notes</h5>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• Service requires proper ventilation</li>
                  <li>• Keep children and pets away during service</li>
                  <li>• Follow post-service instructions carefully</li>
                  <li>• Report any issues within 24 hours</li>
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
                <h3 className="text-xl font-bold text-gray-900">Cancel Booking</h3>
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-600 mb-4">
                  Are you sure you want to cancel this booking? 
                  Cancellations within 12 hours of service may incur a 50% fee.
                </p>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cancellation Reason *
                  </label>
                  <textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    className="input w-full h-32"
                    placeholder="Please provide a reason for cancellation..."
                    required
                  />
                </div>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="btn btn-gray flex-1"
                  disabled={cancelling}
                >
                  Go Back
                </button>
                <button
                  onClick={handleCancelBooking}
                  className="btn btn-red flex-1"
                  disabled={cancelling || !cancellationReason.trim()}
                >
                  {cancelling ? (
                    <>
                      <FaSpinner className="animate-spin mr-2" />
                      Cancelling...
                    </>
                  ) : (
                    'Confirm Cancellation'
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
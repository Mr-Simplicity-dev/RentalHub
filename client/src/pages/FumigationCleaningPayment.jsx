import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  FaSprayCan,
  FaBroom,
  FaCreditCard,
  FaCheckCircle,
  FaCalendarAlt,
  FaHome,
  FaClipboardList,
  FaMoneyBillWave,
  FaSpinner,
  FaShieldAlt
} from 'react-icons/fa';
import Loader from '../components/common/Loader';

const FumigationCleaningPayment = () => {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentInitialized, setPaymentInitialized] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');
  
  // Load booking details
  useEffect(() => {
    const loadBookingDetails = async () => {
      if (!user || user.user_type !== 'tenant') {
        toast.error('Only tenants can make fumigation/cleaning payments');
        navigate('/dashboard');
        return;
      }
      
      setLoading(true);
      try {
        const response = await api.get(`/fumigation-cleaning/bookings/${bookingId}`);
        
        if (response.data?.success) {
          const bookingData = response.data.data;
          
          // Check if booking belongs to user
          if (bookingData.tenant_id !== user.id) {
            toast.error('Access denied');
            navigate('/dashboard');
            return;
          }
          
          // Check if already paid
          if (bookingData.payment_status === 'completed') {
            toast.info('This booking is already paid');
            navigate(`/fumigation-cleaning/bookings/${bookingId}`);
            return;
          }
          
          setBooking(bookingData);
        } else {
          toast.error('Booking not found');
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Error loading booking details:', error);
        toast.error('Failed to load booking details');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };
    
    loadBookingDetails();
  }, [bookingId, user, navigate]);
  
  const initializePayment = async (paymentMethod = 'paystack') => {
    if (!booking) return;
    
    setProcessingPayment(true);
    try {
      const response = await api.post(`/fumigation-cleaning/bookings/${bookingId}/pay`, {
        payment_method: paymentMethod
      });
      
      if (response.data?.success) {
        setPaymentUrl(response.data.data.payment_url);
        setPaymentInitialized(true);
        
        // Redirect to payment gateway
        window.location.href = response.data.data.payment_url;
      } else {
        toast.error(response.data?.message || 'Failed to initialize payment');
      }
    } catch (error) {
      console.error('Error initializing payment:', error);
      toast.error(error.response?.data?.message || 'Failed to initialize payment');
    } finally {
      setProcessingPayment(false);
    }
  };
  
  const handleManualPayment = () => {
    toast.info('Manual payment option coming soon');
    // In a real implementation, this would show bank transfer details
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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
      case 'fumigation': return 'Fumigation Service';
      case 'cleaning': return 'Cleaning Service';
      case 'deep_cleaning': return 'Deep Cleaning Service';
      default: return 'Service';
    }
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
              onClick={() => navigate('/dashboard')}
              className="btn btn-primary"
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
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Complete Payment</h1>
          <p className="text-gray-600">
            Secure payment for your fumigation/cleaning booking
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Booking Summary */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                {getServiceIcon(booking.category_type)}
                <span className="ml-2">Booking Summary</span>
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center mb-2">
                      {getServiceIcon(booking.category_type)}
                      <h3 className="font-bold text-gray-900 ml-2">{booking.service_name}</h3>
                    </div>
                    <p className="text-sm text-gray-600">{getCategoryName(booking.category_type)}</p>
                    <p className="text-sm text-gray-600 mt-1">Duration: {booking.duration_hours} hours</p>
                    <p className="text-sm text-gray-600">Team Size: {booking.team_size} people</p>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-bold text-gray-900 mb-2 flex items-center">
                      <FaCalendarAlt className="mr-2" />
                      Schedule
                    </h3>
                    <p className="text-gray-700">
                      {formatDate(booking.booking_date)}
                    </p>
                    <p className="text-gray-700">
                      Time: {booking.preferred_time_slot === 'specific' ? booking.specific_time : booking.preferred_time_slot}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-bold text-blue-800 mb-2 flex items-center">
                      <FaHome className="mr-2" />
                      Property Details
                    </h3>
                    <p className="text-blue-700">{booking.property_address}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <p className="text-sm text-blue-600">Size:</p>
                        <p className="font-semibold">{booking.property_size_sqm} sqm</p>
                      </div>
                      <div>
                        <p className="text-sm text-blue-600">Rooms:</p>
                        <p className="font-semibold">{booking.number_of_rooms}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="font-bold text-green-800 mb-2 flex items-center">
                      <FaClipboardList className="mr-2" />
                      Service Details
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-green-700">Condition:</span>
                        <span className="font-semibold capitalize">{booking.property_condition?.replace('_', ' ')}</span>
                      </div>
                      {booking.special_instructions && (
                        <div>
                          <p className="text-sm text-green-700">Instructions:</p>
                          <p className="text-green-700 text-sm">{booking.special_instructions}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Addons Section */}
                {booking.addon_details && booking.addon_details.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-bold text-purple-800 mb-2 flex items-center">
                      <FaClipboardList className="mr-2" />
                      Additional Services
                    </h3>
                    <div className="space-y-2">
                      {booking.addon_details.map((addon, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <div>
                            <span className="font-medium text-purple-700">{addon.addon_name}</span>
                            <p className="text-xs text-purple-600">{addon.addon_description}</p>
                          </div>
                          <span className="font-semibold text-purple-800">
                            ₦{addon.addon_price?.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Payment Options */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <FaCreditCard className="mr-2" />
                Payment Options
              </h2>
              
              <div className="mb-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <h3 className="font-bold text-yellow-800 mb-2">Payment Required</h3>
                  <p className="text-yellow-700">
                    Your fumigation/cleaning booking will be confirmed only after successful payment.
                    The service team will be assigned after payment confirmation.
                  </p>
                </div>
                
                <div className="space-y-4">
                  {/* Paystack Payment */}
                  <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                          <FaCreditCard className="text-blue-600 text-xl" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">Pay with Paystack</h3>
                          <p className="text-sm text-gray-600">Card, Bank Transfer, USSD</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          ₦{booking.total_price?.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => initializePayment('paystack')}
                      disabled={processingPayment || paymentInitialized}
                      className="btn btn-primary w-full py-3"
                    >
                      {processingPayment ? (
                        <>
                          <FaSpinner className="animate-spin mr-2" />
                          Initializing Payment...
                        </>
                      ) : paymentInitialized ? (
                        <>
                          <FaSpinner className="animate-spin mr-2" />
                          Redirecting to Payment...
                        </>
                      ) : (
                        'Pay with Paystack'
                      )}
                    </button>
                    
                    <div className="mt-3 text-xs text-gray-500">
                      <p>• Secure payment powered by Paystack</p>
                      <p>• Supports all Nigerian banks and cards</p>
                      <p>• Instant confirmation</p>
                    </div>
                  </div>
                  
                  {/* Manual Bank Transfer (Optional) */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center mb-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
                        <FaMoneyBillWave className="text-gray-600 text-xl" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">Bank Transfer</h3>
                        <p className="text-sm text-gray-600">Manual bank transfer</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleManualPayment}
                      className="btn btn-outline w-full py-3"
                    >
                      Request Bank Details
                    </button>
                    
                    <div className="mt-3 text-xs text-gray-500">
                      <p>• Transfer to our company account</p>
                      <p>• Send proof of payment to cleaning@rentalhub.com</p>
                      <p>• Booking confirmed within 24 hours</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-bold text-gray-900 mb-3">Payment Terms</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Full payment is required to confirm your booking
                  </li>
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Refunds available for cancellations made 24+ hours in advance
                  </li>
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Payment is securely processed through certified payment gateways
                  </li>
                  <li className="flex items-start">
                    <FaCheckCircle className="text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Receipt will be emailed to {user?.email}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right column - Price Breakdown */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 mb-6 sticky top-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                <FaMoneyBillWave className="mr-2" />
                Price Breakdown
              </h3>
              
              <div className="space-y-3 mb-6">
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
                
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Total Amount</span>
                    <span className="text-2xl font-bold text-blue-600">
                      ₦{booking.total_price?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <h4 className="font-bold text-green-800 mb-2">What's Included</h4>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• Professional service team</li>
                  <li>• Approved chemicals and equipment</li>
                  <li>• Safety gear and protocols</li>
                  <li>• Post-service inspection</li>
                  <li>• 7-day service guarantee</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-bold text-blue-800 mb-2">Booking Status</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Booking ID:</span>
                    <span className="font-mono text-sm">FC-{booking.id.toString().padStart(6, '0')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created:</span>
                    <span className="font-medium">
                      {new Date(booking.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Payment Status:</span>
                    <span className={`font-semibold ${
                      booking.payment_status === 'completed' ? 'text-green-600' :
                      booking.payment_status === 'pending' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {booking.payment_status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Booking Status:</span>
                    <span className={`font-semibold ${
                      booking.booking_status === 'confirmed' ? 'text-green-600' :
                      booking.booking_status === 'pending' ? 'text-yellow-600' :
                      'text-gray-600'
                    }`}>
                      {booking.booking_status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => navigate(`/fumigation-cleaning/bookings/${bookingId}`)}
                  className="btn btn-outline w-full"
                >
                  View Booking Details
                </button>
                
                <button
                  onClick={() => navigate('/fumigation-cleaning/bookings')}
                  className="btn btn-gray w-full"
                >
                  My Bookings
                </button>
                
                <button
                  onClick={() => navigate('/dashboard')}
                  className="btn btn-gray w-full"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
            
            {/* Support Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h4 className="font-bold text-gray-900 mb-3">Need Help?</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Payment Issues</p>
                  <p className="text-blue-600 font-medium">support@rentalhub.com</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Fumigation/Cleaning Support</p>
                  <p className="text-blue-600 font-medium">+234 800 123 4567</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Operating Hours</p>
                  <p className="text-gray-700">Mon - Sat: 7:00 AM - 6:00 PM</p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h5 className="font-semibold text-gray-700 mb-2">Safety Notice</h5>
                <p className="text-xs text-gray-500">
                  Our teams use approved chemicals and follow strict safety protocols. 
                  Please ensure proper ventilation during and after service. 
                  Keep children and pets away from treated areas for recommended periods.
                </p>
                <div className="flex items-center mt-3">
                  <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center mr-2">
                    <FaShieldAlt className="text-green-600" />
                  </div>
                  <span className="text-xs text-gray-600">Certified & Safe Service</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Payment Processing Modal */}
        {paymentInitialized && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaSpinner className="text-blue-600 text-2xl animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Redirecting to Payment</h3>
                <p className="text-gray-600 mb-4">
                  You are being redirected to Paystack to complete your payment securely.
                </p>
                <div className="space-y-3">
                  <a
                    href={paymentUrl}
                    className="btn btn-primary w-full"
                  >
                    Click here if not redirected
                  </a>
                  <button
                    onClick={() => setPaymentInitialized(false)}
                    className="btn btn-gray w-full"
                  >
                    Cancel Payment
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-4">
                  Do not close this window until payment is complete.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FumigationCleaningPayment;
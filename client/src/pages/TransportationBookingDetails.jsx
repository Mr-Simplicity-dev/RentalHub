import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  FaTruck,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaCheckCircle,
  FaUser,
  FaPhone,
  FaRoute,
  FaReceipt,
  FaPrint,
  FaArrowLeft
} from 'react-icons/fa';
import Loader from '../components/common/Loader';
import BackToDashboard from '../components/common/BackToDashboard';

const TransportationBookingDetails = () => {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  
  // Load booking details
  useEffect(() => {
    const loadBookingDetails = async () => {
      if (!user || user.user_type !== 'tenant') {
        toast.error('Only tenants can view booking details');
        navigate('/dashboard');
        return;
      }
      
      setLoading(true);
      try {
        const response = await api.get(`/transportation/bookings/${bookingId}`);
        
        if (response.data?.success) {
          const bookingData = response.data.data;
          
          // Check if booking belongs to user
          if (bookingData.tenant_id !== user.id) {
            toast.error('Access denied');
            navigate('/dashboard');
            return;
          }
          
          setBooking(bookingData);
        } else {
          toast.error('Booking not found');
          navigate('/transportation/bookings');
        }
      } catch (error) {
        console.error('Error loading booking details:', error);
        toast.error('Failed to load booking details');
        navigate('/transportation/bookings');
      } finally {
        setLoading(false);
      }
    };
    
    loadBookingDetails();
  }, [bookingId, user, navigate]);
  
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
  
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };
  
  const getStatusColor = (status) => {
    const colors = {
      pending: 'text-yellow-600 bg-yellow-100',
      confirmed: 'text-blue-600 bg-blue-100',
      in_progress: 'text-purple-600 bg-purple-100',
      completed: 'text-green-600 bg-green-100',
      cancelled: 'text-red-600 bg-red-100'
    };
    return colors[status] || 'text-gray-600 bg-gray-100';
  };
  
  const getPaymentColor = (status) => {
    const colors = {
      pending: 'text-yellow-600 bg-yellow-100',
      completed: 'text-green-600 bg-green-100',
      failed: 'text-red-600 bg-red-100',
      refunded: 'text-gray-600 bg-gray-100'
    };
    return colors[status] || 'text-gray-600 bg-gray-100';
  };
  
  const handlePrintReceipt = () => {
    window.print();
  };
  
  const handleCancelBooking = async () => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    
    try {
      const response = await api.delete(`/transportation/bookings/${bookingId}/cancel`);
      
      if (response.data?.success) {
        toast.success('Booking cancelled successfully');
        // Refresh booking details
        const bookingRes = await api.get(`/transportation/bookings/${bookingId}`);
        if (bookingRes.data?.success) {
          setBooking(bookingRes.data.data);
        }
      } else {
        toast.error(response.data?.message || 'Failed to cancel booking');
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel booking');
    }
  };
  
  const handlePayNow = () => {
    navigate(`/transportation/payment/${bookingId}`);
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
            <p className="text-gray-600 mb-6">The transportation booking could not be found.</p>
            <button
              onClick={() => navigate('/transportation/bookings')}
              className="btn btn-primary"
            >
              View All Bookings
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
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => navigate('/transportation/bookings')}
                  className="btn btn-outline inline-flex items-center justify-center"
                >
                  <FaArrowLeft className="mr-2" />
                  Back to Bookings
                </button>
                <BackToDashboard />
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Booking Details</h1>
              <p className="text-gray-600">
                Booking ID: <span className="font-mono">TR-{booking.id.toString().padStart(6, '0')}</span>
              </p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={handlePrintReceipt}
                className="btn btn-outline flex items-center print:hidden"
              >
                <FaPrint className="mr-2" />
                Print Receipt
              </button>
              
              {booking.payment_status === 'pending' && booking.booking_status !== 'cancelled' && (
                <button
                  onClick={handlePayNow}
                  className="btn btn-primary print:hidden"
                >
                  Pay Now
                </button>
              )}
              
              {booking.booking_status === 'pending' && booking.payment_status === 'pending' && (
                <button
                  onClick={handleCancelBooking}
                  className="btn btn-gray print:hidden"
                >
                  Cancel Booking
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Main details */}
          <div className="lg:col-span-2">
            {/* Service Card */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <FaTruck className="mr-2" />
                Service Details
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-gray-700 mb-2">Service Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <FaTruck className="text-blue-600 mr-3" />
                      <div>
                        <p className="font-medium">{booking.service_name}</p>
                        <p className="text-sm text-gray-600 capitalize">{booking.service_type.replace('_', ' ')}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <FaUser className="text-gray-600 mr-3" />
                      <div>
                        <p className="font-medium">{booking.provider_name}</p>
                        <p className="text-sm text-gray-600">Service Provider</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <FaPhone className="text-gray-600 mr-3" />
                      <div>
                        <p className="font-medium">{booking.provider_phone}</p>
                        <p className="text-sm text-gray-600">Provider Contact</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-bold text-gray-700 mb-2">Property Information</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium">{booking.property_title}</p>
                      <p className="text-sm text-gray-600">{booking.property_address}</p>
                    </div>
                    
                    <div>
                      <p className="font-medium">{booking.tenant_name}</p>
                      <p className="text-sm text-gray-600">Tenant</p>
                    </div>
                    
                    <div className="flex items-center">
                      <FaPhone className="text-gray-600 mr-3" />
                      <div>
                        <p className="font-medium">{booking.tenant_phone}</p>
                        <p className="text-sm text-gray-600">Tenant Contact</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Schedule & Location */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <FaCalendarAlt className="mr-2" />
                Schedule & Location
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-gray-700 mb-3">Schedule Details</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-600">Booking Date</p>
                      <p className="font-medium">{formatDate(booking.booking_date)}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">Booking Time</p>
                      <p className="font-medium">{booking.booking_time}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">Created On</p>
                      <p className="font-medium">{formatDateTime(booking.created_at)}</p>
                    </div>
                    
                    {booking.confirmed_at && (
                      <div>
                        <p className="text-sm text-gray-600">Confirmed On</p>
                        <p className="font-medium">{formatDateTime(booking.confirmed_at)}</p>
                      </div>
                    )}
                    
                    {booking.completed_at && (
                      <div>
                        <p className="text-sm text-gray-600">Completed On</p>
                        <p className="font-medium">{formatDateTime(booking.completed_at)}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-bold text-gray-700 mb-3">Location Details</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-600 flex items-center">
                        <FaMapMarkerAlt className="mr-2 text-blue-600" />
                        Pickup Address
                      </p>
                      <p className="font-medium mt-1">{booking.pickup_address}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600 flex items-center">
                        <FaMapMarkerAlt className="mr-2 text-green-600" />
                        Destination Address
                      </p>
                      <p className="font-medium mt-1">{booking.destination_address}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600 flex items-center">
                        <FaRoute className="mr-2 text-purple-600" />
                        Estimated Distance
                      </p>
                      <p className="font-medium mt-1">{booking.estimated_distance_km} km</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

                        {/* Items & Requirements */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Items & Requirements</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-gray-700 mb-3">Items Description</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    {booking.items_description ? (
                      <p className="text-gray-700">{booking.items_description}</p>
                    ) : (
                      <p className="text-gray-500 italic">No items description provided</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-bold text-gray-700 mb-3">Special Requirements</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    {booking.special_requirements ? (
                      <p className="text-gray-700">{booking.special_requirements}</p>
                    ) : (
                      <p className="text-gray-500 italic">No special requirements</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right column - Status & Actions */}
          <div className="lg:col-span-1">
            {/* Status Cards */}
            <div className="bg-white rounded-lg shadow p-6 mb-6 sticky top-6">
              <h3 className="font-bold text-gray-900 mb-4">Booking Status</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Booking Status</p>
                  <div className={`px-4 py-2 rounded-lg font-medium ${getStatusColor(booking.booking_status)}`}>
                    {booking.booking_status.replace('_', ' ').toUpperCase()}
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-1">Payment Status</p>
                  <div className={`px-4 py-2 rounded-lg font-medium ${getPaymentColor(booking.payment_status)}`}>
                    {booking.payment_status.toUpperCase()}
                  </div>
                </div>
                
                {booking.driver_name && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Assigned Driver</p>
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="font-medium text-blue-800">{booking.driver_name}</p>
                      <p className="text-sm text-blue-600">{booking.driver_phone}</p>
                      {booking.vehicle_number && (
                        <p className="text-xs text-blue-500 mt-1">
                          Vehicle: {booking.vehicle_number}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Timeline */}
              <div className="mt-6">
                <h4 className="font-bold text-gray-700 mb-3">Booking Timeline</h4>
                <div className="space-y-3">
                  <div className="flex items-start">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      <FaCheckCircle className="text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">Booking Created</p>
                      <p className="text-sm text-gray-600">{formatDateTime(booking.created_at)}</p>
                    </div>
                  </div>
                  
                  {booking.confirmed_at && (
                    <div className="flex items-start">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                        <FaCheckCircle className="text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">Booking Confirmed</p>
                        <p className="text-sm text-gray-600">{formatDateTime(booking.confirmed_at)}</p>
                      </div>
                    </div>
                  )}
                  
                  {booking.completed_at && (
                    <div className="flex items-start">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                        <FaCheckCircle className="text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium">Booking Completed</p>
                        <p className="text-sm text-gray-600">{formatDateTime(booking.completed_at)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Price Summary */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                <FaMoneyBillWave className="mr-2" />
                Price Summary
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Base Price</span>
                  <span className="font-semibold">₦{booking.base_price?.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Distance Charge</span>
                  <span className="font-semibold">₦{booking.distance_price?.toLocaleString()}</span>
                </div>
                
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <div className="flex justify-between">
                    <span className="text-lg font-bold text-gray-900">Total Amount</span>
                    <span className="text-2xl font-bold text-blue-600">
                      ₦{booking.total_price?.toLocaleString()}
                    </span>
                  </div>
                </div>
                
                {booking.payment_status === 'completed' && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Payment Date</span>
                      <span className="font-medium">
                        {booking.completed_at ? formatDate(booking.completed_at) : 'N/A'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Receipt Actions */}
              {booking.payment_status === 'completed' && (
                <div className="mt-6">
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center">
                    <FaReceipt className="mr-2" />
                    Receipt
                  </h4>
                  <div className="space-y-2">
                    <button
                      onClick={handlePrintReceipt}
                      className="btn btn-outline w-full flex items-center justify-center"
                    >
                      <FaPrint className="mr-2" />
                      Print Receipt
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                      A receipt has been emailed to {booking.tenant_email}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Support Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h4 className="font-bold text-gray-900 mb-3">Need Assistance?</h4>
              
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Transportation Support</p>
                  <p className="text-blue-600 font-medium">+234 800 123 4567</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-1">Email Support</p>
                  <p className="text-blue-600 font-medium">transport@rentalhub.com</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-1">Emergency Contact</p>
                  <p className="text-red-600 font-medium">+234 700 123 4567</p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h5 className="font-semibold text-gray-700 mb-2">Important Notes</h5>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• Driver will contact you 1 hour before arrival</li>
                  <li>• Have items ready for loading at pickup time</li>
                  <li>• Ensure parking is available at both locations</li>
                  <li>• Keep this booking reference for any inquiries</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        {/* Print Styles */}
        <style>{`
          @media print {
            .print\\:hidden {
              display: none !important;
            }
            .print\\:bg-white {
              background: white !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default TransportationBookingDetails;

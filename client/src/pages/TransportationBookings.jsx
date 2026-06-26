import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  FaTruck,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
  FaSpinner,
  FaFilter,
  FaPlus
} from 'react-icons/fa';
import Loader from '../components/common/Loader';
import BackToDashboard from '../components/common/BackToDashboard';
import BookingCancelModal from '../components/common/BookingCancelModal';

const TransportationBookings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('all'); // all, pending, confirmed, completed, cancelled
  const [stats, setStats] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  
  // Load bookings and stats
  useEffect(() => {
    const loadData = async () => {
      if (!user || user.user_type !== 'tenant') {
        toast.error('Only tenants can view transportation bookings');
        navigate('/dashboard');
        return;
      }
      
      setLoading(true);
      try {
        // Load bookings
        const bookingsRes = await api.get('/transportation/bookings');
        if (bookingsRes.data?.success) {
          setBookings(bookingsRes.data.data);
        }
        
        // Load stats
        const statsRes = await api.get('/transportation/stats');
        if (statsRes.data?.success) {
          setStats(statsRes.data.data);
        }
      } catch (error) {
        console.error('Error loading transportation data:', error);
        toast.error('Failed to load transportation bookings');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user, navigate]);
  
  const filteredBookings = bookings.filter(booking => {
    if (filter === 'all') return true;
    if (filter === 'pending') return booking.booking_status === 'pending';
    if (filter === 'confirmed') return booking.booking_status === 'confirmed';
    if (filter === 'completed') return booking.booking_status === 'completed';
    if (filter === 'cancelled') return booking.booking_status === 'cancelled';
    return true;
  });
  
  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: <FaClock className="mr-1" /> },
      confirmed: { color: 'bg-blue-100 text-blue-800', icon: <FaCheckCircle className="mr-1" /> },
      in_progress: { color: 'bg-purple-100 text-purple-800', icon: <FaSpinner className="mr-1 animate-spin" /> },
      completed: { color: 'bg-green-100 text-green-800', icon: <FaCheckCircle className="mr-1" /> },
      cancelled: { color: 'bg-red-100 text-red-800', icon: <FaTimesCircle className="mr-1" /> }
    };
    
    const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', icon: null };
    
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon}
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };
  
  const getPaymentBadge = (status) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800' },
      completed: { color: 'bg-green-100 text-green-800' },
      failed: { color: 'bg-red-100 text-red-800' },
      refunded: { color: 'bg-gray-100 text-gray-800' }
    };
    
    const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800' };
    
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${config.color}`}>
        {status.toUpperCase()}
      </span>
    );
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  
  const formatTime = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };
  
  const refreshBookings = async () => {
    const bookingsRes = await api.get('/transportation/bookings');
    if (bookingsRes.data?.success) {
      setBookings(bookingsRes.data.data);
    }
  };

  const handleCancelBooking = async (reason) => {
    if (!cancelTarget) return;

    setCancelling(true);
    try {
      const response = await api.delete(`/transportation/bookings/${cancelTarget.id}/cancel`, {
        data: { cancellation_reason: reason }
      });
      
      if (response.data?.success) {
        toast.success('Booking cancelled successfully');
        setCancelTarget(null);
        await refreshBookings();
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
  
  const handlePayNow = (bookingId) => {
    navigate(`/transportation/payment/${bookingId}`);
  };
  
  const handleViewDetails = (bookingId) => {
    navigate(`/transportation/bookings/${bookingId}`);
  };
  
  if (loading) {
    return <Loader />;
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">My Transportation Bookings</h1>
              <p className="text-gray-600">
                Manage your transportation bookings and moving arrangements
              </p>
            </div>
            
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Link
                to="/transportation/book"
                className="btn btn-primary flex w-full items-center justify-center sm:w-auto"
              >
                <FaPlus className="mr-2" />
                New Booking
              </Link>
              
              <BackToDashboard />
            </div>
          </div>
        </div>
        
        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <FaTruck className="text-blue-600 text-xl" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Bookings</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_bookings || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                  <FaCheckCircle className="text-green-600 text-xl" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.completed_bookings || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                  <FaClock className="text-yellow-600 text-xl" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.pending_bookings || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <FaMoneyBillWave className="text-purple-600 text-xl" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Spent</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₦{(stats.total_spent || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center">
              <FaFilter className="text-gray-400 mr-2" />
              <span className="text-gray-700 mr-3">Filter by status:</span>
              <div className="flex flex-wrap gap-2">
                {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      filter === status
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {status === 'all' ? 'All Bookings' : status.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="text-sm text-gray-600">
              Showing {filteredBookings.length} of {bookings.length} bookings
            </div>
          </div>
        </div>
        
        {/* Bookings Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaTruck className="text-gray-400 text-2xl" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Bookings Found</h3>
              <p className="text-gray-600 mb-6">
                {filter === 'all' 
                  ? "You haven't made any transportation bookings yet."
                  : `No ${filter} bookings found.`
                }
              </p>
              {filter === 'all' && (
                <Link
                  to="/transportation/book"
                  className="btn btn-primary"
                >
                  <FaPlus className="mr-2" />
                  Book Transportation Now
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service & Property
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Schedule
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price & Payment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredBookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="flex items-center">
                            <FaTruck className="text-blue-600 mr-2" />
                            <span className="font-medium text-gray-900">
                              {booking.service_name}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {booking.property_title}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 flex items-center">
                            <FaMapMarkerAlt className="mr-1" />
                            {booking.pickup_address.substring(0, 30)}...
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <FaCalendarAlt className="text-gray-400 mr-2" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {formatDate(booking.booking_date)}
                            </div>
                            <div className="text-sm text-gray-600">
                              {formatTime(booking.booking_time)}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <FaMoneyBillWave className="text-green-600 mr-2" />
                          <div>
                            <div className="text-lg font-bold text-gray-900">
                              ₦{booking.total_price?.toLocaleString()}
                            </div>
                            <div className="text-sm text-gray-600">
                              {getPaymentBadge(booking.payment_status)}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        {getStatusBadge(booking.booking_status)}
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewDetails(booking.id)}
                            className="btn btn-sm btn-outline"
                          >
                            Details
                          </button>
                          
                          {booking.payment_status === 'pending' && booking.booking_status !== 'cancelled' && (
                            <button
                              onClick={() => handlePayNow(booking.id)}
                              className="btn btn-sm btn-primary"
                            >
                              Pay Now
                            </button>
                          )}
                          
                          {booking.booking_status === 'pending' && booking.payment_status === 'pending' && (
                            <button
                              onClick={() => setCancelTarget(booking)}
                              className="btn btn-sm btn-gray"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Help Section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <h3 className="font-bold text-blue-800 mb-2">Need to Reschedule?</h3>
            <p className="text-blue-700 text-sm mb-3">
              Contact our transportation team at least 24 hours before your booking to reschedule.
            </p>
            <p className="text-blue-600 font-medium">+234 800 123 4567</p>
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-5">
            <h3 className="font-bold text-green-800 mb-2">Payment Issues?</h3>
            <p className="text-green-700 text-sm mb-3">
              If you're having trouble with payment, contact our support team for assistance.
            </p>
            <p className="text-green-600 font-medium">support@rentalhub.com</p>
          </div>
          
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-5">
            <h3 className="font-bold text-purple-800 mb-2">Booking Policies</h3>
            <p className="text-purple-700 text-sm">
              • Free cancellation up to 24 hours before booking
              <br />
              • 50% refund for cancellations within 12-24 hours
              <br />
              • No refund for cancellations within 12 hours
            </p>
          </div>
        </div>
      </div>
      <BookingCancelModal
        isOpen={!!cancelTarget}
        title="Cancel Transportation Booking"
        message="Please share why you are cancelling this transportation booking."
        warning="Cancellation may affect refunds depending on how close the booking date is."
        loading={cancelling}
        onClose={() => !cancelling && setCancelTarget(null)}
        onConfirm={handleCancelBooking}
      />
    </div>
  );
};

export default TransportationBookings;

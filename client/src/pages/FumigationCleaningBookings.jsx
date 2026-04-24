import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  FaSpinner,
  FaFilter,
  FaPlus,
    FaShieldAlt,
  FaExclamationTriangle,
  FaMapMarkerAlt,
  FaSearch,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaUndo
} from 'react-icons/fa';
import Loader from '../components/common/Loader';

const FumigationCleaningBookings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('all'); // all, pending, confirmed, in_progress, completed, cancelled
  const [stats, setStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Load bookings and stats
  useEffect(() => {
    const loadData = async () => {
      if (!user || user.user_type !== 'tenant') {
        toast.error('Only tenants can view fumigation/cleaning bookings');
        navigate('/dashboard');
        return;
      }
      
      setLoading(true);
      try {
        // Load bookings
        const bookingsRes = await api.get('/fumigation-cleaning/bookings');
        if (bookingsRes.data?.success) {
          setBookings(bookingsRes.data.data);
        }
        
        // Load stats
        const statsRes = await api.get('/fumigation-cleaning/stats');
        if (statsRes.data?.success) {
          setStats(statsRes.data.data);
        }
      } catch (error) {
        console.error('Error loading fumigation/cleaning data:', error);
        toast.error('Failed to load fumigation/cleaning bookings');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user, navigate]);
  
  // Filter and sort bookings
  const filteredAndSortedBookings = bookings
    .filter(booking => {
      // Apply status filter
      if (filter !== 'all' && booking.booking_status !== filter) {
        return false;
      }
      
      // Apply search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          booking.service_name?.toLowerCase().includes(searchLower) ||
          booking.property_address?.toLowerCase().includes(searchLower) ||
          booking.booking_reference?.toLowerCase().includes(searchLower) ||
          booking.category_name?.toLowerCase().includes(searchLower)
        );
      }
      
      return true;
    })
    .sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      // Handle date sorting
      if (sortField.includes('date') || sortField.includes('_at')) {
        aValue = new Date(aValue || 0);
        bValue = new Date(bValue || 0);
      }
      
      // Handle numeric sorting
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      // Handle string sorting
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      // Handle date sorting
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === 'asc' 
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }
      
      return 0;
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
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: null },
      completed: { color: 'bg-green-100 text-green-800', icon: null },
      failed: { color: 'bg-red-100 text-red-800', icon: null },
      refunded: { color: 'bg-gray-100 text-gray-800', icon: <FaUndo className="mr-1" /> }
    };
    
    const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', icon: null };
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${config.color}`}>
        {config.icon}
        {status.toUpperCase()}
      </span>
    );
  };
  
  const getServiceIcon = (categoryType) => {
    switch (categoryType) {
      case 'fumigation': return <FaSprayCan className="text-red-600" />;
      case 'cleaning': return <FaBroom className="text-blue-600" />;
      case 'deep_cleaning': return <FaShieldAlt className="text-green-600" />;
      default: return <FaHome className="text-gray-600" />;
    }
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
    if (timeString.includes(':')) {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    }
    return timeString;
  };
  
  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking? Cancellations within 12 hours of service may incur a 50% fee.')) return;
    
    try {
      const response = await api.delete(`/fumigation-cleaning/bookings/${bookingId}/cancel`);
      
      if (response.data?.success) {
        toast.success('Booking cancelled successfully');
        // Refresh bookings
        const bookingsRes = await api.get('/fumigation-cleaning/bookings');
        if (bookingsRes.data?.success) {
          setBookings(bookingsRes.data.data);
        }
      } else {
        toast.error(response.data?.message || 'Failed to cancel booking');
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel booking');
    }
  };
  
  const handlePayNow = (bookingId) => {
    navigate(`/fumigation-cleaning/payment/${bookingId}`);
  };
  
  const handleViewDetails = (bookingId) => {
    navigate(`/fumigation-cleaning/bookings/${bookingId}`);
  };
  
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  const getSortIcon = (field) => {
    if (sortField !== field) return <FaSort className="text-gray-400" />;
    return sortDirection === 'asc' 
      ? <FaSortUp className="text-blue-600" />
      : <FaSortDown className="text-blue-600" />;
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">My Fumigation/Cleaning Bookings</h1>
              <p className="text-gray-600">
                Manage your professional fumigation and cleaning service bookings
              </p>
            </div>
            
            <div className="flex items-center space-x-3">
              <Link
                to="/fumigation-cleaning/booking"
                className="btn btn-primary flex items-center"
              >
                <FaPlus className="mr-2" />
                New Booking
              </Link>
              
              <Link
                to="/dashboard"
                className="btn btn-outline"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
        
        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <FaSprayCan className="text-blue-600 text-xl" />
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
        
        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search bookings by service, address, or reference..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10 w-full"
                />
              </div>
            </div>
            
            <div className="flex items-center">
              <FaFilter className="text-gray-400 mr-2" />
              <span className="text-gray-700 mr-3">Filter:</span>
              <div className="flex flex-wrap gap-2">
                {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((status) => (
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
          </div>
          
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing {filteredAndSortedBookings.length} of {bookings.length} bookings
            </div>
            
            <div className="text-sm text-gray-600">
              Sorted by: 
              <button 
                onClick={() => handleSort('booking_date')}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                Date {getSortIcon('booking_date')}
              </button>
              <button 
                onClick={() => handleSort('total_price')}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                Price {getSortIcon('total_price')}
              </button>
              <button 
                onClick={() => handleSort('created_at')}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                Created {getSortIcon('created_at')}
              </button>
            </div>
          </div>
        </div>
        
        {/* Bookings Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredAndSortedBookings.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaSprayCan className="text-gray-400 text-2xl" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Bookings Found</h3>
              <p className="text-gray-600 mb-6">
                {filter === 'all' 
                  ? "You haven't made any fumigation/cleaning bookings yet."
                  : `No ${filter} bookings found.`
                }
              </p>
              {filter === 'all' && (
                <Link
                  to="/fumigation-cleaning/booking"
                  className="btn btn-primary"
                >
                  <FaPlus className="mr-2" />
                  Book Service Now
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Schedule
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property
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
                  {filteredAndSortedBookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-start">
                          <div className="text-2xl mr-3">
                            {getServiceIcon(booking.category_type)}
                          </div>
                                                    <div>
                            <div className="font-medium text-gray-900">
                              {booking.service_name}
                            </div>
                            <div className="text-sm text-gray-600">
                              {booking.category_name}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              ID: <span className="font-mono">FC-{booking.id.toString().padStart(6, '0')}</span>
                            </div>
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
                              {booking.preferred_time_slot === 'specific' 
                                ? formatTime(booking.specific_time)
                                : booking.preferred_time_slot.charAt(0).toUpperCase() + booking.preferred_time_slot.slice(1)}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <FaHome className="text-gray-400 mr-2" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {booking.property_size_sqm} sqm
                            </div>
                            <div className="text-sm text-gray-600">
                              {booking.number_of_rooms} rooms
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center">
                              <FaMapMarkerAlt className="mr-1" />
                              {booking.property_address?.substring(0, 25)}...
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
                          
                          {booking.booking_status === 'pending' && booking.payment_status === 'completed' && (
                            <button
                              onClick={() => handleCancelBooking(booking.id)}
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
              Contact our fumigation/cleaning team at least 24 hours before your booking to reschedule.
            </p>
            <p className="text-blue-600 font-medium">+234 800 123 4567</p>
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-5">
            <h3 className="font-bold text-green-800 mb-2">Payment Issues?</h3>
            <p className="text-green-700 text-sm mb-3">
              If you're having trouble with payment, contact our support team for assistance.
            </p>
            <p className="text-green-600 font-medium">cleaning@rentalhub.com</p>
          </div>
          
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-5">
            <h3 className="font-bold text-purple-800 mb-2">Safety Information</h3>
            <p className="text-purple-700 text-sm">
              • Proper ventilation required during service
              <br />
              • Keep children and pets away during service
              <br />
              • Follow post-service instructions carefully
              <br />
              • Report any issues within 24 hours
            </p>
          </div>
        </div>
        
        {/* Booking Tips */}
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="font-bold text-yellow-800 mb-3 flex items-center">
            <FaExclamationTriangle className="mr-2" />
            Important Booking Tips
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-yellow-700 mb-2">Before Service</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Clear access to all areas to be serviced</li>
                <li>• Remove valuable items from service areas</li>
                <li>• Ensure proper ventilation is available</li>
                <li>• Inform about any pets or allergies</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-yellow-700 mb-2">After Service</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Allow recommended ventilation time</li>
                <li>• Follow re-entry guidelines provided</li>
                <li>• Check all serviced areas thoroughly</li>
                <li>• Report any issues immediately</li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* Service Types Info */}
        <div className="mt-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Service Types</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-red-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <FaSprayCan className="text-red-600 text-2xl mr-2" />
                <h4 className="font-bold text-gray-900">Fumigation</h4>
              </div>
              <p className="text-sm text-gray-600">
                Professional pest control services using approved chemicals and equipment.
                Ideal for eliminating insects, rodents, and other pests.
              </p>
            </div>
            
            <div className="bg-white border border-blue-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <FaBroom className="text-blue-600 text-2xl mr-2" />
                <h4 className="font-bold text-gray-900">Cleaning</h4>
              </div>
              <p className="text-sm text-gray-600">
                General cleaning services including dusting, vacuuming, mopping,
                and surface cleaning for regular maintenance.
              </p>
            </div>
            
            <div className="bg-white border border-green-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <FaShieldAlt className="text-green-600 text-2xl mr-2" />
                <h4 className="font-bold text-gray-900">Deep Cleaning</h4>
              </div>
              <p className="text-sm text-gray-600">
                Intensive cleaning services including sanitization, disinfection,
                and thorough cleaning of hard-to-reach areas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FumigationCleaningBookings;

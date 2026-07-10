import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FaSprayCan,
  FaBroom,
  FaCalendarAlt,
  FaUsers,
  FaMoneyBillWave,
  FaChartLine,
  FaFilter,
  FaSearch,
  FaEye,
  FaCheckCircle,
  FaTimesCircle,
  FaHome,
  FaUserCheck,
  FaSortAmountDown,
  FaDownload,
  FaPrint
} from 'react-icons/fa';
import Loader from '../common/Loader';
import DepartmentSupportEscalations from '../admin/DepartmentSupportEscalations';

const FUMIGATION_ADMIN_ROLES = [
  'admin',
  'lga_admin',
  'super_admin',
  'state_admin',
  'state_financial_admin',
  'fumigation_admin',
  'lga_fumigation_admin',
  'state_fumigation_admin',
  'super_fumigation_admin',
];

const FumigationCleaningAdmin = ({
  title = 'Fumigation & Cleaning Admin',
  subtitle = 'Manage fumigation and cleaning service bookings',
  scopeLabel = '',
}) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const highlightedBookingId = new URLSearchParams(location.search).get('bookingId');
  
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showBookingDetails, setShowBookingDetails] = useState(false);
  const [showAssignProvider, setShowAssignProvider] = useState(false);
  const [statusDialog, setStatusDialog] = useState({ open: false, booking: null, status: '' });
  const [statusNote, setStatusNote] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [operations, setOperations] = useState([]);
  const [assignmentDetails, setAssignmentDetails] = useState(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationSaving, setOperationSaving] = useState('');
  const [operationNote, setOperationNote] = useState('');
  const [operationProofUrl, setOperationProofUrl] = useState('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  
  // Load admin data
  useEffect(() => {
    const loadAdminData = async () => {
      if (!user || !FUMIGATION_ADMIN_ROLES.includes(user.user_type)) {
        toast.error('Access denied');
        navigate('/dashboard');
        return;
      }
      
      setLoading(true);
      try {
        // Load bookings
        const bookingsRes = await api.get('/fumigation-cleaning/admin/bookings');
        setBookings(bookingsRes.data?.data || []);
        setFilteredBookings(bookingsRes.data?.data || []);
        
        // Load stats
        const statsRes = await api.get('/fumigation-cleaning/admin/stats');
        setStats(statsRes.data?.data || {});
        
        // Load providers
        const providersRes = await api.get('/fumigation-cleaning/admin/providers');
        setProviders(providersRes.data?.data || []);
        
      } catch (error) {
        console.error('Error loading admin data:', error);
        toast.error('Failed to load admin data');
      } finally {
        setLoading(false);
      }
    };
    
    loadAdminData();
  }, [user, navigate]);
  
  // Filter and sort bookings
  useEffect(() => {
    let result = [...bookings];
    
    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(booking => booking.booking_status === statusFilter);
    }
    
    // Filter by date
    if (dateFilter !== 'all') {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      switch (dateFilter) {
        case 'today':
          result = result.filter(booking => {
            const bookingDate = new Date(booking.booking_date);
            return bookingDate >= startOfToday;
          });
          break;
        case 'this_week':
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          result = result.filter(booking => {
            const bookingDate = new Date(booking.booking_date);
            return bookingDate >= startOfWeek;
          });
          break;
        case 'this_month':
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          result = result.filter(booking => {
            const bookingDate = new Date(booking.booking_date);
            return bookingDate >= startOfMonth;
          });
          break;
        default:
          break;
      }
    }
    
    // Filter by service
    if (serviceFilter !== 'all') {
      result = result.filter(booking => booking.service_type === serviceFilter);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(booking =>
        booking.booking_reference.toLowerCase().includes(query) ||
        booking.tenant_name.toLowerCase().includes(query) ||
        booking.property_address.toLowerCase().includes(query) ||
        booking.service_name.toLowerCase().includes(query)
      );
    }
    
    // Sort bookings
    switch (sortBy) {
      case 'date_desc':
        result.sort((a, b) => new Date(b.booking_date) - new Date(a.booking_date));
        break;
      case 'date_asc':
        result.sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date));
        break;
      case 'price_desc':
        result.sort((a, b) => b.total_price - a.total_price);
        break;
      case 'price_asc':
        result.sort((a, b) => a.total_price - b.total_price);
        break;
      case 'status':
        result.sort((a, b) => a.booking_status.localeCompare(b.booking_status));
        break;
      default:
        break;
    }
    
    setFilteredBookings(result);
  }, [bookings, statusFilter, dateFilter, serviceFilter, searchQuery, sortBy]);
  
  const getStatusColor = (status) => {
    const colors = {
      pending: 'text-yellow-600 bg-yellow-100',
      confirmed: 'text-blue-600 bg-blue-100',
      scheduled: 'text-purple-600 bg-purple-100',
      in_progress: 'text-orange-600 bg-orange-100',
      completed: 'text-green-600 bg-green-100',
      cancelled: 'text-red-600 bg-red-100',
      rescheduled: 'text-indigo-600 bg-indigo-100'
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
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const refreshBookings = async () => {
    const bookingsRes = await api.get('/fumigation-cleaning/admin/bookings');
    const nextBookings = bookingsRes.data?.data || [];
    setBookings(nextBookings);
    return nextBookings;
  };

  const loadBookingOperations = async (bookingId) => {
    setOperationsLoading(true);
    try {
      const response = await api.get(`/fumigation-cleaning/admin/bookings/${bookingId}/operations`);
      setOperations(response.data?.data?.operations || []);
      setAssignmentDetails(response.data?.data?.assignment || null);
    } catch (error) {
      console.error('Error loading booking operations:', error);
      setOperations([]);
      setAssignmentDetails(null);
      toast.error(error.response?.data?.message || 'Failed to load booking operations');
    } finally {
      setOperationsLoading(false);
    }
  };
  
  const handleViewBooking = (booking) => {
    setSelectedBooking(booking);
    setShowBookingDetails(true);
    setOperationNote('');
    setOperationProofUrl('');
    loadBookingOperations(booking.id);
  };
  
  const handleAssignProvider = (booking) => {
    setSelectedBooking(booking);
    setShowAssignProvider(true);
  };
  
  const openStatusDialog = (booking, newStatus) => {
    setStatusDialog({ open: true, booking, status: newStatus });
    setStatusNote('');
  };

  const closeStatusDialog = () => {
    setStatusDialog({ open: false, booking: null, status: '' });
    setStatusNote('');
  };

  const handleUpdateStatus = async () => {
    const booking = statusDialog.booking;
    const newStatus = statusDialog.status;
    if (!booking || !newStatus) return;
    if (['completed', 'cancelled', 'rescheduled'].includes(newStatus) && !statusNote.trim()) {
      toast.error('Add an operational note for this status change');
      return;
    }

    setStatusSaving(true);
    try {
      const response = await api.put(`/fumigation-cleaning/admin/bookings/${booking.id}/status`, {
        status: newStatus,
        update_data: {
          admin_note: statusNote.trim() || undefined,
          updated_by_admin: user?.id,
        },
      });
      
      if (response.data?.success) {
        toast.success('Booking status updated');
        closeStatusDialog();
        await refreshBookings();
      } else {
        toast.error(response.data?.message || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error(error.response?.data?.message || 'Failed to update status');
    } finally {
      setStatusSaving(false);
    }
  };
  
  const handleAssignProviderSubmit = async () => {
    if (!selectedProvider) {
      toast.error('Please select a provider');
      return;
    }
    
    try {
      const response = await api.post(`/fumigation-cleaning/admin/bookings/${selectedBooking.id}/assign-provider`, {
        provider_id: selectedProvider.id
      });
      
      if (response.data?.success) {
        toast.success('Provider assigned successfully');
        setShowAssignProvider(false);
        setSelectedProvider(null);
        
        const nextBookings = await refreshBookings();
        const updatedBooking = nextBookings.find((booking) => booking.id === selectedBooking.id);
        if (updatedBooking) {
          setSelectedBooking(updatedBooking);
        }
        await loadBookingOperations(selectedBooking.id);
      } else {
        toast.error(response.data?.message || 'Failed to assign provider');
      }
    } catch (error) {
      console.error('Error assigning provider:', error);
      toast.error(error.response?.data?.message || 'Failed to assign provider');
    }
  };

  const submitProviderOperation = async (action) => {
    if (!selectedBooking) return;
    if (['declined', 'completed'].includes(action) && !operationNote.trim()) {
      toast.error('Add an operational note for this provider action');
      return;
    }

    setOperationSaving(action);
    try {
      const response = await api.patch(`/fumigation-cleaning/admin/bookings/${selectedBooking.id}/provider-lifecycle`, {
        action,
        note: operationNote.trim(),
        proof_url: operationProofUrl.trim(),
      });

      if (response.data?.success) {
        toast.success('Provider operation updated');
        setOperationNote('');
        setOperationProofUrl('');
        const nextBookings = await refreshBookings();
        const updatedBooking = nextBookings.find((booking) => booking.id === selectedBooking.id);
        if (updatedBooking) {
          setSelectedBooking(updatedBooking);
        }
        await loadBookingOperations(selectedBooking.id);
      } else {
        toast.error(response.data?.message || 'Failed to update provider operation');
      }
    } catch (error) {
      console.error('Error updating provider operation:', error);
      toast.error(error.response?.data?.message || 'Failed to update provider operation');
    } finally {
      setOperationSaving('');
    }
  };
  
  const csvEscape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const htmlEscape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const handleExportData = (format) => {
    const headers = ['Booking ID', 'Tenant', 'Service', 'Property', 'Booking Date', 'Time Slot', 'Status', 'Payment', 'Amount', 'Provider'];
    const rows = filteredBookings.map((booking) => [
      `FC-${booking.id?.toString().padStart(6, '0')}`,
      booking.tenant_name,
      booking.service_name,
      booking.property_address,
      booking.booking_date,
      booking.preferred_time_slot,
      booking.booking_status,
      booking.payment_status,
      booking.total_price,
      booking.assigned_provider?.company_name || booking.assigned_team_leader || '',
    ]);

    if (format === 'CSV') {
      const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fumigation-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }

    const printable = window.open('', '_blank');
    if (!printable) return toast.error('Allow popups to print this report');
    printable.document.write(`
      <html>
        <head><title>Fumigation Bookings Report</title></head>
        <body style="font-family: Arial, sans-serif;">
          <h1>Fumigation &amp; Cleaning Bookings</h1>
          <p>Generated ${htmlEscape(new Date().toLocaleString())}</p>
          <table border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; width: 100%; font-size: 12px;">
            <thead><tr>${headers.map((heading) => `<th>${htmlEscape(heading)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </body>
      </html>
    `);
    printable.document.close();
    printable.print();
  };
  
  if (loading) {
    return <Loader />;
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {title}
          </h1>
          <p className="text-gray-600">
            {subtitle}
          </p>
          {scopeLabel && (
            <div className="mt-3 inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              {scopeLabel}
            </div>
          )}
        </div>
        
        {/* Stats Cards */}
        <div id="fumigation-overview" className="fum-admin-payments-section grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="fum-admin-providers-section bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Bookings</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.total_bookings || 0}</p>
              </div>
              <div className="text-blue-600 text-2xl">
                <FaCalendarAlt />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  ₦{(stats?.total_revenue || 0).toLocaleString()}
                </p>
              </div>
              <div className="text-green-600 text-2xl">
                <FaMoneyBillWave />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Providers</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.active_providers || 0}</p>
              </div>
              <div className="text-purple-600 text-2xl">
                <FaUsers />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completion Rate</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.completion_rate || 0}%</p>
              </div>
              <div className="text-orange-600 text-2xl">
                <FaChartLine />
              </div>
            </div>
          </div>
        </div>

        <div id="support-escalations" className="mb-8">
          <DepartmentSupportEscalations department="fumigation" title="Fumigation Support Escalations" />
        </div>
        
        {/* Filters and Actions */}
        <div id="fumigation-filters" className="fum-admin-services-section bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaFilter className="inline mr-2" />
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input w-full"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            
            {/* Date Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaCalendarAlt className="inline mr-2" />
                Date Range
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="input w-full"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
              </select>
            </div>
            
            {/* Service Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaSprayCan className="inline mr-2" />
                Service Type
              </label>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="input w-full"
              >
                <option value="all">All Services</option>
                <option value="fumigation">Fumigation</option>
                <option value="cleaning">Cleaning</option>
                <option value="deep_cleaning">Deep Cleaning</option>
              </select>
            </div>
            
            {/* Sort */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaSortAmountDown className="inline mr-2" />
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input w-full"
              >
                <option value="date_desc">Date: Newest First</option>
                <option value="date_asc">Date: Oldest First</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="status">Status</option>
              </select>
            </div>
            
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaSearch className="inline mr-2" />
                Search
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bookings..."
                className="input w-full"
              />
            </div>
          </div>
          
          {/* Export Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              Showing {filteredBookings.length} of {bookings.length} bookings
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => handleExportData('CSV')}
                className="btn btn-outline flex w-full items-center justify-center sm:w-auto"
              >
                <FaDownload className="mr-2" />
                Export CSV
              </button>
              <button
                onClick={() => handleExportData('PDF')}
                className="btn btn-outline flex w-full items-center justify-center sm:w-auto"
              >
                <FaPrint className="mr-2" />
                Export PDF
              </button>
            </div>
          </div>
        </div>
        
        {/* Bookings Table */}
        <div id="fumigation-bookings" className="fum-admin-bookings-section bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Booking Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service & Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBookings.length > 0 ? (
                  [...filteredBookings].sort((a, b) => (String(b.id) === highlightedBookingId) - (String(a.id) === highlightedBookingId)).map((booking) => (
                    <tr key={booking.id} className={String(booking.id) === highlightedBookingId ? 'bg-amber-50 ring-1 ring-amber-300' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          FC-{booking.id.toString().padStart(6, '0')}
                        </div>
                        <div className="text-sm text-gray-500">
                          {booking.tenant_name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="text-xl mr-3">
                            {booking.service_type === 'fumigation' ? (
                              <FaSprayCan className="text-red-600" />
                            ) : (
                              <FaBroom className="text-blue-600" />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {booking.service_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {booking.property_address}
                            </div>
                            <div className="text-xs text-gray-400">
                              {booking.property_size_sqm} sqm • {booking.number_of_rooms} rooms
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(booking.booking_date)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {booking.preferred_time_slot}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(booking.booking_status)}`}>
                          {booking.booking_status.replace('_', ' ')}
                        </span>
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentColor(booking.payment_status)}`}>
                            {booking.payment_status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-bold">₦{booking.total_price?.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">
                          {booking.payment_status === 'completed' ? 'Paid' : 'Pending'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewBooking(booking)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <FaEye />
                          </button>
                          <button
                            onClick={() => handleAssignProvider(booking)}
                            className="text-green-600 hover:text-green-900"
                            title="Assign Provider"
                          >
                            <FaUserCheck />
                          </button>
                          <button
                            onClick={() => openStatusDialog(booking, 'confirmed')}
                            className="text-purple-600 hover:text-purple-900"
                            title="Confirm Booking"
                          >
                            <FaCheckCircle />
                          </button>
                          <button
                            onClick={() => openStatusDialog(booking, 'cancelled')}
                            className="text-red-600 hover:text-red-900"
                            title="Cancel Booking"
                          >
                            <FaTimesCircle />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center">
                      <div className="text-gray-400 text-3xl mb-4">
                        <FaSprayCan className="inline-block" />
                        <FaBroom className="inline-block ml-2" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">No Bookings Found</h3>
                      <p className="text-gray-600 mb-4">
                        {bookings.length === 0 ? 'No bookings yet' : 'Try adjusting your filters'}
                      </p>
                      {bookings.length > 0 && (
                        <button
                          onClick={() => {
                            setStatusFilter('all');
                            setDateFilter('all');
                            setServiceFilter('all');
                            setSearchQuery('');
                          }}
                          className="btn btn-primary"
                        >
                          Clear All Filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Booking Details Modal */}
        {statusDialog.open && statusDialog.booking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
              <div className="border-b border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900">Update Booking Status</h2>
                <p className="mt-1 text-sm text-gray-600">
                  FC-{statusDialog.booking.id.toString().padStart(6, '0')} will be marked as {statusDialog.status.replace('_', ' ')}.
                </p>
              </div>
              <div className="space-y-4 p-6">
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">{statusDialog.booking.service_name}</p>
                  <p>{statusDialog.booking.tenant_name || 'Unknown tenant'} • {formatDate(statusDialog.booking.booking_date)}</p>
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  Operational note {['completed', 'cancelled', 'rescheduled'].includes(statusDialog.status) && <span className="text-red-600">*</span>}
                  <textarea
                    value={statusNote}
                    onChange={(event) => setStatusNote(event.target.value)}
                    rows={4}
                    className="input mt-2 w-full"
                    placeholder="Add provider update, cancellation reason, completion proof summary, or customer-impact note"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
                <button type="button" onClick={closeStatusDialog} className="btn btn-outline" disabled={statusSaving}>
                  Cancel
                </button>
                <button type="button" onClick={handleUpdateStatus} className="btn btn-primary" disabled={statusSaving}>
                  {statusSaving ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Booking Details Modal */}
        {showBookingDetails && selectedBooking && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Booking Details</h2>
                    <p className="text-gray-600">FC-{selectedBooking.id.toString().padStart(6, '0')}</p>
                  </div>
                  <button
                    onClick={() => setShowBookingDetails(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <FaTimesCircle className="text-2xl" />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Left Column */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3">Service Information</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center mb-3">
                          <div className="text-2xl mr-3">
                            {selectedBooking.service_type === 'fumigation' ? (
                              <FaSprayCan className="text-red-600" />
                            ) : (
                              <FaBroom className="text-blue-600" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900">{selectedBooking.service_name}</h4>
                            <p className="text-sm text-gray-600 capitalize">
                              {selectedBooking.service_type.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-600">Duration:</span>
                            <span className="font-semibold ml-1">{selectedBooking.duration_hours} hours</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Team Size:</span>
                            <span className="font-semibold ml-1">{selectedBooking.team_size} people</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3">Property Details</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-start mb-3">
                          <FaHome className="text-gray-400 mr-2 mt-0.5" />
                          <div>
                            <h4 className="font-bold text-gray-900">{selectedBooking.property_address}</h4>
                            <p className="text-sm text-gray-600">{selectedBooking.property_type}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-600">Size:</span>
                            <span className="font-semibold ml-1">{selectedBooking.property_size_sqm} sqm</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Rooms:</span>
                            <span className="font-semibold ml-1">{selectedBooking.number_of_rooms}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Condition:</span>
                            <span className="font-semibold ml-1 capitalize">
                              {selectedBooking.property_condition?.replace('_', ' ') || 'Normal'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3">Tenant Information</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-bold text-gray-900 mb-2">{selectedBooking.tenant_name}</h4>
                        <div className="space-y-1 text-sm">
                          <p className="text-gray-600">Email: {selectedBooking.tenant_email}</p>
                          <p className="text-gray-600">Phone: {selectedBooking.tenant_phone || 'Not provided'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right Column */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3">Schedule</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center mb-3">
                          <FaCalendarAlt className="text-gray-400 mr-2" />
                          <div>
                            <h4 className="font-bold text-gray-900">
                              {formatDate(selectedBooking.booking_date)}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {selectedBooking.preferred_time_slot === 'specific' 
                                ? selectedBooking.specific_time 
                                : selectedBooking.preferred_time_slot}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">
                          <p>Created: {formatDateTime(selectedBooking.created_at)}</p>
                          {selectedBooking.updated_at && (
                            <p>Last Updated: {formatDateTime(selectedBooking.updated_at)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3">Status & Payment</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-sm text-gray-600">Booking Status</p>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${getStatusColor(selectedBooking.booking_status)}`}>
                              {selectedBooking.booking_status.replace('_', ' ')}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Payment Status</p>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${getPaymentColor(selectedBooking.payment_status)}`}>
                              {selectedBooking.payment_status}
                            </span>
                          </div>
                        </div>
                        
                        <div className="border-t border-gray-200 pt-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-600">Total Amount:</span>
                            <span className="text-xl font-bold text-gray-900">
                              ₦{selectedBooking.total_price?.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {selectedBooking.payment_status === 'completed' 
                              ? `Paid on ${formatDate(selectedBooking.payment_date)}` 
                              : 'Payment pending'}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3">Special Instructions</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        {selectedBooking.special_instructions ? (
                          <p className="text-gray-700">{selectedBooking.special_instructions}</p>
                        ) : (
                          <p className="text-gray-500 italic">No special instructions provided</p>
                        )}
                      </div>
                    </div>
                    
                    {selectedBooking.assigned_provider && (
                      <div>
                        <h3 className="font-bold text-gray-900 mb-3">Assigned Provider</h3>
                        <div className="fum-admin-providers-section bg-green-50 p-4 rounded-lg">
                          <h4 className="font-bold text-green-800 mb-1">
                            {selectedBooking.assigned_provider.company_name || selectedBooking.assigned_provider}
                          </h4>
                          <p className="text-sm text-green-700">
                            {selectedBooking.assigned_provider.service_specialization || 'Assigned service provider'}
                          </p>
                          <div className="mt-2 text-sm text-green-600">
                            <p>Contact: {selectedBooking.assigned_provider.contact_phone || 'Not provided'}</p>
                            <p>Email: {selectedBooking.assigned_provider.contact_email || 'Not provided'}</p>
                            <p>Status: {(assignmentDetails?.assignment_status || selectedBooking.assigned_provider.assignment_status || 'assigned').replace('_', ' ')}</p>
                            {(assignmentDetails?.arrival_proof_url || selectedBooking.assigned_provider.arrival_proof_url) && (
                              <p>
                                Arrival Proof:{' '}
                                <a
                                  href={assignmentDetails?.arrival_proof_url || selectedBooking.assigned_provider.arrival_proof_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-green-800 underline"
                                >
                                  Open
                                </a>
                              </p>
                            )}
                            {(assignmentDetails?.completion_proof_url || selectedBooking.assigned_provider.completion_proof_url) && (
                              <p>
                                Completion Proof:{' '}
                                <a
                                  href={assignmentDetails?.completion_proof_url || selectedBooking.assigned_provider.completion_proof_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-green-800 underline"
                                >
                                  Open
                                </a>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-6 border-t border-gray-200 pt-6">
                  <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div>
                      <h3 className="font-bold text-gray-900">Provider Operations</h3>
                      <p className="text-sm text-gray-600">Track assignment response, arrival proof, completion proof, and admin notes.</p>
                    </div>
                    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(selectedBooking.booking_status)}`}>
                      {selectedBooking.booking_status.replace('_', ' ')}
                    </span>
                  </div>

                  {selectedBooking.assigned_provider ? (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
                      <div className="rounded-lg border border-gray-200 p-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                            Operation note
                            <textarea
                              value={operationNote}
                              onChange={(event) => setOperationNote(event.target.value)}
                              rows={3}
                              className="input mt-2 w-full"
                              placeholder="Provider accepted, arrived with tenant confirmation, treatment completed, decline reason..."
                            />
                          </label>
                          <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                            Proof URL
                            <input
                              type="url"
                              value={operationProofUrl}
                              onChange={(event) => setOperationProofUrl(event.target.value)}
                              className="input mt-2 w-full"
                              placeholder="https://..."
                            />
                          </label>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <button
                            type="button"
                            onClick={() => submitProviderOperation('accepted')}
                            disabled={Boolean(operationSaving)}
                            className="btn btn-outline text-sm"
                          >
                            {operationSaving === 'accepted' ? 'Saving...' : 'Accepted'}
                          </button>
                          <button
                            type="button"
                            onClick={() => submitProviderOperation('declined')}
                            disabled={Boolean(operationSaving)}
                            className="btn btn-outline text-sm text-red-700"
                          >
                            {operationSaving === 'declined' ? 'Saving...' : 'Declined'}
                          </button>
                          <button
                            type="button"
                            onClick={() => submitProviderOperation('in_progress')}
                            disabled={Boolean(operationSaving)}
                            className="btn btn-outline text-sm text-orange-700"
                          >
                            {operationSaving === 'in_progress' ? 'Saving...' : 'Arrived'}
                          </button>
                          <button
                            type="button"
                            onClick={() => submitProviderOperation('completed')}
                            disabled={Boolean(operationSaving)}
                            className="btn btn-primary text-sm"
                          >
                            {operationSaving === 'completed' ? 'Saving...' : 'Completed'}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-gray-200 p-4">
                        <h4 className="mb-3 font-bold text-gray-900">Operations Timeline</h4>
                        {operationsLoading ? (
                          <p className="text-sm text-gray-500">Loading operations...</p>
                        ) : operations.length > 0 ? (
                          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                            {operations.map((operation) => (
                              <div key={operation.id} className="border-l-2 border-blue-200 pl-3">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm font-semibold capitalize text-gray-900">
                                    {operation.event_type.replaceAll('_', ' ')}
                                  </p>
                                  <p className="shrink-0 text-xs text-gray-500">{formatDateTime(operation.created_at)}</p>
                                </div>
                                <p className="text-xs text-gray-500">
                                  {operation.actor_name || 'System'}{operation.provider_name ? ` - ${operation.provider_name}` : ''}
                                </p>
                                {operation.note && <p className="mt-1 text-sm text-gray-700">{operation.note}</p>}
                                {operation.proof_url && (
                                  <a
                                    href={operation.proof_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-block text-sm font-semibold text-blue-700 underline"
                                  >
                                    Open proof
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No operation events yet.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600">
                      Assign a provider before recording acceptance, arrival, or completion proof.
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col justify-end gap-3 border-t border-gray-200 pt-6 sm:flex-row">
                  <button
                    onClick={() => setShowBookingDetails(false)}
                    className="btn btn-gray w-full sm:w-auto"
                  >
                    Close
                  </button>
                  {!selectedBooking.assigned_provider && (
                    <button
                      onClick={() => {
                        setShowBookingDetails(false);
                        handleAssignProvider(selectedBooking);
                      }}
                      className="btn btn-primary w-full sm:w-auto"
                    >
                      Assign Provider
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Assign Provider Modal */}
        {showAssignProvider && selectedBooking && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Assign Provider</h2>
                    <p className="text-gray-600">
                      FC-{selectedBooking.id.toString().padStart(6, '0')} • {selectedBooking.service_name}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAssignProvider(false);
                      setSelectedProvider(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <FaTimesCircle className="text-2xl" />
                  </button>
                </div>
                
                <div className="mb-6">
                  <h3 className="font-bold text-gray-900 mb-3">Available Providers</h3>
                  {providers.length > 0 ? (
                    <div className="fum-admin-providers-section space-y-3 max-h-96 overflow-y-auto">
                      {providers.map((provider) => (
                        <div
                          key={provider.id}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            selectedProvider?.id === provider.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300'
                          }`}
                          onClick={() => setSelectedProvider(provider)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-bold text-gray-900">{provider.company_name}</h4>
                              <p className="text-sm text-gray-600">{provider.service_specialization}</p>
                              <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                                <div>
                                  <span className="text-gray-600">Experience:</span>
                                  <span className="font-semibold ml-1">{provider.years_experience} years</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Certified:</span>
                                  <span className="font-semibold ml-1">
                                    {provider.is_certified ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Rating:</span>
                                  <span className="font-semibold ml-1">{provider.average_rating || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Jobs Completed:</span>
                                  <span className="font-semibold ml-1">{provider.completed_jobs || 0}</span>
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
                      <p className="text-gray-500">No providers available for this service type</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Try assigning a provider manually or contact support
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col justify-end gap-3 border-t border-gray-200 pt-6 sm:flex-row">
                  <button
                    onClick={() => {
                      setShowAssignProvider(false);
                      setSelectedProvider(null);
                    }}
                    className="btn btn-gray w-full sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssignProviderSubmit}
                    disabled={!selectedProvider}
                    className="btn btn-primary w-full sm:w-auto"
                  >
                    Assign Provider
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FumigationCleaningAdmin;

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import BackToDashboard from '../components/common/BackToDashboard';
import {
  FaTruck,
  FaSprayCan,
  FaMapMarkerAlt,
  FaClock,
  FaCalendarAlt,
  FaArrowRight,
  FaSyncAlt,
  FaShieldAlt,
  FaPhoneAlt,
  FaHourglassHalf,
  FaCheckCircle,
  FaCompass
} from 'react-icons/fa';

const ServiceTrackingCentre = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'transportation', 'fumigation', 'active'
  const [refreshing, setRefreshing] = useState(false);

  const fetchServices = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.get('/service-tracking/my-services');
      if (res.data?.success && res.data?.data) {
        setServices(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load services in tracking centre:', err);
    } finally {
      if (!isSilent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchServices(false);
    const interval = setInterval(() => {
      fetchServices(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  const filteredServices = services.filter((s) => {
    if (filter === 'transportation') return s.service_type === 'transportation';
    if (filter === 'fumigation') return s.service_type === 'fumigation';
    if (filter === 'active') return s.is_active;
    return true;
  });

  const activeCount = services.filter((s) => s.is_active).length;
  const transpCount = services.filter((s) => s.service_type === 'transportation').length;
  const fumigCount = services.filter((s) => s.service_type === 'fumigation').length;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">
              <FaCompass className="text-emerald-600" />
              Unified Service Radar &amp; Telemetry
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Service Tracking Centre
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Real-time GPS fleet telemetry, live ETAs, and safety monitoring across your transportation haulage and fumigation services.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <BackToDashboard />
            <button
              onClick={() => fetchServices(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium shadow-sm transition-colors"
            >
              <FaSyncAlt className={refreshing ? 'animate-spin text-emerald-600' : ''} />
              Sync Radar
            </button>
          </div>
        </div>

        {/* Overview Metric Stats (Anti-slop clean cards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">All Booked Services</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{services.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-emerald-600 font-medium">Active En Route / In Progress</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-blue-600 font-medium">Transportation Trips</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{transpCount}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-teal-600 font-medium">Fumigation Treatments</p>
            <p className="text-2xl font-bold text-teal-900 mt-1">{fumigCount}</p>
          </div>
        </div>

        {/* Filter Navigation Bar */}
        <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            All Services ({services.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === 'active'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            Active Telemetry ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('transportation')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              filter === 'transportation'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            <FaTruck size={12} />
            Transportation ({transpCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('fumigation')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              filter === 'fumigation'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            <FaSprayCan size={12} />
            Fumigation ({fumigCount})
          </button>
        </div>

        {/* Service Listings */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
            <FaCompass className="mx-auto text-emerald-600 animate-spin text-3xl mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">Acquiring Service Radar Coordinates</h3>
            <p className="text-xs text-slate-500 mt-1">Connecting to live vehicle and specialist telemetry...</p>
          </div>
        ) : filteredServices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredServices.map((service) => {
              const isFumig = service.service_type === 'fumigation';

              return (
                <div
                  key={`${service.service_type}-${service.id}`}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    {/* Top Type & Status */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span
                          className={`p-1.5 rounded-lg text-white ${
                            isFumig ? 'bg-teal-600' : 'bg-blue-600'
                          }`}
                        >
                          {isFumig ? <FaSprayCan size={13} /> : <FaTruck size={13} />}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{service.service_badge}</span>
                          <span className="text-[11px] font-mono text-slate-500">{service.reference}</span>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div>
                        {service.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live Radar Active
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {service.booking_status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Service Name & Property */}
                    <div className="mt-4 space-y-2">
                      <h3 className="font-bold text-slate-900 text-base">{service.service_name}</h3>
                      <div className="flex items-start gap-2 text-xs text-slate-600">
                        <FaMapMarkerAlt className="text-slate-400 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{service.property_address || service.property_title}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <FaCalendarAlt size={11} /> {service.booking_date}
                        </span>
                        <span className="flex items-center gap-1">
                          <FaClock size={11} /> {service.booking_time}
                        </span>
                      </div>
                    </div>

                    {/* Live ETA or Telemetry Pill */}
                    {service.is_active && (service.eta_minutes || service.distance_remaining_km) && (
                      <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Live Telemetry:</span>
                        <span className="font-bold text-slate-800">
                          {service.eta_minutes ? `ETA ~${service.eta_minutes} mins` : 'In Transit'}
                          {service.distance_remaining_km ? ` · ${service.distance_remaining_km} km away` : ''}
                        </span>
                      </div>
                    )}

                    {/* Special Fumigation Safety Notice */}
                    {isFumig && service.reentry_permitted_at && (
                      <div className="mt-3 p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                        <FaHourglassHalf className="text-amber-600 shrink-0" />
                        <span>
                          Ventilation Protocol: Safe Re-entry at{' '}
                          <strong>{new Date(service.reentry_permitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                        </span>
                      </div>
                    )}

                    {/* Assigned Personnel */}
                    {service.assigned_contact?.name && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                        <span>
                          {service.assigned_contact.role_label}: <strong>{service.assigned_contact.name}</strong>
                        </span>
                        {service.assigned_contact.phone && (
                          <a
                            href={`tel:${service.assigned_contact.phone}`}
                            className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                          >
                            <FaPhoneAlt size={10} /> Call
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Primary CTA */}
                  <div className="mt-5 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => navigate(service.tracking_url)}
                      className="w-full py-2.5 px-4 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      <span>Open Live Radar &amp; Telemetry Details</span>
                      <FaArrowRight size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm space-y-4">
            <FaCompass className="mx-auto text-slate-400 text-4xl" />
            <div>
              <h3 className="text-base font-bold text-slate-900">No Service Records Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                You haven&apos;t booked any transportation or fumigation services yet. Book verified logistics and certified pest extermination with live GPS tracking.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/transportation/book')}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                <FaTruck /> Book Transportation
              </button>
              <button
                type="button"
                onClick={() => navigate('/fumigation-cleaning/booking')}
                className="btn btn-outline text-xs flex items-center gap-1.5"
              >
                <FaSprayCan /> Book Fumigation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceTrackingCentre;

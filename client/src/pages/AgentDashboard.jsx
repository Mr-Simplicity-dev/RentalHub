import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { propertyService } from '../services/propertyService';
import { DamageReportButton } from '../components/damage';
import Loader from '../components/common/Loader';
import { toast } from 'react-toastify';
import { formatCurrency } from '../utils/helpers';

const AgentDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [landlords, setLandlords] = useState([]);
  const [properties, setProperties] = useState([]);
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [earnings, setEarnings] = useState({
    total_earned: 0,
    pending_balance: 0,
    withdrawn_total: 0,
    available_for_withdrawal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [processingWithdrawal, setProcessingWithdrawal] = useState(false);

  useEffect(() => {
    loadAgentData();
  }, []);

  const loadAgentData = async () => {
    setLoading(true);
    try {
      // In a real implementation, these would be separate API calls
      // For now, we'll simulate the data structure
      
      // Load assigned landlords
      const landlordsRes = await propertyService.getMyProperties();
      if (landlordsRes.success) {
        // Extract unique landlords from properties with last_agent_assignment info
        const uniqueLandlords = {};
        landlordsRes.data.forEach((prop) => {
          if (prop.landlord_id && !uniqueLandlords[prop.landlord_id]) {
            uniqueLandlords[prop.landlord_id] = {
              id: prop.landlord_id,
              name: prop.landlord_name || 'Unknown Landlord',
              email: prop.landlord_email,
              phone: prop.landlord_phone,
              properties_managed: 0,
              assigned_date: prop.last_agent_assignment || new Date().toISOString(),
            };
          }
          if (prop.landlord_id) uniqueLandlords[prop.landlord_id].properties_managed++;
        });
        setLandlords(Object.values(uniqueLandlords));

        // Load managed properties
        setProperties(landlordsRes.data);
      }

      // Load commission history (simulated - in real implementation needs backend API)
      setCommissionHistory([
        {
          id: 1,
          type: 'property_listing',
          amount: 5000,
          landlord_name: 'John Doe',
          description: 'Commission: Property listing #123',
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'completed',
        },
        {
          id: 2,
          type: 'damage_report',
          amount: 2000,
          landlord_name: 'Jane Smith',
          description: 'Commission: Property Maintenance Assessment submission',
          date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'completed',
        },
      ]);

      // Load earnings summary (simulated)
      setEarnings({
        total_earned: 125000,
        pending_balance: 45000,
        withdrawn_total: 80000,
        available_for_withdrawal: 45000,
      });
    } catch (error) {
      console.error('Failed to load agent data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawalRequest = async () => {
    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      toast.error('Please enter a valid withdrawal amount');
      return;
    }

    if (parseFloat(withdrawalAmount) > earnings.available_for_withdrawal) {
      toast.error(`Maximum withdrawal available: ${formatCurrency(earnings.available_for_withdrawal)}`);
      return;
    }

    setProcessingWithdrawal(true);
    try {
      // In a real implementation, call API to create withdrawal request
      toast.success(`Withdrawal request of ${formatCurrency(withdrawalAmount)} submitted`);
      setWithdrawalAmount('');
      setWithdrawalReason('');
    } catch (error) {
      toast.error('Failed to process withdrawal request');
    } finally {
      setProcessingWithdrawal(false);
    }
  };

  if (loading) return <Loader />;

  const propertyStats = {
    total: properties.length,
    active: properties.filter((p) => p.is_available).length,
    with_damage_reports: properties.filter((p) => p.damage_reports?.length > 0).length,
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto max-w-7xl px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Agent Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user?.full_name}!</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          {['overview', 'landlords', 'properties', 'earnings', 'support'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium transition ${
                activeTab === tab
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card">
                <p className="text-sm text-gray-600">Total Assigned Landlords</p>
                <p className="text-3xl font-bold text-indigo-600">{landlords.length}</p>
              </div>
              <div className="card">
                <p className="text-sm text-gray-600">Managed Properties</p>
                <p className="text-3xl font-bold text-blue-600">{propertyStats.total}</p>
              </div>
              <div className="card">
                <p className="text-sm text-gray-600">Total Earned</p>
                <p className="text-3xl font-bold text-emerald-600">{formatCurrency(earnings.total_earned)}</p>
              </div>
              <div className="card">
                <p className="text-sm text-gray-600">Available Balance</p>
                <p className="text-3xl font-bold text-orange-600">{formatCurrency(earnings.available_for_withdrawal)}</p>
              </div>
            </div>

            {/* Recent Commission Activity */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-4">Recent Commission Activity</h2>
              {commissionHistory.length > 0 ? (
                <div className="space-y-3">
                  {commissionHistory.map((item) => (
                    <div key={item.id} className="flex justify-between items-center border-b pb-3">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        <p className="text-sm text-gray-500">{item.landlord_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600">{formatCurrency(item.amount)}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(item.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No commission activity yet</p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/add-property"
                className="card bg-gradient-to-br from-indigo-50 to-blue-50 hover:shadow-lg transition"
              >
                <div className="text-3xl mb-2">🏠</div>
                <h3 className="font-semibold text-indigo-900">Add Property</h3>
                <p className="text-sm text-indigo-700">Create new property listing</p>
              </Link>
              <Link
                to="/my-properties"
                className="card bg-gradient-to-br from-blue-50 to-cyan-50 hover:shadow-lg transition"
              >
                <div className="text-3xl mb-2">📋</div>
                <h3 className="font-semibold text-blue-900">My Properties</h3>
                <p className="text-sm text-blue-700">Manage existing properties</p>
              </Link>
              <Link
                to="/disputes"
                className="card bg-gradient-to-br from-green-50 to-emerald-50 hover:shadow-lg transition"
              >
                <div className="text-3xl mb-2">⚖️</div>
                <h3 className="font-semibold text-green-900">Disputes</h3>
                <p className="text-sm text-green-700">View disputes & evidence</p>
              </Link>
            </div>
          </div>
        )}

        {/* LANDLORDS TAB */}
        {activeTab === 'landlords' && (
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Assigned Landlords</h2>
            {landlords.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {landlords.map((landlord) => (
                  <div
                    key={landlord.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                  >
                    <h3 className="font-semibold text-lg">{landlord.name}</h3>
                    <p className="text-sm text-gray-600">{landlord.email}</p>
                    <p className="text-sm text-gray-600 mb-3">{landlord.phone}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700">
                        {landlord.properties_managed} propert{landlord.properties_managed === 1 ? 'y' : 'ies'}
                      </span>
                      <Link
                        to={`/landlord/${landlord.id}`}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No assigned landlords yet</p>
            )}
          </div>
        )}

        {/* PROPERTIES TAB */}
        {activeTab === 'properties' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card">
                <p className="text-sm text-gray-600">Total Properties</p>
                <p className="text-3xl font-bold">{propertyStats.total}</p>
              </div>
              <div className="card">
                <p className="text-sm text-gray-600">Active Listings</p>
                <p className="text-3xl font-bold text-green-600">{propertyStats.active}</p>
              </div>
              <div className="card">
                <p className="text-sm text-gray-600">Property Maintenance Assessments</p>
                <p className="text-3xl font-bold text-orange-600">{propertyStats.with_damage_reports}</p>
              </div>
            </div>

            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Managed Properties</h2>
                <Link to="/add-property" className="btn btn-sm btn-primary">
                  + Add Property
                </Link>
              </div>

              {properties.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">Property</th>
                        <th className="px-4 py-2 text-left">Location</th>
                        <th className="px-4 py-2 text-left">Rent</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Damage</th>
                        <th className="px-4 py-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map((prop) => (
                        <tr key={prop.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <Link
                              to={`/property/${prop.id}`}
                              className="text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                              {prop.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{prop.city}</td>
                          <td className="px-4 py-3">{formatCurrency(prop.rent_amount)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${
                                prop.is_available
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {prop.is_available ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {prop.damage_reports?.length > 0 ? (
                              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                                {prop.damage_reports.length}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <DamageReportButton propertyId={prop.id} variant="outline" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No properties managed yet</p>
              )}
            </div>
          </div>
        )}

        {/* EARNINGS TAB */}
        {activeTab === 'earnings' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card bg-gradient-to-br from-emerald-50 to-green-50">
                <p className="text-sm text-gray-600 mb-2">Available for Withdrawal</p>
                <p className="text-4xl font-bold text-emerald-600 mb-3">
                  {formatCurrency(earnings.available_for_withdrawal)}
                </p>
                <p className="text-xs text-gray-500">Total pending: {formatCurrency(earnings.pending_balance)}</p>
              </div>

              <div className="card bg-gradient-to-br from-blue-50 to-cyan-50">
                <p className="text-sm text-gray-600 mb-2">Total Earnings</p>
                <p className="text-4xl font-bold text-blue-600 mb-3">
                  {formatCurrency(earnings.total_earned)}
                </p>
                <p className="text-xs text-gray-500">Withdrawn: {formatCurrency(earnings.withdrawn_total)}</p>
              </div>
            </div>

            {/* Withdrawal Request Form */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-4">📤 Request Withdrawal</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Withdrawal Amount *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={earnings.available_for_withdrawal}
                    step="100"
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    className="input w-full"
                    placeholder="Enter amount"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Max available: {formatCurrency(earnings.available_for_withdrawal)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason (Optional)
                  </label>
                  <textarea
                    value={withdrawalReason}
                    onChange={(e) => setWithdrawalReason(e.target.value)}
                    className="input w-full h-20 resize-none"
                    placeholder="Why are you requesting this withdrawal?"
                  />
                </div>

                <button
                  onClick={handleWithdrawalRequest}
                  disabled={processingWithdrawal || !withdrawalAmount}
                  className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingWithdrawal ? 'Processing...' : 'Submit Withdrawal Request'}
                </button>
              </div>
            </div>

            {/* Commission History */}
            <div className="card">
              <h2 className="text-xl font-semibold mb-4">Commission History</h2>
              {commissionHistory.length > 0 ? (
                <div className="space-y-3">
                  {commissionHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center border-b pb-3 last:border-b-0"
                    >
                      <div>
                        <p className="font-medium">{item.description}</p>
                        <p className="text-sm text-gray-500">{item.landlord_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600">{formatCurrency(item.amount)}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(item.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No commission history yet</p>
              )}
            </div>
          </div>
        )}

        {/* SUPPORT TAB */}
        {activeTab === 'support' && (
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Support & Resources</h2>
            <div className="space-y-4">
              <div className="border-b pb-4">
                <h3 className="font-semibold text-lg mb-2">❓ Frequently Asked Questions</h3>
                <p className="text-gray-600">How do I add a new property?</p>
                <p className="text-sm text-gray-500 mt-1">
                  Go to "Add Property" and fill in the property details. You can add Property Maintenance Assessments after publishing.
                </p>
              </div>

              <div className="border-b pb-4">
                <h3 className="font-semibold text-lg mb-2">💰 Commission Structure</h3>
                <p className="text-gray-600">How do I earn commissions?</p>
                <p className="text-sm text-gray-500 mt-1">
                  You earn commissions on property listings, Property Maintenance Assessments, dispute resolutions, and other platform activities.
                  Your landlord may also set a custom commission rate.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">📞 Contact Support</h3>
                <p className="text-gray-600">Need help?</p>
                <p className="text-sm text-gray-500 mt-1">
                  Email: support@rentalhub.com | Phone: +234-XXX-XXXX
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentDashboard;

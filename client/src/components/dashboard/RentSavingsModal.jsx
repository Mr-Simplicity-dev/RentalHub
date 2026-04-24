import React, { useState, useEffect, useCallback } from 'react';
import {
  FaTimes,
  FaPiggyBank,
  FaCheckCircle,
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaHistory,
  FaWallet,
  FaCalendarAlt,
  FaPercent,
  FaPlay,
  FaPause,
  FaArrowRight,
  FaCheck,
  FaClock,
  FaBan,
} from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';

const TABS = ['overview', 'contribute', 'withdraw', 'history'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Helpers ────────────────────────────────────────────────
function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonth(yyyyMM) {
  if (!yyyyMM) return '';
  const [year, month] = yyyyMM.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════════════
// MAIN MODAL
// ══════════════════════════════════════════════════════════
export default function RentSavingsModal({ isOpen, onClose, user, properties }) {
  const [activeTab, setActiveTab]           = useState('overview');
  const [plans, setPlans]                   = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [planDetails, setPlanDetails]       = useState(null);
  const [loading, setLoading]               = useState(false);
  const [actionLoading, setActionLoading]   = useState(false);

  // Create plan form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm]         = useState({
    property_id: '', rent_due_date: '', monthly_rent_amount: '', state_id: '', lga_id: '',
  });
  const [setupFee, setSetupFee]             = useState(null);
  const [setupFeeLoading, setSetupFeeLoading] = useState(false);

  // Contribution form
  const [contributeAmount, setContributeAmount]       = useState('');
  const [missedMonths, setMissedMonths]               = useState([]);
  const [selectedMissedMonth, setSelectedMissedMonth] = useState(null);
  const [isCatchup, setIsCatchup]                     = useState(false);

  // Early withdrawal
  const [earlyWithdrawalReason, setEarlyWithdrawalReason]       = useState('');
  const [showEarlyWithdrawConfirm, setShowEarlyWithdrawConfirm] = useState(false);

  // ── Data Loaders ────────────────────────────────────────
  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/rent-savings/plans');
      if (data.success) {
        setPlans(data.data);
        if (data.data.length > 0 && !selectedPlanId) {
          setSelectedPlanId(data.data[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedPlanId]);

  const loadPlanDetails = async (planId) => {
    try {
      const { data } = await api.get(`/rent-savings/plans/${planId}`);
      if (data.success) setPlanDetails(data.data);
    } catch (error) {
      console.error('Error loading plan details:', error);
    }
  };

  const loadMissedMonths = async (planId) => {
    try {
      const { data } = await api.get(`/rent-savings/plans/${planId}/missed-months`);
      if (data.success) setMissedMonths(data.data.missed_months || []);
    } catch (error) {
      console.error('Error loading missed months:', error);
    }
  };

  const fetchSetupFee = async (stateId, lgaId) => {
    setSetupFeeLoading(true);
    try {
      const params = new URLSearchParams();
      if (stateId) params.append('state_id', stateId);
      if (lgaId)   params.append('lga_id', lgaId);
      const { data } = await api.get(`/rent-savings/setup-fees?${params.toString()}`);
      if (data.success) setSetupFee(data.data);
    } catch (error) {
      console.error('Error fetching setup fee:', error);
    } finally {
      setSetupFeeLoading(false);
    }
  };

  // ── Effects ─────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && user) loadPlans();
  }, [isOpen, user]);

  useEffect(() => {
    if (selectedPlanId) {
      loadPlanDetails(selectedPlanId);
      loadMissedMonths(selectedPlanId);
    }
  }, [selectedPlanId]);

  // ── Handlers ────────────────────────────────────────────
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!createForm.property_id || !createForm.rent_due_date || !createForm.monthly_rent_amount) {
      toast.error('Please fill in all required fields');
      return;
    }

    setActionLoading(true);
    try {
      const { data } = await api.post('/rent-savings/plans', {
        ...createForm,
        monthly_rent_amount: parseFloat(createForm.monthly_rent_amount),
        state_id: createForm.state_id ? parseInt(createForm.state_id) : undefined,
        lga_id:   createForm.lga_id   ? parseInt(createForm.lga_id)   : undefined,
      });
      if (data.success) {
        toast.success(data.message);
        setShowCreateForm(false);
        setCreateForm({ property_id: '', rent_due_date: '', monthly_rent_amount: '', state_id: '', lga_id: '' });
        setSetupFee(null);
        loadPlans();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to create savings plan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePlan = async (planId) => {
    setActionLoading(true);
    try {
      const { data } = await api.patch(`/rent-savings/plans/${planId}/toggle`);
      if (data.success) {
        toast.success(data.message);
        loadPlans();
        if (planDetails?.id === planId) {
          setPlanDetails(prev => ({ ...prev, is_active: !prev.is_active }));
        }
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to toggle plan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleContribute = async () => {
    if (!selectedPlanId || !contributeAmount) {
      toast.error('Please select a plan and enter an amount');
      return;
    }
    // Use selected missed month for catch-up, otherwise current month
    const month = isCatchup && selectedMissedMonth ? selectedMissedMonth : currentMonthStr();

    setActionLoading(true);
    try {
      const { data } = await api.post(`/rent-savings/plans/${selectedPlanId}/contributions`, {
        amount: parseFloat(contributeAmount),
        month,
        is_catchup: isCatchup,
        previous_month_missed: isCatchup ? selectedMissedMonth : null,
      });
      if (data.success) {
        toast.success(data.message);
        setContributeAmount('');
        setIsCatchup(false);
        setSelectedMissedMonth(null);
        loadPlanDetails(selectedPlanId);
        loadMissedMonths(selectedPlanId);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to make contribution');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdrawAtMaturity = async () => {
    if (!selectedPlanId) return;
    if (!window.confirm('Are you sure you want to withdraw your savings? A 2% maturity commission will be applied.')) return;

    setActionLoading(true);
    try {
      // Matches corrected route: POST /plans/:id/withdraw-maturity
      const { data } = await api.post(`/rent-savings/plans/${selectedPlanId}/withdraw-maturity`);
      if (data.success) {
        toast.success(data.message);
        loadPlanDetails(selectedPlanId);
        loadPlans();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to withdraw savings');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestEarlyWithdrawal = async () => {
    if (!selectedPlanId) return;
    setActionLoading(true);
    try {
      // Matches corrected route: POST /plans/:id/withdraw-early
      const { data } = await api.post(`/rent-savings/plans/${selectedPlanId}/withdraw-early`, {
        reason: earlyWithdrawalReason,
      });
      if (data.success) {
        toast.success(data.message);
        setShowEarlyWithdrawConfirm(false);
        setEarlyWithdrawalReason('');
        loadPlanDetails(selectedPlanId);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to request early withdrawal');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Derived values ───────────────────────────────────────
  const selectedPlan = plans.find(p => p.id === selectedPlanId) || planDetails;
  const alreadyContributedThisMonth = planDetails?.contributions?.some(
    c => c.saved_for_month === currentMonthStr()
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <FaPiggyBank className="text-teal-500 text-2xl" />
            <h2 className="text-lg font-bold text-gray-800">Rent Savings</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <FaTimes className="text-xl" />
          </button>
        </div>

        {/* ── Tabs ───────────────────────────────────────── */}
        <div className="flex border-b px-6">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview'    && '📊 Overview'}
              {tab === 'contribute'  && '💰 Contribute'}
              {tab === 'withdraw'    && '🏦 Withdraw'}
              {tab === 'history'     && '📜 History'}
            </button>
          ))}
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto" />
              <p className="text-gray-500 mt-3 text-sm">Loading savings plans…</p>
            </div>

          ) : plans.length === 0 && !showCreateForm ? (
            /* ─── No plans ─── */
            <div className="text-center py-12">
              <FaPiggyBank className="text-gray-300 text-5xl mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Savings Plans Yet</h3>
              <p className="text-gray-500 mb-6 text-sm">Start saving towards your rent today!</p>
              <button onClick={() => setShowCreateForm(true)} className="btn btn-primary">
                Create a Savings Plan
              </button>
            </div>

          ) : showCreateForm ? (
            /* ─── Create Plan Form ─── */
            <CreatePlanForm
              createForm={createForm}
              setCreateForm={setCreateForm}
              setupFee={setupFee}
              setupFeeLoading={setupFeeLoading}
              actionLoading={actionLoading}
              properties={properties}
              fetchSetupFee={fetchSetupFee}
              onSubmit={handleCreatePlan}
              onCancel={() => { setShowCreateForm(false); setSetupFee(null); }}
            />

          ) : (
            /* ─── Plans View ─── */
            <>
              {/* Plan selector when multiple plans exist */}
              {plans.length > 1 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {plans.map(plan => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                        plan.id === selectedPlanId
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 text-gray-600 hover:border-teal-300'
                      }`}
                    >
                      {(plan.property_title || 'Property').substring(0, 22)}
                      {(plan.property_title || '').length > 22 ? '…' : ''}
                    </button>
                  ))}
                </div>
              )}

              {selectedPlan ? (
                <>
                  {activeTab === 'overview' && (
                    <OverviewTab
                      plan={selectedPlan}
                      planDetails={planDetails}
                      onToggle={() => handleTogglePlan(selectedPlan.id)}
                      actionLoading={actionLoading}
                      onCreateNew={() => setShowCreateForm(true)}
                    />
                  )}
                  {activeTab === 'contribute' && (
                    <ContributeTab
                      plan={selectedPlan}
                      planDetails={planDetails}
                      contributeAmount={contributeAmount}
                      setContributeAmount={setContributeAmount}
                      missedMonths={missedMonths}
                      isCatchup={isCatchup}
                      setIsCatchup={setIsCatchup}
                      selectedMissedMonth={selectedMissedMonth}
                      setSelectedMissedMonth={setSelectedMissedMonth}
                      alreadyContributedThisMonth={alreadyContributedThisMonth}
                      onContribute={handleContribute}
                      actionLoading={actionLoading}
                    />
                  )}
                  {activeTab === 'withdraw' && (
                    <WithdrawTab
                      plan={selectedPlan}
                      planDetails={planDetails}
                      onWithdrawMaturity={handleWithdrawAtMaturity}
                      onRequestEarlyWithdrawal={() => setShowEarlyWithdrawConfirm(true)}
                      actionLoading={actionLoading}
                    />
                  )}
                  {activeTab === 'history' && (
                    <HistoryTab plan={selectedPlan} planDetails={planDetails} />
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">Select a plan to view details.</div>
              )}
            </>
          )}
        </div>

        {/* ── Early Withdrawal Confirmation Modal ─────────── */}
        {showEarlyWithdrawConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="text-center mb-4">
                <FaExclamationTriangle className="text-red-500 text-4xl mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-800">Early Withdrawal Request</h3>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-red-800">
                  <strong>⚠️ 5.8% Penalty:</strong> A 5.8% penalty fee will be deducted from your total
                  savings. This request requires admin approval before funds are released.
                </p>
              </div>

              {selectedPlan && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Saved</span>
                    <span className="font-semibold">₦{formatCurrency(selectedPlan.total_saved)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">5.8% Penalty</span>
                    <span className="font-semibold text-red-600">
                      -₦{formatCurrency(Number(selectedPlan.total_saved) * 0.058)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-2">
                    <span>Estimated Net Payout</span>
                    <span className="text-green-600">
                      ₦{formatCurrency(Number(selectedPlan.total_saved) * 0.942)}
                    </span>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for early withdrawal <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={earlyWithdrawalReason}
                  onChange={(e) => setEarlyWithdrawalReason(e.target.value)}
                  className="input w-full"
                  rows={3}
                  placeholder="Please provide a reason for early withdrawal…"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowEarlyWithdrawConfirm(false); setEarlyWithdrawalReason(''); }}
                  className="btn w-full"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestEarlyWithdrawal}
                  disabled={actionLoading || !earlyWithdrawalReason.trim()}
                  className="btn bg-red-600 text-white w-full hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// CREATE PLAN FORM (extracted for clarity)
// ══════════════════════════════════════════════════════════
function CreatePlanForm({
  createForm, setCreateForm, setupFee, setupFeeLoading,
  actionLoading, properties, fetchSetupFee, onSubmit, onCancel,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-800">Create New Savings Plan</h3>
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Property */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
          <select
            required
            value={createForm.property_id}
            onChange={(e) => setCreateForm(prev => ({ ...prev, property_id: e.target.value }))}
            className="input w-full"
          >
            <option value="">— Select a property —</option>
            {properties?.map(p => (
              <option key={p.id} value={p.id}>{p.title} · {p.address}</option>
            ))}
          </select>
        </div>

        {/* Due date + rent amount */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rent Due Date *</label>
            <input
              type="date"
              required
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              value={createForm.rent_due_date}
              onChange={(e) => setCreateForm(prev => ({ ...prev, rent_due_date: e.target.value }))}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent (₦) *</label>
            <input
              type="number"
              required
              min="1"
              value={createForm.monthly_rent_amount}
              onChange={(e) => setCreateForm(prev => ({ ...prev, monthly_rent_amount: e.target.value }))}
              className="input w-full"
              placeholder="e.g. 500000"
            />
          </div>
        </div>

        {/* Location (for setup fee lookup) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State ID <span className="text-gray-400 font-normal">(for setup fee)</span>
            </label>
            <input
              type="number"
              value={createForm.state_id}
              onChange={(e) => {
                setCreateForm(prev => ({ ...prev, state_id: e.target.value }));
                if (e.target.value) fetchSetupFee(e.target.value, createForm.lga_id);
              }}
              className="input w-full"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LGA ID <span className="text-gray-400 font-normal">(for setup fee)</span>
            </label>
            <input
              type="number"
              value={createForm.lga_id}
              onChange={(e) => {
                setCreateForm(prev => ({ ...prev, lga_id: e.target.value }));
                if (createForm.state_id) fetchSetupFee(createForm.state_id, e.target.value);
              }}
              className="input w-full"
              placeholder="Optional"
            />
          </div>
        </div>

        {/* Setup fee display */}
        {setupFeeLoading && (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <span className="animate-spin inline-block w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full" />
            Checking setup fee…
          </p>
        )}
        {setupFee && !setupFeeLoading && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-amber-800">
              One-time Setup Fee: ₦{formatCurrency(setupFee.setup_fee ?? setupFee.setup_fee_amount ?? 2000)}
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Charged from your wallet when the plan is created.
              {setupFee.is_default && ' (Default rate — no specific fee configured for your location.)'}
            </p>
          </div>
        )}

        {/* Savings preview */}
        {createForm.monthly_rent_amount && createForm.rent_due_date && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 text-sm">
            {(() => {
              const months = Math.max(1, Math.round(
                (new Date(createForm.rent_due_date) - new Date()) / (1000 * 60 * 60 * 24 * 30.44)
              ));
              const monthly = (parseFloat(createForm.monthly_rent_amount) / months).toFixed(2);
              return (
                <>
                  <p className="text-teal-700 font-medium">Savings Preview</p>
                  <p className="text-teal-600 mt-1">
                    Save approximately <strong>₦{formatCurrency(monthly)}</strong>/month
                    over <strong>{months}</strong> month{months !== 1 ? 's' : ''} to reach your target.
                  </p>
                </>
              );
            })()}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} className="btn w-full" disabled={actionLoading}>
            Cancel
          </button>
          <button type="submit" disabled={actionLoading} className="btn btn-primary w-full disabled:opacity-50">
            {actionLoading ? 'Creating…' : 'Create Savings Plan'}
          </button>
        </div>
      </form>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════
function OverviewTab({ plan, planDetails, onToggle, actionLoading, onCreateNew }) {
  const totalSaved    = Number(plan.total_saved || 0);
  const target        = Number(plan.target_savings_amount || plan.monthly_rent_amount || 0);
  const progressPct   = target > 0 ? Math.min(100, Math.round((totalSaved / target) * 100)) : 0;
  const monthlyAmount = Number(plan.monthly_savings_amount || 0);
  const dueDate       = new Date(plan.rent_due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  const monthsUntilDue = Math.max(0, Math.round(
    (new Date(plan.rent_due_date) - new Date()) / (1000 * 60 * 60 * 24 * 30.44)
  ));

  const statusColors = {
    active:    'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-5">
      {/* Status badge */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColors[plan.status] || 'bg-gray-100 text-gray-600'}`}>
          {plan.is_active ? plan.status : 'paused'}
        </span>
        <span className="text-xs text-gray-400">Plan #{plan.id}</span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-gray-700">Savings Progress</span>
          <span className="text-sm font-bold text-teal-600">{progressPct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-teal-500 h-3 rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-xs text-gray-500">
          <span>₦{formatCurrency(totalSaved)} saved</span>
          <span>Target: ₦{formatCurrency(target)}</span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Property',        value: plan.property_title || 'N/A',          color: 'teal'   },
          { label: 'Monthly Savings', value: `₦${formatCurrency(monthlyAmount)}`,   color: 'blue'   },
          { label: 'Rent Due',        value: dueDate,                               color: 'purple' },
          { label: 'Months Left',     value: `${monthsUntilDue} month${monthsUntilDue !== 1 ? 's' : ''}`, color: 'amber' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-xl px-4 py-3`}>
            <p className={`text-xs text-${color}-600`}>{label}</p>
            <p className={`font-semibold text-${color}-800 text-sm truncate`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Contribution count */}
      {planDetails?.contributions && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 flex justify-between text-sm">
          <span className="text-gray-500">Total Contributions</span>
          <span className="font-semibold text-gray-800">{planDetails.contributions.length}</span>
        </div>
      )}

      {/* Setup fee badge */}
      {Number(plan.setup_fee_amount) > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-xs text-gray-600 flex justify-between">
          <span>Setup Fee: ₦{formatCurrency(plan.setup_fee_amount)}</span>
          <span>{plan.setup_fee_paid ? '✅ Paid' : '❌ Unpaid'}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {plan.status === 'active' && (
          <button
            onClick={onToggle}
            disabled={actionLoading}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
              plan.is_active
                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
            }`}
          >
            {plan.is_active ? <><FaPause /> Pause</> : <><FaPlay /> Activate</>}
          </button>
        )}
        <button
          onClick={onCreateNew}
          className="flex-1 bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <FaPiggyBank /> New Plan
        </button>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// CONTRIBUTE TAB
// ══════════════════════════════════════════════════════════
function ContributeTab({
  plan, planDetails, contributeAmount, setContributeAmount,
  missedMonths, isCatchup, setIsCatchup, selectedMissedMonth, setSelectedMissedMonth,
  alreadyContributedThisMonth, onContribute, actionLoading,
}) {
  const monthlyAmount   = Number(plan.monthly_savings_amount || 0);
  const monthName       = formatMonth(currentMonthStr());
  const contributionAmt = parseFloat(contributeAmount) || 0;
  const commission1pct  = Math.round(contributionAmt * 0.01 * 100) / 100;
  const netSaved        = Math.round((contributionAmt - commission1pct) * 100) / 100;
  const isEnoughAmount  = contributionAmt >= monthlyAmount;

  // Pre-fill amount with monthly savings amount
  useEffect(() => {
    if (monthlyAmount > 0 && !contributeAmount) {
      setContributeAmount(String(monthlyAmount));
    }
  }, [monthlyAmount]);

  // Plan not active
  if (!plan.is_active || plan.status !== 'active') {
    return (
      <div className="text-center py-10">
        <FaBan className="text-gray-300 text-4xl mx-auto mb-3" />
        <h3 className="text-base font-semibold text-gray-600 mb-1">
          Plan is {plan.is_active ? plan.status : 'paused'}
        </h3>
        <p className="text-gray-500 text-sm">
          {plan.status === 'active'
            ? 'Activate the plan from the Overview tab to make contributions.'
            : 'This plan is no longer accepting contributions.'}
        </p>
      </div>
    );
  }

  // Already contributed this month (non-catchup)
  if (alreadyContributedThisMonth && !isCatchup) {
    return (
      <div className="space-y-5">
        <div className="text-center py-6">
          <FaCheckCircle className="text-green-500 text-4xl mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">Already Contributed!</h3>
          <p className="text-gray-500 text-sm">You've already saved for {monthName}.</p>
        </div>

        {/* Missed months catch-up prompt */}
        {missedMonths.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-amber-800 mb-2">
              {missedMonths.length} missed month{missedMonths.length > 1 ? 's' : ''} — catch up now:
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {missedMonths.map(mm => (
                <span key={mm} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">{mm}</span>
              ))}
            </div>
            <button
              onClick={() => { setIsCatchup(true); setSelectedMissedMonth(missedMonths[0]); }}
              className="text-sm text-indigo-600 hover:underline font-medium"
            >
              Catch up →
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Month label */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
        <p className="text-xs text-teal-600">
          {isCatchup ? 'Catching up for' : 'Saving for'}
        </p>
        <p className="text-lg font-bold text-teal-800">
          {isCatchup && selectedMissedMonth ? formatMonth(selectedMissedMonth) : monthName}
        </p>
        {!isCatchup && planDetails?.contributions?.length === 0 && (
          <p className="text-xs text-teal-600 mt-1">First contribution! 🎉</p>
        )}
      </div>

      {/* Missed months alert */}
      {missedMonths.length > 0 && !isCatchup && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {missedMonths.length} missed month{missedMonths.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {missedMonths.slice(0, 6).map(mm => (
                  <span key={mm} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">{mm}</span>
                ))}
                {missedMonths.length > 6 && (
                  <span className="text-xs text-gray-500">+{missedMonths.length - 6} more</span>
                )}
              </div>
              <button
                onClick={() => { setIsCatchup(true); setSelectedMissedMonth(missedMonths[0]); }}
                className="mt-2 text-xs text-indigo-600 hover:underline"
              >
                Catch up now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catch-up month selector */}
      {isCatchup && missedMonths.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select missed month</label>
          <select
            value={selectedMissedMonth || ''}
            onChange={(e) => setSelectedMissedMonth(e.target.value)}
            className="input w-full"
          >
            <option value="">— Select month —</option>
            {missedMonths.map(mm => (
              <option key={mm} value={mm}>{formatMonth(mm)} ({mm})</option>
            ))}
          </select>
          <button
            onClick={() => { setIsCatchup(false); setSelectedMissedMonth(null); }}
            className="text-xs text-gray-500 hover:text-gray-700 mt-1"
          >
            ← Back to current month
          </button>
        </div>
      )}

      {/* Amount input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Amount to Save (₦)
        </label>
        <input
          type="number"
          min={monthlyAmount}
          step="0.01"
          value={contributeAmount}
          onChange={(e) => setContributeAmount(e.target.value)}
          className="input w-full text-lg font-bold"
          placeholder={`Min: ₦${formatCurrency(monthlyAmount)}`}
        />
        <p className="text-xs text-gray-500 mt-1">
          Minimum: ₦{formatCurrency(monthlyAmount)}
        </p>
      </div>

      {/* Fee breakdown */}
      {isEnoughAmount && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Breakdown</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Contribution</span>
            <span className="font-medium">₦{formatCurrency(contributionAmt)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 flex items-center gap-1">
              <FaPercent className="text-[10px] text-red-500" /> 1% Maintenance Fee
            </span>
            <span className="font-medium text-red-600">-₦{formatCurrency(commission1pct)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t pt-2">
            <span>Net Saved</span>
            <span className="text-green-600">₦{formatCurrency(netSaved)}</span>
          </div>
        </div>
      )}

      <button
        onClick={onContribute}
        disabled={actionLoading || !isEnoughAmount || (isCatchup && !selectedMissedMonth)}
        className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {actionLoading ? (
          'Processing…'
        ) : isCatchup ? (
          `Catch Up · Pay ₦${formatCurrency(contributionAmt)}`
        ) : (
          <><FaWallet /> Save ₦{formatCurrency(contributionAmt)} for {monthName}</>
        )}
      </button>
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// WITHDRAW TAB
// ══════════════════════════════════════════════════════════
function WithdrawTab({ plan, planDetails, onWithdrawMaturity, onRequestEarlyWithdrawal, actionLoading }) {
  const totalSaved         = Number(plan.total_saved || 0);
  const dueDate            = new Date(plan.rent_due_date);
  const now                = new Date();
  const sevenDaysBeforeDue = new Date(dueDate);
  sevenDaysBeforeDue.setDate(sevenDaysBeforeDue.getDate() - 7);
  const isMaturityEligible = now >= sevenDaysBeforeDue;
  const isTerminated       = ['completed', 'cancelled'].includes(plan.status);

  // Pending early withdrawal check
  const hasPendingRequest = planDetails?.early_withdrawals?.some(r => r.status === 'pending');

  if (totalSaved <= 0) {
    return (
      <div className="text-center py-10">
        <FaPiggyBank className="text-gray-300 text-4xl mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No savings to withdraw yet. Start contributing first!</p>
      </div>
    );
  }

  if (isTerminated) {
    return (
      <div className="text-center py-10">
        <FaCheckCircle className={`text-4xl mx-auto mb-3 ${plan.status === 'completed' ? 'text-green-500' : 'text-gray-400'}`} />
        <h3 className="text-base font-semibold text-gray-700 capitalize">Plan {plan.status}</h3>
        <p className="text-gray-500 mt-1 text-sm">This plan has been {plan.status}.</p>
      </div>
    );
  }

  // Maturity commission preview
  const maturityCommission = Math.round(totalSaved * 0.02 * 100) / 100;
  const maturityNetPayout  = Math.round((totalSaved - maturityCommission) * 100) / 100;

  // Early withdrawal penalty preview
  const earlyPenalty  = Math.round(totalSaved * 0.058 * 100) / 100;
  const earlyNetPayout = Math.round((totalSaved - earlyPenalty) * 100) / 100;

  return (
    <div className="space-y-5">
      {/* Total savings display */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
        <p className="text-xs text-gray-500 mb-1">Total Savings Available</p>
        <p className="text-3xl font-bold text-gray-800">₦{formatCurrency(totalSaved)}</p>
      </div>

      {/* ── Maturity Withdrawal ── */}
      <div className={`rounded-xl border p-4 space-y-3 ${isMaturityEligible ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-start gap-3">
          {isMaturityEligible
            ? <FaCheckCircle className="text-green-500 text-xl mt-0.5 shrink-0" />
            : <FaClock className="text-gray-400 text-xl mt-0.5 shrink-0" />
          }
          <div className="flex-1">
            <h4 className="font-semibold text-gray-800 text-sm">Maturity Withdrawal</h4>
            {isMaturityEligible ? (
              <p className="text-xs text-green-700 mt-0.5">
                Your rent is due — you can withdraw now.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">
                Available from{' '}
                <strong>{sevenDaysBeforeDue.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                {' '}(7 days before due date).
              </p>
            )}
          </div>
        </div>

        {isMaturityEligible && (
          <>
            <div className="bg-white rounded-lg px-3 py-2.5 text-sm space-y-1.5 border border-green-100">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Saved</span>
                <span className="font-medium">₦{formatCurrency(totalSaved)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">2% Maturity Commission</span>
                <span className="font-medium text-red-600">-₦{formatCurrency(maturityCommission)}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-1.5">
                <span>You Receive</span>
                <span className="text-green-600">₦{formatCurrency(maturityNetPayout)}</span>
              </div>
            </div>
            <button
              onClick={onWithdrawMaturity}
              disabled={actionLoading}
              className="btn btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FaMoneyBillWave />
              {actionLoading ? 'Processing…' : `Withdraw ₦${formatCurrency(maturityNetPayout)}`}
            </button>
          </>
        )}
      </div>

      {/* ── Early Withdrawal ── */}
      <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="text-red-400 text-xl mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-gray-800 text-sm">Early Withdrawal</h4>
            <p className="text-xs text-red-600 mt-0.5">
              Requires admin approval. A <strong>5.8% penalty</strong> will be deducted.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg px-3 py-2.5 text-sm space-y-1.5 border border-red-100">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Saved</span>
            <span className="font-medium">₦{formatCurrency(totalSaved)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">5.8% Penalty</span>
            <span className="font-medium text-red-600">-₦{formatCurrency(earlyPenalty)}</span>
          </div>
          <div className="flex justify-between font-bold border-t pt-1.5">
            <span>Estimated Payout</span>
            <span className="text-gray-700">₦{formatCurrency(earlyNetPayout)}</span>
          </div>
        </div>

        {hasPendingRequest ? (
          <div className="text-center py-2">
            <span className="inline-flex items-center gap-2 text-sm text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full font-medium">
              <FaClock className="text-xs" /> Withdrawal Request Pending Admin Review
            </span>
          </div>
        ) : (
          <button
            onClick={onRequestEarlyWithdrawal}
            disabled={actionLoading}
            className="btn bg-red-600 text-white w-full hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <FaArrowRight />
            {actionLoading ? 'Submitting…' : 'Request Early Withdrawal'}
          </button>
        )}
      </div>

      {/* Past early withdrawal requests */}
      {planDetails?.early_withdrawals?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Withdrawal Requests</p>
          <div className="space-y-2">
            {planDetails.early_withdrawals.map(ew => (
              <div key={ew.id} className="flex justify-between items-center text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                <div>
                  <span className="font-medium text-gray-700">₦{formatCurrency(ew.requested_amount)}</span>
                  <span className="text-gray-400 text-xs ml-2">
                    {new Date(ew.requested_at).toLocaleDateString('en-NG')}
                  </span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                  ew.status === 'approved' ? 'bg-green-100 text-green-700'
                  : ew.status === 'rejected' ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
                }`}>
                  {ew.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// HISTORY TAB
// ══════════════════════════════════════════════════════════
function HistoryTab({ plan, planDetails }) {
  const contributions = planDetails?.contributions || [];
  const fees          = planDetails?.fees_charged   || [];

  if (contributions.length === 0) {
    return (
      <div className="text-center py-10">
        <FaHistory className="text-gray-300 text-4xl mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No contribution history yet.</p>
      </div>
    );
  }

  // Summary stats
  const totalContributed = contributions.reduce((s, c) => s + Number(c.amount), 0);
  const totalFees        = contributions.reduce((s, c) => s + Number(c.commission_1pct), 0);
  const totalNetSaved    = contributions.reduce((s, c) => s + Number(c.net_saved), 0);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Contributed',  value: `₦${formatCurrency(totalContributed)}`, color: 'blue'  },
          { label: 'Fees Paid',    value: `₦${formatCurrency(totalFees)}`,         color: 'red'   },
          { label: 'Net Saved',    value: `₦${formatCurrency(totalNetSaved)}`,     color: 'green' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`bg-${color}-50 border border-${color}-100 rounded-xl px-3 py-2.5 text-center`}>
            <p className={`text-xs text-${color}-600`}>{label}</p>
            <p className={`text-sm font-bold text-${color}-800 mt-0.5`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Contributions list */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Contributions ({contributions.length})
        </p>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {contributions.map((c) => (
            <div key={c.id} className="flex items-start justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {formatMonth(c.saved_for_month)}
                  </span>
                  {c.is_catchup && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                      catch-up
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(c.contributed_at).toLocaleDateString('en-NG', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  1% fee: ₦{formatCurrency(c.commission_1pct)} · Net: ₦{formatCurrency(c.net_saved)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-800">₦{formatCurrency(c.amount)}</p>
                <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">saved</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extra fees (setup, maturity) from plan details */}
      {fees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Other Fees Charged
          </p>
          <div className="space-y-1.5">
            {fees.map((f, i) => (
              <div key={i} className="flex justify-between items-center text-sm bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <div>
                  <span className="text-gray-700 capitalize">
                    {f.revenue_type.replace(/_/g, ' ')}
                  </span>
                  {f.description && (
                    <p className="text-xs text-gray-400">{f.description}</p>
                  )}
                </div>
                <span className="font-semibold text-red-600">₦{formatCurrency(f.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
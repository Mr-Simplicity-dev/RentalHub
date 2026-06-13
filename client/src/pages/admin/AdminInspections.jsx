import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Loader from '../../components/common/Loader';
import Modal from '../../components/common/Modal';
import {
  FaSearch,
  FaClipboardList,
  FaCheckCircle,
  FaTimesCircle,
  FaUserCheck,
  FaClipboardCheck,
  FaBan,
} from 'react-icons/fa';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'inspecting', label: 'Inspecting' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_STYLES = {
  pending_payment: 'bg-gray-100 text-gray-700',
  paid: 'bg-blue-100 text-blue-700',
  assigned: 'bg-yellow-100 text-yellow-700',
  inspecting: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const PAGE_SIZE = 20;

const AdminInspections = () => {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedInspection, setSelectedInspection] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeSummary, setCompleteSummary] = useState('');

  const loadInspections = useCallback(async (p = 1, query = '', status = '') => {
    setLoading(true);
    try {
      const res = await api.get('/admin/inspections', {
        params: { search: query, status, page: p, limit: PAGE_SIZE },
      });
      if (res.data?.success) {
        setInspections(res.data.data);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load inspections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    loadInspections(page, debouncedSearch, statusFilter);
  }, [page, debouncedSearch, statusFilter, loadInspections]);

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, pagination.total);

  const openDetail = async (inspection) => {
    try {
      const res = await api.get(`/admin/inspections/${inspection.id}`);
      if (res.data?.success) {
        setSelectedInspection(res.data.data);
        setShowDetailModal(true);
      }
    } catch (err) {
      console.error('Failed to load inspection detail:', err);
    }
  };

  const handleAssign = async (id) => {
    setActionLoading(true);
    try {
      const res = await api.post(`/admin/inspections/${id}/assign`);
      if (res.data?.success) {
        loadInspections(page, debouncedSearch, statusFilter);
        if (selectedInspection?.id === id) {
          setSelectedInspection((prev) => ({ ...prev, status: 'assigned', assigned_admin_id: res.data.data.assigned_admin_id }));
        }
      }
    } catch (err) {
      console.error('Failed to assign inspection:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!completeSummary.trim()) return;
    setActionLoading(true);
    try {
      const res = await api.post(`/admin/inspections/${selectedInspection.id}/complete`, {
        inspection_summary: completeSummary,
      });
      if (res.data?.success) {
        setShowCompleteModal(false);
        setCompleteSummary('');
        setSelectedInspection(null);
        setShowDetailModal(false);
        loadInspections(page, debouncedSearch, statusFilter);
      }
    } catch (err) {
      console.error('Failed to complete inspection:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (id) => {
    setActionLoading(true);
    try {
      const res = await api.post(`/admin/inspections/${id}/cancel`);
      if (res.data?.success) {
        loadInspections(page, debouncedSearch, statusFilter);
        if (selectedInspection?.id === id) {
          setSelectedInspection((prev) => ({ ...prev, status: 'cancelled' }));
        }
      }
    } catch (err) {
      console.error('Failed to cancel inspection:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && inspections.length === 0) return <Loader fullScreen />;

  return (
    <div>
      <div className="mb-6 flex flex-col items-center gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Property Inspections</h1>
          <p className="text-gray-600">
            {pagination.total
              ? `Showing ${from}-${to} of ${pagination.total}`
              : 'No inspection requests'}
          </p>
        </div>

        <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search property, tenant..."
              className="input pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input sm:w-44"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {inspections.map((insp) => (
              <tr key={insp.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FaClipboardList className="shrink-0 text-primary-600" />
                    <span className="font-medium">{insp.property_title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {insp.city}{insp.area ? `, ${insp.area}` : ''}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{insp.tenant_name}</div>
                  <div className="text-xs text-gray-500">{insp.tenant_email}</div>
                </td>
                <td className="px-4 py-3">₦{Number(insp.amount).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[insp.status] || 'bg-gray-100 text-gray-700'}`}>
                    {insp.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {insp.assigned_admin_name || '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(insp.requested_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openDetail(insp)}
                    className="text-primary-600 hover:underline"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {inspections.length === 0 && !loading && (
              <tr>
                <td colSpan="7" className="py-8 text-center text-gray-500">
                  No inspection requests found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn btn-sm"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {pagination.pages}
          </span>
          <button
            disabled={page === pagination.pages}
            onClick={() => setPage((p) => p + 1)}
            className="btn btn-sm"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedInspection(null); }}
        title="Inspection Details"
        size="large"
      >
        {selectedInspection && (
          <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
                  Property
                </h4>
                <p className="font-medium text-gray-900">{selectedInspection.property_title}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {[selectedInspection.full_address, selectedInspection.city, selectedInspection.state_name]
                    .filter(Boolean).join(', ')}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Rent: ₦{Number(selectedInspection.rent_amount).toLocaleString()}/{selectedInspection.payment_frequency || 'year'}
                </p>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
                  Tenant
                </h4>
                <p className="font-medium text-gray-900">{selectedInspection.tenant_name}</p>
                <p className="mt-1 text-sm text-gray-600">{selectedInspection.tenant_email}</p>
                <p className="mt-1 text-sm text-gray-600">{selectedInspection.tenant_phone}</p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
                  Payment
                </h4>
                <p className="text-gray-900">
                  Amount: ₦{Number(selectedInspection.amount).toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Status: {selectedInspection.payment_status || '—'}
                </p>
                {selectedInspection.transaction_reference && (
                  <p className="mt-1 text-sm text-gray-600">
                    Ref: {selectedInspection.transaction_reference}
                  </p>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
                  Status & Timeline
                </h4>
                <p>
                  <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[selectedInspection.status]}`}>
                    {selectedInspection.status.replace(/_/g, ' ')}
                  </span>
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Requested: {new Date(selectedInspection.requested_at).toLocaleDateString()}
                </p>
                {selectedInspection.paid_at && (
                  <p className="text-sm text-gray-600">
                    Paid: {new Date(selectedInspection.paid_at).toLocaleDateString()}
                  </p>
                )}
                {selectedInspection.completed_at && (
                  <p className="text-sm text-gray-600">
                    Completed: {new Date(selectedInspection.completed_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {selectedInspection.assigned_admin_name && (
              <div>
                <h4 className="mb-1 text-sm font-semibold text-gray-500 uppercase">
                  Assigned Inspector
                </h4>
                <p className="text-gray-900">
                  <FaUserCheck className="mr-1 inline text-primary-600" />
                  {selectedInspection.assigned_admin_name}
                </p>
              </div>
            )}

            {selectedInspection.tenant_note && (
              <div>
                <h4 className="mb-1 text-sm font-semibold text-gray-500 uppercase">
                  Tenant&apos;s Note
                </h4>
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  {selectedInspection.tenant_note}
                </p>
              </div>
            )}

            {selectedInspection.status === 'completed' && selectedInspection.inspection_summary && (
              <div>
                <h4 className="mb-1 text-sm font-semibold text-gray-500 uppercase">
                  <FaClipboardCheck className="mr-1 inline text-green-600" />
                  Inspection Report
                </h4>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-gray-800">
                  {selectedInspection.inspection_summary}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 border-t pt-4">
              {selectedInspection.status === 'paid' && (
                <button
                  onClick={() => handleAssign(selectedInspection.id)}
                  disabled={actionLoading}
                  className="btn btn-primary"
                >
                  {actionLoading ? 'Assigning...' : 'Assign to Me'}
                </button>
              )}
              {(selectedInspection.status === 'assigned' || selectedInspection.status === 'inspecting') && (
                <>
                  <button
                    onClick={() => { setShowCompleteModal(true); }}
                    disabled={actionLoading}
                    className="btn btn-primary"
                  >
                    <FaCheckCircle className="mr-1" />
                    Complete Inspection
                  </button>
                  <button
                    onClick={() => handleCancel(selectedInspection.id)}
                    disabled={actionLoading}
                    className="btn btn-outline border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <FaBan className="mr-1" />
                    Cancel
                  </button>
                </>
              )}
              {selectedInspection.status === 'cancelled' && (
                <p className="text-sm text-gray-500">This inspection was cancelled.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Complete Inspection Modal */}
      <Modal
        isOpen={showCompleteModal}
        onClose={() => { setShowCompleteModal(false); setCompleteSummary(''); }}
        title="Complete Inspection"
        size="medium"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Inspection Report
            </label>
            <textarea
              value={completeSummary}
              onChange={(e) => setCompleteSummary(e.target.value)}
              rows={6}
              className="input w-full resize-none"
              placeholder="Describe what was found during the inspection. Mention property condition, accuracy of listing details, any issues discovered..."
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowCompleteModal(false); setCompleteSummary(''); }}
              className="btn flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleComplete}
              disabled={actionLoading || !completeSummary.trim()}
              className="btn btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminInspections;

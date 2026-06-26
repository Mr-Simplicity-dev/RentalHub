import React, { useCallback, useEffect, useState } from 'react';
import { FaUser } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import Loader from '../../components/common/Loader';

const AdminAgentManagement = () => {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({ status: 'active' });
  const [assignmentAction, setAssignmentAction] = useState({
    open: false,
    action: '',
    assignment: null,
    note: '',
    error: '',
    working: false,
  });
  const [formData, setFormData] = useState({
    landlordId: '',
    agentId: '',
    permissions: {
      canManageProperties: true,
      canManageDamageReports: true,
      canManageDisputes: true,
      canManageLegal: true,
      canManageFinances: false,
    },
  });

  const loadAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams(filters);
      const response = await api.get(`/admin/agents/assignments?${query}`);
      
      if (response.data?.success) {
        setAssignments(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load assignments:', error);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const handleAssign = async (e) => {
    e.preventDefault();
    
    if (!formData.landlordId || !formData.agentId) {
      toast.error('Please select both landlord and agent');
      return;
    }

    try {
      const response = await api.post('/admin/agents/assignments', {
        landlordId: parseInt(formData.landlordId),
        agentId: parseInt(formData.agentId),
        permissions: formData.permissions,
      });

      if (response.data?.success) {
        toast.success('Agent assigned successfully');
        setShowModal(false);
        setFormData({
          landlordId: '',
          agentId: '',
          permissions: {
            canManageProperties: true,
            canManageDamageReports: true,
            canManageDisputes: true,
            canManageLegal: true,
            canManageFinances: false,
          },
        });
        loadAssignments();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to assign agent');
    }
  };

  const openAssignmentAction = (action, assignment) => {
    setAssignmentAction({
      open: true,
      action,
      assignment,
      note: '',
      error: '',
      working: false,
    });
  };

  const closeAssignmentAction = () => {
    if (assignmentAction.working) return;
    setAssignmentAction({
      open: false,
      action: '',
      assignment: null,
      note: '',
      error: '',
      working: false,
    });
  };

  const submitAssignmentAction = async (e) => {
    e.preventDefault();

    const note = assignmentAction.note.trim();
    if (!note) {
      setAssignmentAction((prev) => ({ ...prev, error: 'A governance note is required.' }));
      return;
    }

    const assignmentId = assignmentAction.assignment?.id;
    if (!assignmentId || !assignmentAction.action) return;

    setAssignmentAction((prev) => ({ ...prev, working: true, error: '' }));
    try {
      const response = await api.post(`/admin/agents/assignments/${assignmentId}/${assignmentAction.action}`, {
        reason: note,
      });
      
      if (response.data?.success) {
        toast.success(response.data.message || 'Assignment updated');
        setAssignmentAction({
          open: false,
          action: '',
          assignment: null,
          note: '',
          error: '',
          working: false,
        });
        await loadAssignments();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update assignment');
      setAssignmentAction((prev) => ({ ...prev, working: false }));
    }
  };

  const getStatusBadge = (status) => {
    const configs = {
      active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
      inactive: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Inactive' },
      revoked: { bg: 'bg-red-100', text: 'text-red-700', label: 'Revoked' },
    };
    const config = configs[status] || configs.inactive;
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Agent Assignments</h1>
            <p className="mt-2 text-sm text-white/85">
              Manage landlord-agent relationships and permissions
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-primary"
          >
            + New Assignment
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        {['active', 'inactive', 'revoked'].map((status) => (
          <button
            key={status}
            onClick={() => setFilters({ ...filters, status })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filters.status === status
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Assignments List */}
      {assignments.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          <p>No assignments found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-purple-100 p-3">
                      <FaUser className="text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{assignment.agent_name}</h3>
                      <p className="text-sm text-gray-600">{assignment.agent_email}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-600">Landlord</p>
                      <p className="mt-1 font-medium text-gray-900">{assignment.landlord_name}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-600">Status</p>
                      <div className="mt-1">{getStatusBadge(assignment.status)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-600">Assigned</p>
                      <p className="mt-1 text-sm text-gray-900">
                        {new Date(assignment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-600">Permissions</p>
                      <div className="mt-1 flex gap-1">
                        {assignment.can_manage_properties && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Props</span>}
                        {assignment.can_manage_damage_reports && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Damage</span>}
                        {assignment.can_manage_disputes && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Disputes</span>}
                        {assignment.can_manage_legal && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Legal</span>}
                        {assignment.can_manage_finances && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Finance</span>}
                      </div>
                    </div>
                  </div>

                  {assignment.latest_operation && (
                    <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                          {formatOperation(assignment.latest_operation.event_type)}
                        </p>
                        <p className="text-xs text-indigo-500">
                          {assignment.latest_operation.created_at
                            ? new Date(assignment.latest_operation.created_at).toLocaleString()
                            : 'N/A'}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-indigo-900">
                        {assignment.latest_operation.note || 'No note recorded'}
                      </p>
                      <p className="mt-1 text-xs text-indigo-600">
                        By {assignment.latest_operation.actor_name || 'System'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {assignment.status === 'active' ? (
                    <>
                      <button
                        onClick={() => openAssignmentAction('deactivate', assignment)}
                        className="btn btn-sm btn-outline"
                      >
                        Deactivate
                      </button>
                      <button
                        onClick={() => openAssignmentAction('revoke', assignment)}
                        className="btn btn-sm btn-danger"
                      >
                        Revoke
                      </button>
                    </>
                  ) : assignment.status === 'inactive' ? (
                    <button
                      onClick={() => openAssignmentAction('reactivate', assignment)}
                      className="btn btn-sm btn-primary"
                    >
                      Reactivate
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-gray-900">New Agent Assignment</h2>

            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">Landlord ID</label>
                <input
                  type="number"
                  value={formData.landlordId}
                  onChange={(e) => setFormData({ ...formData, landlordId: e.target.value })}
                  placeholder="Enter landlord user ID"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900">Agent ID</label>
                <input
                  type="number"
                  value={formData.agentId}
                  onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                  placeholder="Enter agent user ID"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2"
                  required
                />
              </div>

              <div className="space-y-3 rounded-lg bg-gray-50 p-4">
                <h3 className="font-medium text-gray-900">Permissions</h3>
                
                {Object.entries(formData.permissions).map(([key, value]) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          permissions: { ...formData.permissions, [key]: e.target.checked },
                        })
                      }
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-outline flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignmentAction.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <form onSubmit={submitAssignmentAction} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900">
              {formatOperation(`assignment_${assignmentAction.action}d`)}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Add the reason for this agent assignment decision.
            </p>
            <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
              <p><span className="font-medium">Agent:</span> {assignmentAction.assignment?.agent_name || 'N/A'}</p>
              <p><span className="font-medium">Landlord:</span> {assignmentAction.assignment?.landlord_name || 'N/A'}</p>
            </div>
            <label className="mt-5 block text-sm font-medium text-gray-700">Governance Note</label>
            <textarea
              value={assignmentAction.note}
              onChange={(e) => setAssignmentAction((prev) => ({ ...prev, note: e.target.value, error: '' }))}
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Explain why this assignment is being changed..."
            />
            {assignmentAction.error && (
              <p className="mt-2 text-sm text-red-600">{assignmentAction.error}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeAssignmentAction}
                disabled={assignmentAction.working}
                className="btn btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={assignmentAction.working}
                className="btn btn-primary flex-1"
              >
                {assignmentAction.working ? 'Saving...' : 'Save Action'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const formatOperation = (eventType) =>
  String(eventType || 'assignment_action')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export default AdminAgentManagement;

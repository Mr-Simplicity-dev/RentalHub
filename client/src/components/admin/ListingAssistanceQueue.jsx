import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';

export default function ListingAssistanceQueue() {
  const [requests, setRequests] = useState([]);
  const [selection, setSelection] = useState({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/listing-assistance/staff/requests');
      setRequests(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load listing-assistance requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const assign = async (request) => {
    const agentId = Number(selection[request.id]);
    if (!agentId) return;
    setWorkingId(request.id);
    try {
      await api.post(`/listing-assistance/staff/requests/${request.id}/assign`, { agentId });
      toast.success('Platform agent assigned. The landlord service is free.');
      await loadRequests();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to assign platform agent');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <section aria-labelledby="listing-assistance-heading" className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
      <div>
        <h2 id="listing-assistance-heading" className="text-xl font-semibold text-gray-900">Free listing-assistance requests</h2>
        <p className="mt-1 text-sm text-gray-600">
          Assign an eligible platform agent in the requested state and LGA. Assignment grants property-management access only; finance and other permissions remain off.
        </p>
      </div>
      {loading ? <p className="text-sm text-gray-600">Loading requests…</p> : null}
      {!loading && requests.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-gray-600">No requests are waiting for assignment.</p>
      ) : null}
      {requests.map((request) => (
        <article key={request.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">{request.landlord_name || 'Landlord'} · {request.lga_name}, {request.state_name}</h3>
              <p className="mt-1 text-sm text-gray-600">{request.property_title || 'No specific property selected'}</p>
              <p className="mt-1 text-xs text-gray-500">Requested {new Date(request.created_at).toLocaleDateString()}</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Awaiting assignment</span>
          </div>
          {request.eligible_agents?.length ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="flex-1 text-sm font-medium text-gray-700">
                Eligible platform agent
                <select
                  aria-label={`Eligible agent for request ${request.id}`}
                  value={selection[request.id] || ''}
                  onChange={(event) => setSelection((current) => ({ ...current, [request.id]: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="">Select an agent</option>
                  {request.eligible_agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.full_name} · {agent.assigned_lga || 'State-wide'}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!selection[request.id] || workingId === request.id}
                onClick={() => assign(request)}
                className="btn btn-primary self-end"
              >
                {workingId === request.id ? 'Assigning…' : 'Assign agent'}
              </button>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              No available platform agent currently matches this state and LGA. The request remains pending.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

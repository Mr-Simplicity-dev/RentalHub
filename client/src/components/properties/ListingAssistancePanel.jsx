import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { propertyService } from '../../services/propertyService';

const ListingAssistancePanel = ({
  initialStateId = '',
  initialLgaName = '',
  properties = [],
  showPropertyPicker = false,
}) => {
  const [locationOptions, setLocationOptions] = useState([]);
  const [status, setStatus] = useState({ assignments: [], requests: [] });
  const [stateId, setStateId] = useState(String(initialStateId || ''));
  const [lgaName, setLgaName] = useState(initialLgaName || '');
  const [propertyId, setPropertyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialStateId) setStateId(String(initialStateId));
    if (initialLgaName) setLgaName(initialLgaName);
  }, [initialStateId, initialLgaName]);

  useEffect(() => {
    let active = true;
    Promise.all([
      propertyService.getLocationOptions(),
      api.get('/listing-assistance/requests/mine'),
    ]).then(([locationsResponse, statusResponse]) => {
      if (!active) return;
      if (!locationsResponse?.success || !Array.isArray(locationsResponse.data)) {
        throw new Error('Could not load canonical property locations.');
      }
      setLocationOptions(locationsResponse.data);
      setStatus(statusResponse.data?.data || { assignments: [], requests: [] });
      setError('');
    }).catch((loadError) => {
      if (!active) return;
      setError(loadError.response?.data?.message || loadError.message || 'Could not load listing-assistance status.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const selectedState = useMemo(
    () => locationOptions.find((option) => String(option.id) === String(stateId)),
    [locationOptions, stateId]
  );
  const lgas = selectedState?.lgas || [];
  const pendingRequest = status.requests.find((request) =>
    request.status === 'awaiting_assignment' &&
    String(request.state_id) === String(stateId) &&
    request.lga_name.toLowerCase() === lgaName.toLowerCase() &&
    String(request.property_id || '') === propertyId
  );

  const handlePropertyChange = (nextPropertyId) => {
    setPropertyId(nextPropertyId);
    const property = properties.find((item) => String(item.id) === nextPropertyId);
    if (!property) return;
    setStateId(String(property.state_id || ''));
    setLgaName(property.lga_name || '');
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    if (!stateId || !lgaName) {
      setError('Choose a State and LGA before requesting assistance.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await api.post('/listing-assistance/requests', {
        stateId: Number(stateId),
        lgaName,
        ...(propertyId ? { propertyId: Number(propertyId) } : {}),
      });
      const savedRequest = response.data?.data?.request;
      if (savedRequest) {
        setStatus((current) => ({
          ...current,
          requests: [
            savedRequest,
            ...current.requests.filter((request) => request.id !== savedRequest.id),
          ],
        }));
      }
      toast.success(response.data?.message || 'Your free request is waiting for assignment.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not submit the request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-5" aria-labelledby="listing-assistance-title">
      <div>
        <h2 id="listing-assistance-title" className="text-lg font-semibold text-sky-950">
          Request RentalHub listing assistance
        </h2>
        <p className="mt-1 text-sm text-sky-800">
          This service is free. We match your selected State and LGA to an available property agent; no payment is requested.
        </p>
      </div>

      {status.assignments.length ? (
        <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm text-emerald-900">
          <p className="font-semibold">You already have an assigned property agent.</p>
          <p className="mt-1">
            {status.assignments.map((assignment) => assignment.agent_name).filter(Boolean).join(', ')}
            {' '}can help manage your properties.
          </p>
        </div>
      ) : null}

      {status.requests.map((request) => (
        <div key={request.id} className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
          <p className="font-medium">{request.property_title || 'Listing assistance'} · {request.lga_name}, {request.state_name}</p>
          <p className="mt-1 text-gray-600">
            {request.status === 'awaiting_assignment' ? 'Saved and awaiting agent assignment.' : 'Agent assigned.'}
          </p>
        </div>
      ))}

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitRequest}>
        {showPropertyPicker && properties.length ? (
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            Property (optional)
            <select
              value={propertyId}
              onChange={(event) => handlePropertyChange(event.target.value)}
              className="input mt-1"
            >
              <option value="">Request help with a new listing</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>{property.title || `Property ${property.id}`}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm font-medium text-gray-700">
          State
          <select
            value={stateId}
            onChange={(event) => {
              setStateId(event.target.value);
              setLgaName('');
              setPropertyId('');
            }}
            className="input mt-1"
            disabled={loading || Boolean(status.assignments.length)}
          >
            <option value="">Select State</option>
            {locationOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.state_name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          LGA
          <select
            value={lgaName}
            onChange={(event) => {
              setLgaName(event.target.value);
              setPropertyId('');
            }}
            className="input mt-1"
            disabled={!stateId || Boolean(status.assignments.length)}
          >
            <option value="">Select LGA</option>
            {lgas.map((lga) => <option key={lga} value={lga}>{lga}</option>)}
          </select>
        </label>
        {error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
        {pendingRequest ? (
          <p className="text-sm text-amber-800 sm:col-span-2">A matching request is already saved and awaiting assignment.</p>
        ) : null}
        <button
          type="submit"
          disabled={loading || submitting || Boolean(status.assignments.length) || Boolean(pendingRequest)}
          className="btn btn-primary sm:col-span-2 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Request free listing assistance'}
        </button>
      </form>
    </section>
  );
};

export default ListingAssistancePanel;

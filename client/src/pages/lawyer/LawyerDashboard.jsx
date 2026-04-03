import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import LawyerVerification from './LawyerVerification';

const LawyerDashboardContent = () => {
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [programLoading, setProgramLoading] = useState(true);
  const [applyLoading, setApplyLoading] = useState(false);
  const [programData, setProgramData] = useState({
    broadcast: null,
    application: null,
  });

  const loadAuthorizedProperties = async () => {
    try {
      const res = await api.get('/legal/properties');
      setProperties(res.data.data || []);
    } catch (err) {
      console.error('Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  const loadDisputes = async (propertyId) => {
    try {
      const res = await api.get(`/legal/property/${propertyId}/disputes`);
      setDisputes(res.data.data || []);
    } catch (err) {
      console.error('Failed to load disputes');
    }
  };

  const loadPlatformLawyerProgram = async () => {
    try {
      const res = await api.get('/legal/platform-lawyer-program');
      setProgramData({
        broadcast: res.data?.data?.broadcast || null,
        application: res.data?.data?.application || null,
      });
    } catch (err) {
      console.error('Failed to load platform lawyer program');
    } finally {
      setProgramLoading(false);
    }
  };

  useEffect(() => {
    loadAuthorizedProperties();
    loadPlatformLawyerProgram();
     loadLawyerProfile();
  }, []);

  const applyToProgram = async () => {
    setApplyLoading(true);
    try {
      const res = await api.post('/legal/platform-lawyer-program/apply');
      toast.success(res.data?.message || 'Application submitted');
      await loadPlatformLawyerProgram();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit application');
    } finally {
      setApplyLoading(false);
    }
  };

  if (loading || profileLoading) {
  return <div className="p-6">Loading lawyer dashboard...</div>;
}

if (loading || profileLoading) {
  return <div className="p-6">Loading lawyer dashboard...</div>;
}

return (
  <div className="p-6 space-y-6">

    {/* 🔥 HEADER */}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">Lawyer Dashboard</h1>
      <Link
        to="/verify-case"
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
      >
        Verify Case Evidence
      </Link>
    </div>

    {/* ✅ LAWYER PROFILE CARD (INSERTED HERE) */}
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-blue-600">
              {lawyerProfile?.full_name?.charAt(0) || 'L'}
            </span>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {lawyerProfile?.full_name || 'Lawyer Name'}
            </h2>

            <div className="flex flex-wrap gap-3 mt-2">
              
              <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                {lawyerProfile?.email || 'lawyer@example.com'}
              </span>

              <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {lawyerProfile?.phone || '+234...'}
              </span>

              <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16z" clipRule="evenodd" />
                </svg>
                {lawyerProfile?.nationality || 'Nigeria'}
              </span>
            </div>

            {lawyerProfile?.chamber_name && (
              <p className="mt-2 text-sm text-gray-700">
                <span className="font-semibold">Chamber:</span> {lawyerProfile.chamber_name}
                {lawyerProfile?.chamber_phone && ` • ${lawyerProfile.chamber_phone}`}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            to="/verify-case"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Verify Case Evidence
          </Link>

          <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Edit Profile
          </button>
        </div>
      </div>
    </div>

    {/* ✅ EXISTING PROGRAM CARD (UNCHANGED) */}
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">
            RentalHub NG Lawyer Program
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Apply when the super admin opens recruitment for lawyers who will be displayed on the public RentalHub NG lawyers page.
          </p>
        </div>

        {programData.application?.status === 'approved' ? (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
            Approved
          </span>
        ) : programData.application?.status === 'pending' ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            Pending Review
          </span>
        ) : programData.application?.status === 'rejected' ? (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
            Rejected
          </span>
        ) : null}
      </div>

      {programLoading ? (
        <p className="mt-4 text-sm text-gray-500">
          Loading lawyer program details...
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {programData.broadcast ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">{programData.broadcast.title}</p>
              <p className="mt-2 whitespace-pre-line">{programData.broadcast.message}</p>
              <p className="mt-3 text-xs text-blue-700">
                Sent {new Date(programData.broadcast.created_at).toLocaleString()}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              No active platform-lawyer recruitment broadcast is available right now.
            </div>
          )}

          {programData.application && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">
                Application status: {programData.application.status}
              </p>
              <p className="mt-1 text-gray-500">
                Applied on {new Date(programData.application.applied_at).toLocaleString()}
              </p>
              {programData.application.review_note && (
                <p className="mt-2 text-sm text-gray-700">
                  Review note: {programData.application.review_note}
                </p>
              )}
            </div>
          )}

          <button
            onClick={applyToProgram}
            disabled={applyLoading}
            className="rounded-lg bg-primary-600 px-4 py-2 text-white"
          >
            Apply To Serve
          </button>
        </div>
      )}
    </div>

    {/* 🔽 KEEP THE REST OF YOUR CODE (properties + disputes) EXACTLY AS IS */}
  </div>
);

const LawyerDashboardContent = () => {

  if (loading || profileLoading) {
    return <div className="p-6">Loading lawyer dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">

      {/* 🔥 HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Lawyer Dashboard</h1>
        <Link
          to="/verify-case"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          Verify Case Evidence
        </Link>
      </div>

      {/* ✅ LAWYER PROFILE CARD */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-blue-600">
                {lawyerProfile?.full_name?.charAt(0) || 'L'}
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {lawyerProfile?.full_name || 'Lawyer Name'}
              </h2>

              <div className="flex flex-wrap gap-3 mt-2">

                <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  {lawyerProfile?.email || 'lawyer@example.com'}
                </span>

                <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  {lawyerProfile?.phone || '+234...'}
                </span>

                <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16z" clipRule="evenodd" />
                  </svg>
                  {lawyerProfile?.nationality || 'Nigeria'}
                </span>
              </div>

              {lawyerProfile?.chamber_name && (
                <p className="mt-2 text-sm text-gray-700">
                  <span className="font-semibold">Chamber:</span> {lawyerProfile.chamber_name}
                  {lawyerProfile?.chamber_phone && ` • ${lawyerProfile.chamber_phone}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to="/verify-case"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Verify Case Evidence
            </Link>

            <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* ✅ PROGRAM CARD */}
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">
              RentalHub NG Lawyer Program
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Apply when the super admin opens recruitment for lawyers who will be displayed on the public RentalHub NG lawyers page.
            </p>
          </div>

          {programData.application?.status === 'approved' ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              Approved
            </span>
          ) : programData.application?.status === 'pending' ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Pending Review
            </span>
          ) : programData.application?.status === 'rejected' ? (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              Rejected
            </span>
          ) : null}
        </div>

        {programLoading ? (
          <p className="mt-4 text-sm text-gray-500">
            Loading lawyer program details...
          </p>
        ) : (
          <div className="mt-4 space-y-4">

            {programData.broadcast ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">{programData.broadcast.title}</p>
                <p className="mt-2 whitespace-pre-line">{programData.broadcast.message}</p>
                <p className="mt-3 text-xs text-blue-700">
                  Sent {new Date(programData.broadcast.created_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                No active platform-lawyer recruitment broadcast is available right now.
              </div>
            )}

            {programData.application && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">
                  Application status: {programData.application.status}
                </p>
                <p className="mt-1 text-gray-500">
                  Applied on {new Date(programData.application.applied_at).toLocaleString()}
                </p>
                {programData.application.review_note && (
                  <p className="mt-2 text-sm text-gray-700">
                    Review note: {programData.application.review_note}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={applyToProgram}
              disabled={applyLoading}
              className="rounded-lg bg-primary-600 px-4 py-2 text-white"
            >
              Apply To Serve
            </button>
          </div>
        )}
      </div>

      {/* ✅ KEEP YOUR EXISTING LOGIC BELOW (UNCHANGED) */}

      {/* Authorized Properties */}
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Authorized Properties</h2>

        {properties.length === 0 ? (
          <p className="text-gray-500">No authorized properties.</p>
        ) : (
          <div className="space-y-2">
            {properties.map((property) => (
              <button
                key={property.id}
                onClick={() => {
                  setSelectedProperty(property);
                  loadDisputes(property.id);
                }}
                className={`w-full text-left border p-3 rounded ${
                  selectedProperty?.id === property.id
                    ? 'bg-blue-50 border-blue-400'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="font-medium text-gray-900">{property.title}</div>
                <div className="mt-1 text-xs text-gray-500">
                  Assigned by {property.assigned_by_name || property.client_name || 'Unknown'}
                  {property.client_name ? ` for ${property.client_name}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Disputes */}
      {selectedProperty && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">
            Disputes for {selectedProperty.title}
          </h2>

          {disputes.length === 0 ? (
            <p className="text-gray-500">No disputes found.</p>
          ) : (
            <div className="space-y-3">
              {disputes.map((d) => (
                <div key={d.id} className="border rounded p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Dispute #{d.id}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      d.status === 'resolved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {d.status}
                    </span>
                  </div>

                  <p className="text-sm">{d.description}</p>

                  <div className="text-xs text-gray-500">
                    Escalated: {d.escalated ? 'Yes' : 'No'}
                  </div>

                  <div className="flex gap-3 mt-2">
                    <a href={`/api/export/dispute/${d.id}`} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                      Download PDF
                    </a>

                    <button
                      className="text-sm text-blue-600 hover:underline"
                      onClick={() => window.open(`/api/disputes/${d.id}/evidence`, '_blank')}
                    >
                      View Evidence
                    </button>

                    <Link to={`/verify-case?dispute=${d.id}`} className="text-sm text-primary-700 hover:underline">
                      Verify Integrity
                    </Link>

                    <Link to={`/dispute/${d.id}`} className="text-sm text-primary-700 hover:underline">
                      Trace Dispute
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Lawyer Dashboard</h1>
        <Link
          to="/verify-case"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          Verify Case Evidence
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">
              RentalHub NG Lawyer Program
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Apply when the super admin opens recruitment for lawyers who will be displayed on the public RentalHub NG lawyers page.
            </p>
          </div>

          {programData.application?.status === 'approved' ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              Approved
            </span>
          ) : programData.application?.status === 'pending' ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Pending Review
            </span>
          ) : programData.application?.status === 'rejected' ? (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              Rejected
            </span>
          ) : null}
        </div>

        {programLoading ? (
          <p className="mt-4 text-sm text-gray-500">
            Loading lawyer program details...
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {programData.broadcast ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">{programData.broadcast.title}</p>
                <p className="mt-2 whitespace-pre-line">{programData.broadcast.message}</p>
                <p className="mt-3 text-xs text-blue-700">
                  Sent {new Date(programData.broadcast.created_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                No active platform-lawyer recruitment broadcast is available right now.
              </div>
            )}

            {programData.application ? (
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">
                  Application status: {programData.application.status}
                </p>
                <p className="mt-1 text-gray-500">
                  Applied on {new Date(programData.application.applied_at).toLocaleString()}
                </p>
                {programData.application.review_note ? (
                  <p className="mt-2 text-sm text-gray-700">
                    Review note: {programData.application.review_note}
                  </p>
                ) : null}
                {programData.application.status === 'approved' ? (
                  <p className="mt-2 text-sm text-green-700">
                    You are approved and can be managed from the super admin public lawyer directory.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={applyToProgram}
                disabled={
                  applyLoading ||
                  !programData.broadcast ||
                  programData.application?.status === 'pending' ||
                  programData.application?.status === 'approved'
                }
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {programData.application?.status === 'approved'
                  ? 'Already Approved'
                  : programData.application?.status === 'pending'
                    ? 'Application Pending'
                    : applyLoading
                      ? 'Submitting...'
                      : 'Apply To Serve On RentalHub NG'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Authorized Properties */}
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Authorized Properties</h2>

        {properties.length === 0 ? (
          <p className="text-gray-500">No authorized properties.</p>
        ) : (
          <div className="space-y-2">
            {properties.map((property) => (
              <button
                key={property.id}
                onClick={() => {
                  setSelectedProperty(property);
                  loadDisputes(property.id);
                }}
                className={`w-full text-left border p-3 rounded ${
                  selectedProperty?.id === property.id
                    ? 'bg-blue-50 border-blue-400'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="font-medium text-gray-900">{property.title}</div>
                <div className="mt-1 text-xs text-gray-500">
                  Assigned by {property.assigned_by_name || property.client_name || 'Unknown'}
                  {property.client_name ? ` for ${property.client_name}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Disputes */}
      {selectedProperty && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">
            Disputes for {selectedProperty.title}
          </h2>

          {disputes.length === 0 ? (
            <p className="text-gray-500">No disputes found.</p>
          ) : (
            <div className="space-y-3">
              {disputes.map((d) => (
                <div
                  key={d.id}
                  className="border rounded p-3 space-y-2"
                >
                  <div className="flex justify-between">
                    <span className="font-medium">
                      Dispute #{d.id}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        d.status === 'resolved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>

                  <p className="text-sm">{d.description}</p>

                  <div className="text-xs text-gray-500">
                    Escalated: {d.escalated ? 'Yes' : 'No'}
                  </div>

                  <div className="flex gap-3 mt-2">
                    <a
                      href={`/api/export/dispute/${d.id}`}
                      className="text-sm text-blue-600 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download PDF
                    </a>

                    <button
                      className="text-sm text-blue-600 hover:underline"
                      onClick={() =>
                        window.open(
                          `/api/disputes/${d.id}/evidence`,
                          '_blank'
                        )
                      }
                    >
                      View Evidence
                    </button>

                    <Link
                      to={`/verify-case?dispute=${d.id}`}
                      className="text-sm text-primary-700 hover:underline"
                    >
                      Verify Integrity
                    </Link>

                    <Link
                      to={`/dispute/${d.id}`}
                      className="text-sm text-primary-700 hover:underline"
                    >
                      Trace Dispute
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Wrap with verification gate
const LawyerDashboard = () => (
  <LawyerVerification>
    <LawyerDashboardContent />
  </LawyerVerification>
);

export default LawyerDashboard;

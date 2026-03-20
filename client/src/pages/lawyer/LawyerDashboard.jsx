import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

const LawyerDashboard = () => {
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadAuthorizedProperties();
  }, []);

  if (loading) {
    return <div className="p-6">Loading lawyer dashboard...</div>;
  }

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

export default LawyerDashboard;

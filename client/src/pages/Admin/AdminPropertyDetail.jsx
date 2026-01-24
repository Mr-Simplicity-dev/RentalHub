import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Loader from '../../components/common/Loader';

const AdminPropertyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    loadProperty();
  }, [id]);

  const loadProperty = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/properties/${id}`);
      if (res.data?.success) setProperty(res.data.data);
    } finally {
      setLoading(false);
    }
  };

  const unlist = async () => {
    if (!window.confirm('Unlist this property?')) return;
    setWorking(true);
    try {
      await api.patch(`/super/properties/${id}/unlist`);
      loadProperty();
    } finally {
      setWorking(false);
    }
  };

  const relist = async () => {
    if (!window.confirm('Relist this property?')) return;
    setWorking(true);
    try {
      await api.patch(`/super/properties/${id}/relist`);
      loadProperty();
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Loader fullScreen />;
  if (!property) return <div className="card">Property not found</div>;

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-600 mb-4 hover:underline"
      >
        ← Back
      </button>

      <div className="card space-y-4">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold">{property.title}</h2>

          <div className="flex gap-2">
            {property.status === 'available' ? (
              <button
                onClick={unlist}
                disabled={working}
                className="btn btn-sm btn-danger"
              >
                Unlist
              </button>
            ) : (
              <button
                onClick={relist}
                disabled={working}
                className="btn btn-sm"
              >
                Relist
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><strong>Owner:</strong> {property.landlord_name}</div>
          <div><strong>Email:</strong> {property.landlord_email}</div>
          <div><strong>Status:</strong> {property.status}</div>
          <div><strong>City:</strong> {property.city}</div>
          <div><strong>State:</strong> {property.state}</div>
          <div><strong>Rent:</strong> ₦{Number(property.rent_amount || 0).toLocaleString()}</div>
          <div><strong>Created:</strong> {new Date(property.created_at).toLocaleString()}</div>
        </div>

        {property.description && (
          <div className="text-sm">
            <strong>Description</strong>
            <p className="text-gray-700 mt-1">{property.description}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPropertyDetail;

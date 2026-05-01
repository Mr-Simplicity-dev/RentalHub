import React, { useEffect, useState } from 'react';
import { propertyService } from '../services/propertyService';
import PropertyList from '../components/properties/PropertyList';
import Loader from '../components/common/Loader';
import { toast } from 'react-toastify';
import BackToDashboard from '../components/common/BackToDashboard';

const SavedProperties = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSaved();
  }, []);

  const loadSaved = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getSavedProperties();
      if (res.success) {
        setProperties(res.data);
      }
    } catch (err) {
      toast.error('Failed to load saved properties');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Saved Properties</h1>
        <BackToDashboard />
      </div>

      <PropertyList
        properties={properties}
        loading={false}
        onSave={loadSaved}
        savedPropertyIds={properties.map((p) => p.id)}
        showApplyButton
        applyLinkBuilder={(property) => `/properties/${property.id}?apply=1`}
      />

      {properties.length === 0 && (
        <div className="card text-center py-10 text-gray-500">
          You haven’t saved any properties yet
        </div>
      )}
    </div>
    
  );
};

export default SavedProperties;


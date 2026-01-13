import React, { useEffect, useState } from 'react';
import { propertyService } from '../services/propertyService';
import PropertyList from '../components/properties/PropertyList';
import Loader from '../components/common/Loader';
import { toast } from 'react-toastify';

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
      <h1 className="text-2xl font-bold mb-6">Saved Properties</h1>

      <PropertyList
        properties={properties}
        loading={false}
        onSave={loadSaved}
        savedPropertyIds={properties.map((p) => p.id)}
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

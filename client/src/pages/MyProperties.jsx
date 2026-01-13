import React, { useEffect, useState } from 'react';
import { propertyService } from '../services/propertyService';
import Loader from '../components/common/Loader';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

const MyProperties = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getMyProperties();
      if (res.success) setItems(res.data);
    } catch {
      toast.error('Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Properties</h1>
        <Link to="/add-property" className="btn btn-primary">Add Property</Link>
      </div>

      <div className="space-y-4">
        {items.map(p => (
          <div key={p.id} className="card flex justify-between items-center">
            <div>
              <div className="font-semibold">{p.title}</div>
              <div className="text-sm text-gray-600">{p.city}, {p.state_name}</div>
            </div>
            <span className="text-sm capitalize">{p.status}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="card text-center py-10 text-gray-500">
            You have not listed any properties yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default MyProperties;

import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const Subscribe = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user?.subscription_active) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">You are already subscribed</h1>
        <button onClick={() => navigate('/properties')} className="btn btn-primary">
          Browse Properties
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 text-center">
        Unlock Full Property Access
      </h1>

      <div className="card text-center">
        <h2 className="text-xl font-semibold mb-2">Premium Tenant Plan</h2>
        <p className="text-gray-600 mb-4">
          View landlord contacts, full addresses, and apply without limits.
        </p>

        <div className="text-4xl font-bold text-primary-600 mb-6">
          ₦2,000 / month
        </div>

        <button className="btn btn-primary w-full py-3 text-lg">
          Subscribe Now
        </button>

        <p className="text-xs text-gray-500 mt-4">
          Payments will be enabled soon.
        </p>
      </div>
    </div>
  );
};

export default Subscribe;

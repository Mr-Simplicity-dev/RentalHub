import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSprayCan, FaBroom, FaShieldAlt } from 'react-icons/fa';

const FumigationCleaningDashboardButton = ({ userType, propertyId, propertyTitle }) => {
  const navigate = useNavigate();

  // Only show for tenants
  if (userType !== 'tenant') {
    return null;
  }

  const handleClick = () => {
    if (propertyId) {
      navigate(`/fumigation-cleaning/booking?propertyId=${propertyId}`);
    } else {
      // If no specific property, show catalog or let user select property
      navigate('/fumigation-cleaning/catalog');
    }
  };

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mb-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center">
          <div className="mr-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-green-500 to-blue-500">
            <FaSprayCan className="text-white text-xl" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900">Fumigation & Cleaning Services</h3>
            <p className="text-sm text-gray-600">
              Professional pest control and cleaning for your property
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs text-gray-500 mb-1">Available for</div>
          <div className="font-semibold text-green-600">Tenants Only</div>
        </div>
      </div>
      
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="bg-white border border-gray-200 rounded p-2 text-center">
          <FaSprayCan className="text-red-500 mx-auto mb-1" />
          <div className="text-xs font-medium">Fumigation</div>
          <div className="text-xs text-gray-500">Pest Control</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-center">
          <FaBroom className="text-blue-500 mx-auto mb-1" />
          <div className="text-xs font-medium">Cleaning</div>
          <div className="text-xs text-gray-500">Regular Clean</div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-center">
          <FaShieldAlt className="text-green-500 mx-auto mb-1" />
          <div className="text-xs font-medium">Deep Clean</div>
          <div className="text-xs text-gray-500">Sanitization</div>
        </div>
      </div>
      
      <div className="space-y-3">
        <button
          onClick={handleClick}
          className="btn btn-primary w-full py-2"
        >
          <FaSprayCan className="inline mr-2" />
          Book Fumigation/Cleaning
        </button>
        
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => navigate('/fumigation-cleaning/catalog')}
            className="btn btn-outline w-full py-2 text-sm sm:flex-1"
          >
            View Services
          </button>
          <button
            onClick={() => navigate('/fumigation-cleaning/bookings')}
            className="btn btn-outline w-full py-2 text-sm sm:flex-1"
          >
            My Bookings
          </button>
        </div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="flex flex-col gap-2 text-xs text-gray-600 sm:flex-row sm:items-center">
          <div className="sm:flex-1">
            <span className="font-medium">Benefits:</span>
            <span className="ml-1">Certified teams • Safe chemicals • Guaranteed results</span>
          </div>
          <div className="font-medium text-green-600">
            From ₦15,000
          </div>
        </div>
      </div>
    </div>
  );
};

export default FumigationCleaningDashboardButton;

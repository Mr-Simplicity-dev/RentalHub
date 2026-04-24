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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center mr-3">
            <FaSprayCan className="text-white text-xl" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Fumigation & Cleaning Services</h3>
            <p className="text-sm text-gray-600">
              Professional pest control and cleaning for your property
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">Available for</div>
          <div className="font-semibold text-green-600">Tenants Only</div>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 mb-4">
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
        
        <div className="flex space-x-2">
          <button
            onClick={() => navigate('/fumigation-cleaning/catalog')}
            className="btn btn-outline flex-1 py-2 text-sm"
          >
            View Services
          </button>
          <button
            onClick={() => navigate('/fumigation-cleaning/bookings')}
            className="btn btn-outline flex-1 py-2 text-sm"
          >
            My Bookings
          </button>
        </div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="flex items-center text-xs text-gray-600">
          <div className="flex-1">
            <span className="font-medium">Benefits:</span>
            <span className="ml-1">Certified teams • Safe chemicals • Guaranteed results</span>
          </div>
          <div className="text-green-600 font-medium">
            From ₦15,000
          </div>
        </div>
      </div>
    </div>
  );
};

export default FumigationCleaningDashboardButton;
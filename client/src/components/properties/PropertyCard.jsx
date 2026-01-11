import React from 'react';
import { Link } from 'react-router-dom';
import { FaBed, FaBath, FaMapMarkerAlt, FaHeart, FaRegHeart, FaStar } from 'react-icons/fa';
import { formatCurrency } from '../../utils/helpers';

const PropertyCard = ({ property, onSave, isSaved = false, showSaveButton = true }) => {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {/* Image */}
      <div className="relative h-48">
        <img 
          src={property.primary_photo || '/placeholder-property.jpg'} 
          alt={property.title} 
          className="w-full h-full object-cover rounded-t-lg" 
        />
        {property.featured && (
          <span className="absolute top-2 left-2 bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
            Featured
          </span>
        )}
        {showSaveButton && (
          <button
            onClick={() => onSave && onSave(property.id)}
            className="absolute top-2 right-2 bg-white p-2 rounded-full shadow-md hover:bg-gray-100 transition-colors"
          >
            {isSaved ? (
              <FaHeart className="text-red-500" />
            ) : (
              <FaRegHeart className="text-gray-600" />
            )}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <Link to={`/properties/${property.id}`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-primary-600 transition-colors">
            {property.title}
          </h3>
        </Link>

        <div className="flex items-center text-gray-600 text-sm mb-3">
          <FaMapMarkerAlt className="mr-1" />
          <span>{property.area}, {property.city}, {property.state_name}</span>
        </div>

        {/* Features */}
        <div className="flex items-center space-x-4 text-gray-600 text-sm mb-3">
          <div className="flex items-center">
            <FaBed className="mr-1" />
            <span>{property.bedrooms} Bed{property.bedrooms > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center">
            <FaBath className="mr-1" />
            <span>{property.bathrooms} Bath{property.bathrooms > 1 ? 's' : ''}</span>
          </div>
          {property.avg_rating && (
            <div className="flex items-center">
              <FaStar className="text-yellow-500 mr-1" />
              <span>{parseFloat(property.avg_rating).toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Price */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div>
            <div className="text-2xl font-bold text-primary-600">
              {formatCurrency(property.rent_amount)}
            </div>
            <div className="text-xs text-gray-500">
              per {property.payment_frequency === 'yearly' ? 'year' : 'month'}
            </div>
          </div>
          <Link
            to={`/properties/${property.id}`}
            className="btn btn-primary text-sm"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;
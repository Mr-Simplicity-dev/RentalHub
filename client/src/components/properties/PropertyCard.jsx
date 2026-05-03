import React from 'react';
import { Link } from 'react-router-dom';
import { FaBed, FaBath, FaMapMarkerAlt, FaHeart, FaRegHeart, FaStar } from 'react-icons/fa';
import { formatCurrency } from '../../utils/helpers';
import PropertyShareButton from './PropertyShareButton';

// const PropertyCard = ({
//   property,
//   onSave,
//   isSaved = false,
//   showSaveButton = true,
//   showApplyButton = false,
//   applyLink,
// }) => {
//   const detailLink = `/properties/${property.id}`;
//   const resolvedApplyLink = applyLink || `${detailLink}?apply=1`;

//   return (
//     <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
//       {/* Image */}
//       <div className="relative h-48">
//         <img 
//           src={property.primary_photo || '/placeholder-property.jpg'} 
//           alt={property.title} 
//           className="w-full h-full object-cover rounded-t-lg" 
//         />
//         {property.featured && (
//           <span className="absolute top-2 left-2 bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
//             Featured
//           </span>
//         )}
//         {showSaveButton && (
//           <div className="absolute top-2 right-2 flex items-center gap-2">
//             <PropertyShareButton property={property} detailLink={detailLink} />
//             <button
//               type="button"
//               onClick={() => onSave && onSave(property.id)}
//               className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100 transition-colors"
//               aria-label={isSaved ? 'Remove property from saved list' : 'Save property'}
//             >
//               {isSaved ? (
//                 <FaHeart className="text-red-500" />
//               ) : (
//                 <FaRegHeart className="text-gray-600" />
//               )}
//             </button>
//           </div>
//         )}
//         {!showSaveButton && (
//           <div className="absolute top-2 right-2">
//             <PropertyShareButton property={property} detailLink={detailLink} />
//           </div>
//         )}
//       </div>

//       {/* Content */}
//       <div className="p-4">
//         <Link to={`/properties/${property.id}`}>
//           <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-primary-600 transition-colors">
//             {property.title}
//           </h3>
//         </Link>

//         <div className="flex items-center text-gray-600 text-sm mb-3">
//           <FaMapMarkerAlt className="mr-1" />
//           <span>{property.area}, {property.city}, {property.state_name}</span>
//         </div>

//         {/* Features */}
//         <div className="flex items-center space-x-4 text-gray-600 text-sm mb-3">
//           <div className="flex items-center">
//             <FaBed className="mr-1" />
//             <span>{property.bedrooms} Bed{property.bedrooms > 1 ? 's' : ''}</span>
//           </div>
//           <div className="flex items-center">
//             <FaBath className="mr-1" />
//             <span>{property.bathrooms} Bath{property.bathrooms > 1 ? 's' : ''}</span>
//           </div>
//           {property.avg_rating && (
//             <div className="flex items-center">
//               <FaStar className="text-yellow-500 mr-1" />
//               <span>{parseFloat(property.avg_rating).toFixed(1)}</span>
//             </div>
//           )}
//         </div>

//         {/* Price */}
//         <div className="flex items-center justify-between pt-3 border-t">
//           <div>
//             <div className="text-2xl font-bold text-primary-600">
//               {formatCurrency(property.rent_amount)}
//             </div>
//             <div className="text-xs text-gray-500">
//               per {property.payment_frequency === 'yearly' ? 'year' : 'month'}
//             </div>
//           </div>
//           <div className="flex items-center gap-2">
//             {showApplyButton && (
//               <Link
//                 to={resolvedApplyLink}
//                 className="btn btn-primary text-sm"
//               >
//                 Apply Now
//               </Link>
//             )}
//             <Link
//               to={detailLink}
//               className={showApplyButton ? 'btn btn-secondary text-sm' : 'btn btn-primary text-sm'}
//             >
//               View Details
//             </Link>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };
// ... keep all imports the same ...

const PropertyCard = ({
  property,
  onSave,
  isSaved = false,
  showSaveButton = true,
  showApplyButton = false,
  applyLink,
}) => {
  const detailLink = `/properties/${property.id}`;
  const resolvedApplyLink = applyLink || `${detailLink}?apply=1`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:border-gray-200 transition-all duration-500 transform hover:-translate-y-1.5 group">
      {/* Image with hover zoom */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={property.primary_photo || '/placeholder-property.jpg'}
          alt={property.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {property.featured && (
          <span className="absolute top-3 left-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-md animate-float">
            Featured
          </span>
        )}
        {showSaveButton && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <PropertyShareButton property={property} detailLink={detailLink} />
            <button
              type="button"
              onClick={() => onSave && onSave(property.id)}
              className="bg-white/90 backdrop-blur-sm p-2.5 rounded-full shadow-md hover:bg-white transition-all duration-300 transform hover:scale-110 active:scale-95"
              aria-label={isSaved ? 'Remove property from saved list' : 'Save property'}
            >
              {isSaved ? (
                <FaHeart className="text-red-500 transition-transform duration-300 hover:scale-110" />
              ) : (
                <FaRegHeart className="text-gray-600 transition-transform duration-300 hover:scale-110" />
              )}
            </button>
          </div>
        )}
        {!showSaveButton && (
          <div className="absolute top-3 right-3">
            <PropertyShareButton property={property} detailLink={detailLink} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <Link to={`/properties/${property.id}`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-primary-600 transition-colors duration-300 line-clamp-1">
            {property.title}
          </h3>
        </Link>

        <div className="flex items-center text-gray-500 text-sm mb-3">
          <FaMapMarkerAlt className="mr-1.5 text-primary-500 flex-shrink-0" />
          <span className="truncate">{property.area}, {property.city}, {property.state_name}</span>
        </div>

        {/* Features */}
        <div className="flex items-center space-x-5 text-gray-500 text-sm mb-4">
          <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-lg">
            <FaBed className="text-primary-500" />
            <span className="font-medium">{property.bedrooms}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-lg">
            <FaBath className="text-primary-500" />
            <span className="font-medium">{property.bathrooms}</span>
          </div>
          {property.avg_rating && (
            <div className="flex items-center gap-1.5 bg-yellow-50 px-2.5 py-1 rounded-lg">
              <FaStar className="text-yellow-500" />
              <span className="font-medium">{parseFloat(property.avg_rating).toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Price */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div>
            <div className="text-2xl font-bold text-primary-600">
              {formatCurrency(property.rent_amount)}
            </div>
            <div className="text-xs text-gray-400 font-medium">
              per {property.payment_frequency === 'yearly' ? 'year' : 'month'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showApplyButton && (
              <Link
                to={resolvedApplyLink}
                className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
              >
                Apply Now
              </Link>
            )}
            <Link
              to={detailLink}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-300 transform hover:-translate-y-0.5 ${
                showApplyButton
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  : 'text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-md hover:shadow-lg'
              }`}
            >
              View Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;

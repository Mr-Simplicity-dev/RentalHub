import React from 'react';
import PropertyCard from './PropertyCard';
import Loader from '../common/Loader';

const PropertyList = ({ properties, loading, onSave, savedPropertyIds = [] }) => {
  if (loading) {
    return <Loader />;
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 text-lg">No properties found</p>
        <p className="text-gray-500 text-sm mt-2">Try adjusting your search filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          onSave={onSave}
          isSaved={savedPropertyIds.includes(property.id)}
        />
      ))}
    </div>
  );
};

export default PropertyList;
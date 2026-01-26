import React, { useCallback, useRef } from 'react';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '300px',
};

const defaultCenter = {
  lat: 9.0820,  // Nigeria center
  lng: 8.6753,
};

const MapPicker = ({ value, onChange }) => {
  const mapRef = useRef(null);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY,
  });

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const handleClick = (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    onChange({ lat, lng });
  };

  if (!isLoaded) return <div className="text-sm text-gray-500">Loading map…</div>;

  return (
    <div className="border rounded overflow-hidden">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={value || defaultCenter}
        zoom={value ? 14 : 6}
        onLoad={onMapLoad}
        onClick={handleClick}
      >
        {value && <Marker position={value} />}
      </GoogleMap>

      <div className="p-2 text-xs text-gray-600">
        Click on the map to set the property location.
      </div>
    </div>
  );
};

export default MapPicker;

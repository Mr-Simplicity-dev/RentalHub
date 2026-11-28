import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '300px',
};

const defaultCenter = {
  lat: 9.0820, // Nigeria center
  lng: 8.6753,
};

const MapPicker = ({ value, onChange }) => {
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [locationAccuracy, setLocationAccuracy] = useState(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY,
  });

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);
  const hasCoordinates = value &&
    String(value.lat ?? '').trim() !== '' &&
    String(value.lng ?? '').trim() !== '' &&
    Number.isFinite(Number(value.lat)) &&
    Number.isFinite(Number(value.lng));
  const mapValue = hasCoordinates
    ? { lat: Number(value.lat), lng: Number(value.lng) }
    : null;

  const handleClick = (e) => {
    if (!e?.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setLocationAccuracy(null);
    onChange({ lat, lng });
  };

  const handleMarkerDrag = (e) => {
    if (!e?.latLng) return;
    setLocationAccuracy(null);
    onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  const handleManualCoordinateChange = (axis, rawValue) => {
    const current = value || {};
    const nextValue = rawValue.trim() === '' ? '' : Number(rawValue);
    setLocationAccuracy(null);
    onChange({
      lat: axis === 'lat' ? nextValue : (current.lat ?? ''),
      lng: axis === 'lng' ? nextValue : (current.lng ?? ''),
    });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError(t('map_picker.geolocation_unavailable', 'Current location is not available in this browser.'));
      return;
    }

    setLocationLoading(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nextLocation = { lat: coords.latitude, lng: coords.longitude };
        onChange(nextLocation);
        setLocationAccuracy(Number.isFinite(coords.accuracy) ? coords.accuracy : null);
        mapRef.current?.panTo(nextLocation);
        mapRef.current?.setZoom(16);
        setLocationLoading(false);
      },
      (error) => {
        setLocationAccuracy(null);
        const message = error.code === error.PERMISSION_DENIED
          ? t('map_picker.location_denied', 'Location access was denied. Allow it in your browser settings, or choose the pin manually.')
          : error.code === error.TIMEOUT
            ? t('map_picker.location_timeout', 'Could not get your location in time. Retry or choose the pin manually.')
            : t('map_picker.location_error', 'Could not determine your location. Retry or choose the pin manually.');
        setLocationError(message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  return (
    <div className="border rounded overflow-hidden">
      {loadError ? (
        <p role="alert" className="p-3 text-sm text-red-600">
          {t('map_picker.load_error', 'Failed to load Google Maps. Enter coordinates below or use current location.')}
        </p>
      ) : isLoaded ? (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={mapValue || defaultCenter}
          zoom={mapValue ? 14 : 6}
          onLoad={onMapLoad}
          onClick={handleClick}
        >
          {mapValue && <Marker position={mapValue} draggable onDragEnd={handleMarkerDrag} />}
        </GoogleMap>
      ) : (
        <p className="p-3 text-sm text-gray-500">
          {t('map_picker.loading', 'Loading map…')}
        </p>
      )}

      <div className="space-y-2 p-3 text-xs text-gray-600">
        <p>{t('map_picker.hint', 'Click the map or drag the pin to confirm the property location.')}</p>
        <p>{t('map_picker.current_location_note', 'Use current location only when you are physically at the property.')}</p>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locationLoading}
          className="btn btn-secondary text-sm disabled:opacity-50"
        >
          {locationLoading
            ? t('map_picker.location_loading', 'Finding your location…')
            : t('map_picker.use_current_location', 'Use my current location')}
        </button>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            {t('map_picker.latitude', 'Latitude')}
            <input
              aria-label={t('map_picker.latitude', 'Latitude')}
              type="number"
              step="any"
              value={value?.lat ?? ''}
              onChange={(event) => handleManualCoordinateChange('lat', event.target.value)}
              className="input mt-1"
            />
          </label>
          <label className="block">
            {t('map_picker.longitude', 'Longitude')}
            <input
              aria-label={t('map_picker.longitude', 'Longitude')}
              type="number"
              step="any"
              value={value?.lng ?? ''}
              onChange={(event) => handleManualCoordinateChange('lng', event.target.value)}
              className="input mt-1"
            />
          </label>
        </div>
        {locationError ? <p role="alert" className="text-red-600">{locationError}</p> : null}
        {mapValue && (
          <p>
            {locationAccuracy === null
              ? t('map_picker.accuracy_note', 'Confirm the pin is on the property; GPS may be approximate.')
              : t('map_picker.accuracy_metres', 'GPS accuracy is approximately {{metres}} metres. Confirm the pin is on the property.', {
                metres: Math.round(locationAccuracy),
              })}
          </p>
        )}
      </div>
    </div>
  );
};

export default MapPicker;

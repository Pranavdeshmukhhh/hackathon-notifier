import { useState, useCallback } from 'react';

export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const requestLocation = useCallback(() => {
    if (coords) {
      setCoords(null);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        setGeoError(err?.message || 'Unable to retrieve location.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [coords]);

  const clearLocation = useCallback(() => {
    setCoords(null);
    setGeoError(null);
  }, []);

  return {
    coords,
    locating,
    geoError,
    requestLocation,
    clearLocation,
    isActive: Boolean(coords),
  };
}

export default useGeolocation;

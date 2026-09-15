import { useState, useCallback } from 'react';

/**
 * useGeolocation — Encapsulates browser Geolocation API access.
 * Returns location state, loading indicator, error, and a trigger function.
 *
 * @returns {{ userLocation, isLocating, locationError, setLocationError, requestLocation }}
 */
export default function useGeolocation() {
  const [userLocation, setUserLocation]   = useState(null);
  const [isLocating, setIsLocating]       = useState(false);
  const [locationError, setLocationError] = useState(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported by browser');
      return;
    }
    setIsLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      () => {
        setLocationError('Location permission denied or unavailable');
        setIsLocating(false);
      },
      { timeout: 8000 }
    );
  }, []);

  return { userLocation, isLocating, locationError, setLocationError, requestLocation };
}

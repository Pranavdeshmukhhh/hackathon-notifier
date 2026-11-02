import { useState, useCallback, useEffect, useRef } from "react";

export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(
    () => () => {
      generation.current += 1;
      pending.current = false;
    },
    [],
  );

  const requestLocation = useCallback(() => {
    if (pending.current) return;
    if (coords) {
      setCoords(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Location access is not supported by this browser.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    pending.current = true;
    const request = ++generation.current;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (request !== generation.current) return;
        pending.current = false;
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        if (request !== generation.current) return;
        pending.current = false;
        setGeoError(err?.message || "Could not determine your location.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [coords]);

  const clearLocation = useCallback(() => {
    generation.current += 1;
    pending.current = false;
    setCoords(null);
    setGeoError(null);
    setLocating(false);
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

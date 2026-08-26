export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceValidationResult {
  isWithinGeofence: boolean;
  distanceMeters: number;
  maxRadiusMeters: number;
  accuracyMeters?: number;
  isAccuracyAcceptable: boolean;
  message: string;
}

/**
 * Calculates the great-circle distance between two points on the Earth's surface using the Haversine formula.
 * @returns Distance in meters
 */
export function calculateHaversineDistanceMeters(
  point1: GeoCoordinates,
  point2: GeoCoordinates
): number {
  const EARTH_RADIUS_METERS = 6371000; // Earth's mean radius in meters

  const lat1Rad = (point1.latitude * Math.PI) / 180;
  const lat2Rad = (point2.latitude * Math.PI) / 180;
  const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c * 100) / 100;
}

/**
 * Server-authoritative geofence validation.
 */
export function validateGeofence(
  deviceCoords: GeoCoordinates,
  venueCoords: GeoCoordinates,
  geofenceRadiusMeters: number,
  gpsAccuracyMeters: number = 0,
  maxAllowedAccuracyMeters: number = 100
): GeofenceValidationResult {
  const isAccuracyAcceptable = gpsAccuracyMeters <= maxAllowedAccuracyMeters;
  const distanceMeters = calculateHaversineDistanceMeters(deviceCoords, venueCoords);
  const isWithinGeofence = distanceMeters <= geofenceRadiusMeters;

  let message = 'You are within the attendance zone.';
  if (!isAccuracyAcceptable) {
    message = `GPS signal is too weak/inaccurate (${Math.round(
      gpsAccuracyMeters
    )}m). Please move outdoors or enable High Accuracy GPS.`;
  } else if (!isWithinGeofence) {
    message = `You are outside the attendance zone (${Math.round(
      distanceMeters
    )}m away from venue, max allowed is ${geofenceRadiusMeters}m).`;
  }

  return {
    isWithinGeofence: isWithinGeofence && isAccuracyAcceptable,
    distanceMeters,
    maxRadiusMeters: geofenceRadiusMeters,
    accuracyMeters: gpsAccuracyMeters,
    isAccuracyAcceptable,
    message,
  };
}

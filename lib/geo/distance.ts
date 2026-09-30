import type { GeoPoint } from "./parse";

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(
  a: Pick<GeoPoint, "lat" | "lon">,
  b: Pick<GeoPoint, "lat" | "lon">,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

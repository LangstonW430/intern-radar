/**
 * Loads the committed GeoNames lookup. Import this only where the 1.7 MB
 * dataset belongs in the bundle (Convex ingest, scripts, tests) — never from
 * client-reachable code.
 */
import rawLookup from "../../data/geonames/lookup.json";
import { normalizeCityName, type CityLookup, type GeoPoint } from "./parse";

const cities = (rawLookup as unknown as {
  cities: Record<string, [number, number, number]>;
}).cities;

export const lookupCity: CityLookup = (city, country, admin1) => {
  const name = normalizeCityName(city);
  const key = admin1
    ? `${name}|${country}|${admin1}`
    : `${name}|${country}`;
  const hit = cities[key];
  if (!hit) return null;
  const point: GeoPoint = { lat: hit[0], lon: hit[1], name: city };
  return point;
};

/**
 * Turns Simplify's freeform location strings ("NYC", "Austin, TX",
 * "Toronto, ON, Canada", "Remote in USA") into lookup queries. Pure — the
 * actual city data is injected so this stays testable and the 1.7 MB lookup
 * only loads where it's needed.
 */

export interface GeoPoint {
  lat: number;
  lon: number;
  name: string;
}

export type CityLookup = (
  city: string,
  country: string,
  admin1?: string,
) => GeoPoint | null;

export type ParsedLocation =
  | { kind: "remote"; region: string | null }
  | { kind: "city"; geo: GeoPoint | null; raw: string }
  | { kind: "unknown"; raw: string };

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS " +
    "MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV " +
    "WI WY DC PR").split(" "),
);

const CA_PROVINCES = new Set(
  "AB BC MB NB NL NT NS NU ON PE QC SK YT".split(" "),
);

const CITY_ALIASES: Record<string, string> = {
  // GeoNames calls it "New York City"
  nyc: "new york city, ny",
  "new york": "new york city, ny",
  "new york, ny": "new york city, ny",
  sf: "san francisco, ca",
  "south sf": "south san francisco, ca",
  la: "los angeles, ca",
  "washington dc": "washington, dc",
  "washington, d c": "washington, dc",
};

const COUNTRY_CODES: Record<string, string> = {
  usa: "us", us: "us", "united states": "us", "united states of america": "us",
  canada: "ca", uk: "gb", "united kingdom": "gb", england: "gb",
  scotland: "gb", ireland: "ie", germany: "de", france: "fr", spain: "es",
  italy: "it", netherlands: "nl", belgium: "be", switzerland: "ch",
  austria: "at", poland: "pl", sweden: "se", norway: "no", denmark: "dk",
  finland: "fi", portugal: "pt", czechia: "cz", "czech republic": "cz",
  india: "in", china: "cn", japan: "jp", "south korea": "kr", korea: "kr",
  singapore: "sg", "hong kong": "hk", taiwan: "tw", australia: "au",
  "new zealand": "nz", israel: "il", uae: "ae",
  "united arab emirates": "ae", brazil: "br", mexico: "mx",
};

/**
 * The one normalizer for city-name keys — used by the lookup builder, the
 * lookup loader, and the parser, so "St. Paul" and "Saint Paul" always land
 * on the same key no matter which form GeoNames or Simplify uses.
 */
export function normalizeCityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\bst\b(?=\s)/g, "saint")
    .replace(/\bft\b(?=\s)/g, "fort")
    .trim();
}

const clean = normalizeCityName;

export function parseLocation(
  raw: string,
  lookup: CityLookup,
): ParsedLocation {
  let text = raw.trim();

  const remote = text.match(/^\s*remote(?:\s+in\s+(.+))?$/i);
  if (remote) {
    return { kind: "remote", region: remote[1]?.trim() ?? null };
  }
  const hybrid = text.match(/^\s*hybrid(?:\s+in\s+(.+))?$/i);
  if (hybrid) {
    if (!hybrid[1]) return { kind: "unknown", raw };
    text = hybrid[1].trim(); // geocode the anchor city
  }

  let normalized = clean(text);
  normalized = CITY_ALIASES[normalized] ?? normalized;

  const parts = normalized.split(",").map((p) => p.trim()).filter(Boolean);
  let geo: GeoPoint | null = null;

  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const country = COUNTRY_CODES[last];
    const admin = parts[parts.length - 2].toUpperCase();
    if (country) {
      // "city, admin, country" — e.g. "toronto, on, canada"
      geo =
        lookup(parts[0], country, admin.toLowerCase()) ??
        lookup(parts[0], country);
    } else if (US_STATES.has(last.toUpperCase())) {
      // "Arlington County, Arlington, VA" — try each candidate against the state
      const state = last.toLowerCase();
      for (const candidate of parts.slice(0, -1).reverse()) {
        geo = lookup(candidate, "us", state);
        if (geo) break;
      }
    }
  } else if (parts.length === 2) {
    const second = parts[1].toUpperCase();
    if (US_STATES.has(second)) {
      geo = lookup(parts[0], "us", second.toLowerCase()) ?? lookup(parts[0], "us");
    } else if (CA_PROVINCES.has(second)) {
      geo = lookup(parts[0], "ca", second.toLowerCase()) ?? lookup(parts[0], "ca");
    } else if (COUNTRY_CODES[parts[1]]) {
      geo = lookup(parts[0], COUNTRY_CODES[parts[1]]);
    }
  } else if (parts.length === 1) {
    // Bare city name — overwhelmingly US in this dataset.
    geo = lookup(parts[0], "us");
  }

  return geo
    ? { kind: "city", geo, raw }
    : parts.length > 0
      ? { kind: "unknown", raw }
      : { kind: "unknown", raw };
}

/** Geocodes a listing's location strings into deduped points. */
export function geocodeLocations(
  locations: string[],
  lookup: CityLookup,
): GeoPoint[] {
  const seen = new Set<string>();
  const out: GeoPoint[] = [];
  for (const raw of locations) {
    const parsed = parseLocation(raw, lookup);
    if (parsed.kind === "city" && parsed.geo) {
      const key = `${parsed.geo.lat},${parsed.geo.lon}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(parsed.geo);
      }
    }
  }
  return out;
}

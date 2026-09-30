/**
 * Preprocesses the GeoNames cities dataset into the compact lookup committed
 * at data/geonames/lookup.json.
 *
 * Inputs (download once, not committed):
 *   https://download.geonames.org/export/dump/cities1000.zip  (unzip to .txt)
 *   https://download.geonames.org/export/dump/admin1CodesASCII.txt
 *
 * Usage: pnpm tsx scripts/build-geonames.ts <cities1000.txt> <admin1CodesASCII.txt>
 *
 * Data is CC BY 4.0 — attribution lives in the README.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { normalizeCityName as normalizeName } from "../lib/geo/parse";

// US/CA keep every city in cities1000 (listings often name small towns);
// elsewhere 15k+ keeps the file compact.
const MIN_POP_US_CA = 0;
const MIN_POP_ELSEWHERE = 15_000;

async function main() {
  const [citiesPath, admin1Path] = process.argv.slice(2);
  if (!citiesPath || !admin1Path) {
    console.error(
      "usage: tsx scripts/build-geonames.ts <cities5000.txt> <admin1CodesASCII.txt>",
    );
    process.exit(1);
  }

  // Canada's GeoNames admin1 codes are numeric; map them to postal
  // abbreviations so "Toronto, ON, Canada" keys work.
  const CA_PROVINCES: Record<string, string> = {
    alberta: "ab", "british columbia": "bc", manitoba: "mb",
    "new brunswick": "nb", "newfoundland and labrador": "nl",
    "northwest territories": "nt", "nova scotia": "ns", nunavut: "nu",
    ontario: "on", "prince edward island": "pe", quebec: "qc",
    saskatchewan: "sk", yukon: "yt",
  };
  const caAdmin1ToPostal = new Map<string, string>();
  for (const line of (await readFile(admin1Path, "utf8")).split("\n")) {
    const [code, , asciiName] = line.split("\t");
    if (!code?.startsWith("CA.") || !asciiName) continue;
    const postal = CA_PROVINCES[normalizeName(asciiName)];
    if (postal) caAdmin1ToPostal.set(code.slice(3), postal);
  }

  // key → [lat, lon, population]; ties keep the most populous city.
  const cities: Record<string, [number, number, number]> = {};
  const put = (key: string, value: [number, number, number]) => {
    const existing = cities[key];
    if (!existing || value[2] > existing[2]) cities[key] = value;
  };

  let rows = 0;
  for (const line of (await readFile(citiesPath, "utf8")).split("\n")) {
    const cols = line.split("\t");
    if (cols.length < 15) continue;
    const name = normalizeName(cols[2] || cols[1]);
    const lat = Number(cols[4]);
    const lon = Number(cols[5]);
    const country = (cols[8] || "").toLowerCase();
    const admin1 = (cols[10] || "").toLowerCase();
    const population = Number(cols[14]) || 0;
    if (!name || !country || Number.isNaN(lat)) continue;
    const isUsCa = country === "us" || country === "ca";
    if (population < (isUsCa ? MIN_POP_US_CA : MIN_POP_ELSEWHERE)) continue;
    rows++;

    const value: [number, number, number] = [
      Math.round(lat * 1000) / 1000,
      Math.round(lon * 1000) / 1000,
      population,
    ];
    put(`${name}|${country}`, value);
    if (country === "us" && admin1) put(`${name}|us|${admin1}`, value);
    if (country === "ca" && admin1) {
      const postal = caAdmin1ToPostal.get(admin1.toUpperCase()) ??
        caAdmin1ToPostal.get(cols[10] || "");
      if (postal) put(`${name}|ca|${postal}`, value);
    }
  }

  const out = {
    version: 1,
    source: "GeoNames cities1000, CC BY 4.0, https://www.geonames.org/",
    cities,
  };
  await mkdir("data/geonames", { recursive: true });
  await writeFile("data/geonames/lookup.json", JSON.stringify(out));
  console.log(
    `wrote data/geonames/lookup.json: ${Object.keys(cities).length} keys from ${rows} cities`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

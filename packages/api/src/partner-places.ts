import { CITIES_BY_COUNTRY, SUBDIVISIONS_BY_COUNTRY } from "./partner-locality-data.ts";
import { namedPlaces, regionsOf, type NamedPlaces } from "./places.ts";

const key = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

type Index = { names: Map<string, Set<string>>; longest: number };
function index(rows: Readonly<Record<string, string>>): Index {
  const names = new Map<string, Set<string>>();
  let longest = 0;
  for (const [country, places] of Object.entries(rows)) {
    if (regionsOf(country).length === 0) continue;
    for (const place of places.split("|")) {
      const countries = names.get(place) ?? new Set<string>();
      countries.add(country);
      names.set(place, countries);
      longest = Math.max(longest, place.split(" ").length);
    }
  }
  return { names, longest };
}
let localities: { cities: Index; subdivisions: Index } | undefined;
function indexes() {
  return localities ??= { cities: index(CITIES_BY_COUNTRY), subdivisions: index(SUBDIVISIONS_BY_COUNTRY) };
}
const only = (countries?: ReadonlySet<string>) => countries?.size === 1 ? [...countries][0] : undefined;
const DIRECTION = /^(?:northern|southern|eastern|western|central|northeast(?:ern)?|northwest(?:ern)?|southeast(?:ern)?|southwest(?:ern)?)\s+/u;

function countryOfCityOrSubdivision(cities?: ReadonlySet<string>, subdivisions?: ReadonlySet<string>): string | undefined {
  const city = only(cities);
  if (city && (!subdivisions || subdivisions.has(city))) return city;
  return cities ? undefined : only(subdivisions);
}

function structuredCountry(location: string): string | undefined {
  const { cities, subdivisions } = indexes();
  const segments = location.split(",");
  // A stated parent such as Texas resolves "Paris, Texas" even if Paris, France is the only Paris in the table.
  for (const segment of segments.reverse()) {
    const place = key(segment);
    if (place === "georgia" && segments.length === 1) continue;
    const subdivision = only(subdivisions.names.get(place) ?? subdivisions.names.get(place.replace(DIRECTION, "")));
    if (subdivision) return subdivision;
    const city = only(cities.names.get(place));
    if (city) return city;
  }
  return undefined;
}

const LOCATION_BEFORE = /(?:\b(?:in|near|around|across|throughout|from|en|em|no|na|dans|au|aux)|à|\b(?:rivers?|waterways?|neighbou?rhoods?) of)\s+(?:(?:northern|southern|eastern|western|central|northeast(?:ern)?|northwest(?:ern)?|southeast(?:ern)?|southwest(?:ern)?)\s+)?$/iu;
const CITY_AFTER = /^(?:['’]s)?\s+(?:city|municipality|borough|waterways?|rivers?|neighbou?rhoods?)\b/iu;
const SUBDIVISION_AFTER = /^\s+(?:state|province|prefecture|department|county|region)\b/iu;
const NOISE = new Set(["america", "georgia", "january", "march", "may", "june", "august", "winter", "summer", "spring", "fall", "union"]);

function proseCountry(text: string): string | undefined {
  const { cities, subdivisions } = indexes();
  const words = [...text.slice(0, 6000).matchAll(/[\p{L}\p{M}\p{N}]+/gu)];
  const longest = Math.max(cities.longest, subdivisions.longest);
  const countries = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    const first = words[i]!;
    if (!/^\p{Lu}/u.test(first[0])) continue;
    const from = first.index!;
    const locative = LOCATION_BEFORE.test(text.slice(Math.max(0, from - 50), from));
    for (let length = Math.min(longest, words.length - i); length > 0; length--) {
      const last = words[i + length - 1]!;
      const to = last.index! + last[0].length;
      const phrase = text.slice(from, to);
      if (!/^[\p{L}\p{M}\p{N}\s-]+$/u.test(phrase) || phrase.includes("\n")) continue;
      const name = key(phrase);
      if (NOISE.has(name)) continue;
      const tail = text.slice(to, to + 55);
      const city = CITY_AFTER.test(tail), subdivision = SUBDIVISION_AFTER.test(tail);
      if (!locative && !city && !subdivision) continue;
      const cityCountries = cities.names.get(name), subdivisionCountries = subdivisions.names.get(name);
      if (!cityCountries && !subdivisionCountries) continue;
      const parent = /^,\s*([\p{Lu}][\p{L}\p{M}\s-]{1,40})(?=[,.!?;\n]|$)/u.exec(tail);
      const country = (parent ? only(subdivisions.names.get(key(parent[1]!))) : undefined)
        ?? (city ? only(cityCountries) : subdivision ? only(subdivisionCountries) : countryOfCityOrSubdivision(cityCountries, subdivisionCountries));
      if (country) countries.add(country);
      i += length - 1;
      break;
    }
  }
  // Ambiguous or conflicting mentions do not establish local scope.
  return only(countries);
}

/** Country-level matching facts. Explicit countries win, and a locality never changes a saved location. */
export function partnerPlaces(text: string, locations: readonly string[] = []): NamedPlaces {
  const explicit = namedPlaces(locations.join(". "));
  const stated = namedPlaces(text);
  const regions = new Set([...explicit.regions, ...stated.regions]);
  const structured = new Set(explicit.countries);
  for (const location of locations) {
    if (namedPlaces(location).countries.size) continue;
    const country = structuredCountry(location);
    if (country) structured.add(country);
  }
  if (structured.size) return { countries: structured, regions };
  if (stated.countries.size) return { countries: stated.countries, regions };
  const inferred = proseCountry(text);
  return { countries: new Set(inferred ? [inferred] : []), regions };
}

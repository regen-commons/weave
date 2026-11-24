/**
 * Countries and regions named in writing, for fit only (DL-143). A place read here never becomes an
 * eligibility fact: a card's work countries for funding stay what the person typed in its funding
 * details. The regions are the seven the fund catalog uses.
 */
export const REGIONS = ["Africa", "Asia", "Europe", "Latin America & Caribbean", "Middle East", "North America", "Oceania"] as const;
export type Region = (typeof REGIONS)[number];

const MEMBERS: Readonly<Record<Region, string>> = {
  Africa:
    "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW",
  Asia: "AF BD BT BN KH CN HK IN ID JP KZ KG LA MO MY MV MN MM NP KP PK PH SG KR LK TW TJ TH TL TM UZ VN",
  Europe:
    "AL AD AM AT AZ BY BE BA BG HR CY CZ DK EE FO FI FR GE DE GI GR HU IS IE IM IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA JE GG AX TR",
  "Latin America & Caribbean":
    "AR BO BR CL CO CR CU DO EC SV GT HT HN JM MX NI PA PY PE PR UY VE BS BB BZ GY SR TT AG DM GD KN LC VC AW CW KY TC VG VI GP MQ GF BL MF SX BQ AI MS FK",
  "Middle East": "BH IR IQ IL JO KW LB OM PS QA SA SY AE YE TR EG",
  "North America": "US CA BM GL PM",
  Oceania: "AU NZ FJ PG SB VU NC PF WS TO KI FM MH NR PW TV CK NU TK WF GU MP AS PN NF CX CC",
};
const regionsByCountry = new Map<string, Region[]>();
for (const region of REGIONS)
  for (const code of MEMBERS[region].split(" ")) regionsByCountry.set(code, [...(regionsByCountry.get(code) ?? []), region]);
export const regionsOf = (country: string): readonly Region[] => regionsByCountry.get(country) ?? [];

/** High-income economies; every other country counts as low or middle income for a program that names them. */
const HIGH_INCOME = new Set(
  ("AD AE AG AT AU AW BB BE BH BM BN BS CA CH CL CW CY CZ DE DK EE ES FI FO FR GB GI GL GR GU HK HR HU IE IL IM IS IT " +
    "JP KN KR KW KY LI LT LU LV MC MF MO MP MT NC NL NO NR NZ OM PA PF PL PR PT QA RO SA SC SE SG SI SK SM SX TC TT TW US UY VG VI").split(" "),
);
export const lowOrMiddleIncome = (country: string): boolean => regionsByCountry.has(country) && !HIGH_INCOME.has(country);

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Region words that name one of the catalog's regions. */
const REGION_WORDS: readonly (readonly [string, Region])[] = [
  ["africa", "Africa"], ["african", "Africa"], ["sub saharan", "Africa"], ["sahel", "Africa"],
  ["latin america", "Latin America & Caribbean"], ["south america", "Latin America & Caribbean"],
  ["central america", "Latin America & Caribbean"], ["caribbean", "Latin America & Caribbean"],
  ["america latina", "Latin America & Caribbean"], ["amazon", "Latin America & Caribbean"], ["amazonia", "Latin America & Caribbean"],
  ["asia", "Asia"], ["southeast asia", "Asia"], ["south asia", "Asia"],
  ["europe", "Europe"], ["european", "Europe"], ["europa", "Europe"],
  ["middle east", "Middle East"], ["oceania", "Oceania"], ["pacific islands", "Oceania"],
  ["north america", "North America"],
];
/** Demonyms and other names Intl.DisplayNames does not give. */
const EXTRA_NAMES: Readonly<Record<string, string>> = {
  nigerian: "NG", kenyan: "KE", ghanaian: "GH", brazilian: "BR", brasileira: "BR", brasileiro: "BR", colombian: "CO",
  mexican: "MX", peruvian: "PE", chilean: "CL", argentinian: "AR", argentine: "AR", indonesian: "ID",
  "united states": "US", usa: "US", uk: "GB", "united kingdom": "GB", britain: "GB", england: "GB",
  scotland: "GB", wales: "GB", ugandan: "UG", tanzanian: "TZ", rwandan: "RW", "south african": "ZA", ethiopian: "ET",
  philippine: "PH", filipino: "PH", vietnamese: "VN", "ivory coast": "CI", congo: "CD", drc: "CD",
};
let names: Map<string, string> | undefined;
function countryNames(): Map<string, string> {
  if (names) return names;
  names = new Map(Object.entries(EXTRA_NAMES));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const language of ["en", "pt", "es"]) {
    let display: Intl.DisplayNames;
    try { display = new Intl.DisplayNames([language], { type: "region" }); } catch { continue; }
    for (const a of letters) for (const b of letters) {
      const code = a + b;
      if (!regionsByCountry.has(code)) continue;
      const name = display.of(code);
      if (name && name !== code) {
        const key = fold(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        // Short or common-word names would read ordinary words as countries.
        if (key.length >= 4 && !["chad", "jersey", "guernsey", "georgia", "jordan", "niger", "turkey", "china"].includes(key) && !names.has(key))
          names.set(key, code);
      }
    }
  }
  // Names that are also common words count only written as a name, which fold cannot see; these two are kept
  // because they are rarely words in an initiative's description.
  names.set("china", "CN");
  return names;
}

export type NamedPlaces = { readonly countries: ReadonlySet<string>; readonly regions: ReadonlySet<Region> };
/** The countries and catalog regions a text names. "Niger" is not read inside "Nigeria". */
export function namedPlaces(text: string): NamedPlaces {
  const words = ` ${fold(text.slice(0, 6000)).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  const countries = new Set<string>(), regions = new Set<Region>();
  for (const [name, code] of countryNames()) if (words.includes(` ${name} `)) countries.add(code);
  for (const [name, region] of REGION_WORDS) if (words.includes(` ${name} `)) regions.add(region);
  return { countries, regions };
}

/** Whether a program's own words limit it to low- and middle-income countries or the Global South. */
export const namesLowOrMiddleIncome = (text: string): boolean =>
  /\b(?:low[- ]+and[- ]+middle[- ]+income|low[- ]+income countries|lmics?|developing countries|global south|emerging markets|energy[- ]poor)\b/iu.test(text);

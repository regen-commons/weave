/**
 * The catalog's topics, read from Portuguese and Spanish words as well as English ones (DL-142).
 *
 * The fund catalog describes its programs in English, and the shared rubric (dist/matching.mjs)
 * compares a card's words with a program's word for word. A card written in Portuguese or Spanish
 * therefore shared no topic with any program, and Funding and the MCP tool showed it nothing that
 * fits. Here each topic is one of the rubric's English terms, as the catalog uses it, with the
 * Portuguese and Spanish words that mean it. Funding and the MCP tool give the topics a card names
 * to the rubric as its themes, so it reads them in the catalog's own language. The rubric itself,
 * and the live site that runs it, are unchanged.
 *
 * Words are written folded, in lower case without accents. A word names one topic only, so one
 * word never counts as two shared topics while the catalog is written in English. Left out:
 * - a word that is also English, which the rubric reads already, as itself (rural, digital,
 *   inclusion), or which means something else in English (familiar, medicinal, fauna);
 * - a word with an everyday second meaning (mata, "kills"; cura, "priest"; deficiencias,
 *   "shortcomings"; pueblos, "villages"; generos, "kinds"; negra, a colour), which counts only in a
 *   phrase that settles it, such as mata atlantica, pueblos indigenas or violencia de genero;
 * - a phrase that names something else (Costa Rica, El Niño, una especie de). Spanish "a costa de"
 *   ("at the expense of") still reads as coastal, because Portuguese "a costa de" is "the coast of".
 * Topics are subjects of work, never places or kinds of organization, and a reading is never an
 * eligibility decision.
 */
export const TOPIC_WORDS: Readonly<Record<string, string>> = {
  // Farming and food
  agriculture: "agricultura agriculturas agropecuaria agropecuario permacultura",
  agricultural: "agricola agricolas agrario agraria agrarios agrarias",
  agroecology: "agroecologia",
  agroecological: "agroecologico agroecologica agroecologicos agroecologicas",
  farmer:
    "agricultor agricultora agricultores agricultoras campones camponesa camponeses camponesas campesino campesina campesinos campesinas lavrador lavradora lavradores lavradoras",
  producer: "produtor produtora produtores produtoras productor productora productores productoras",
  food: "alimento alimentos alimentacao alimentacion alimentar alimentaria alimentario alimentarias alimentarios comida comidas refeicao refeicoes horta hortas huerta huertas huerto huertos",
  nutrition: "nutricao nutricion nutricional nutricionais nutricionales",
  cooking: "cozinha cozinhas cozinhar cozinham cozinhamos cocina cocinas cocinar cocinamos cocinan culinaria culinario gastronomia",
  healthy: "saudavel saudaveis saludable saludables",
  pollinators: "polinizadores",
  // Land, water and living things
  water: "agua aguas hidrico hidrica hidricos hidricas nascente nascentes manantial manantiales",
  ocean: "mar mares oceano oceanos marinho marinha marinhos marinhas marinos marinas maritimo maritima",
  coastal: "costa costeiro costeira costeiros costeiras costero costera costeros costeras litoral litorais litorales",
  fishers: "pescador pescadora pescadores pescadoras",
  fisheries: "pesca pescas pesqueiro pesqueira pesqueiros pesqueiras pesquero pesquera pesqueros pesqueras pesqueria pesquerias",
  forest:
    "floresta florestas florestal florestais bosque bosques forestal forestales selva selvas matas mata_atlantica mata_nativa mata_ciliar reflorestamento reflorestar reforestacion reforestar",
  restoration: "restaurar restauracao restauracoes restauracion restauramos restauram restauran restaurando",
  recovery: "recuperacao recuperacion",
  regenerative: "regenerativo regenerativa regenerativos regenerativas",
  regeneration: "regeneracao regeneracion",
  biodiversity: "biodiversidade biodiversidad",
  species: "especie especies",
  native: "nativo nativa nativos nativas",
  conservation: "conservacao conservacion conservar conservamos conservam conservan",
  protection: "protecao protecoes proteccion protecciones proteger protegemos protege protegem protegen",
  ecosystem: "ecossistema ecossistemas ecosistema ecosistemas",
  nature: "natureza naturaleza",
  landscape: "paisagem paisagens paisaje paisajes",
  land: "terra terras tierra tierras",
  territorial: "territorio territorios territoriais territoriales",
  // Climate, energy and waste
  environmental: "ambiental ambientais ambientales",
  environment: "ambiente ambientes",
  climate: "clima climas climatico climatica climaticos climaticas",
  adaptation: "adaptacao adaptacion",
  mitigation: "mitigacao mitigacion",
  disaster: "desastre desastres",
  emergency: "emergencia emergencias",
  energy: "energia energias energetico energetica energeticos energeticas",
  renewable: "renovavel renovaveis renovable renovables",
  carbon: "carbono",
  waste: "residuo residuos lixo basura reciclagem reciclaje",
  pollution: "poluicao contaminacao contaminacion",
  sanitation: "saneamento saneamiento",
  hygiene: "higiene",
  // Places people live
  housing: "moradia moradias habitacao vivienda viviendas",
  urban: "urbano urbana urbanos urbanas",
  rural: "rurais rurales",
  neighborhood: "bairro bairros barrio barrios",
  mobility: "mobilidade movilidad",
  transportation: "transporte transportes",
  // Learning
  education:
    "educacao educacion educacional educacionais educacionales educativo educativa educativos educativas educador educadora educadores educadoras ensino ensenanza pedagogico pedagogica",
  training: "formacao formacion capacitacao capacitacoes capacitacion capacitaciones capacitar capacitamos capacitam capacitan treinamento treinamentos",
  learning: "aprendizagem aprendizaje aprendizado",
  literacy: "alfabetizacao alfabetizacion",
  school: "escola escolas escolar escolares escuela escuelas colegio colegios",
  students: "estudantes estudiantes alunos alunas",
  teacher: "professora professores professoras docente docentes maestro maestra maestros maestras",
  research: "pesquisa pesquisas investigacao investigacion investigaciones",
  science: "ciencia ciencias",
  scientific: "cientifico cientifica cientificos cientificas",
  technology: "tecnologia tecnologias tecnologico tecnologica tecnologicos tecnologicas",
  digital: "digitais digitales",
  innovation: "inovacao inovacoes innovacion innovaciones",
  language: "idioma idiomas lingua linguas lengua lenguas",
  // People
  children: "crianca criancas ninos infantil infantis infantiles",
  childhood: "infancia",
  youth: "jovem jovens joven jovenes juventude juventud adolescente adolescentes",
  women: "mulher mulheres mujer mujeres",
  girls: "menina meninas ninas",
  gender: "de_genero de_generos",
  feminist: "feminista feministas feminismo",
  family: "familia familiares",
  families: "familias",
  elders: "idoso idosa idosos idosas anciano anciana ancianos ancianas",
  disability: "com_deficiencia discapacidad discapacidades",
  indigenous: "indigena indigenas",
  peoples: "povos_indigenas povos_originarios povos_tradicionais pueblos_indigenas pueblos_originarios",
  afrodescendant: "afrodescendente afrodescendentes afrodescendiente afrodescendientes quilombo quilombos quilombola quilombolas",
  migration: "migracao migracoes migracion migraciones",
  migrant: "migrante migrantes",
  immigrant: "imigrante imigrantes inmigrante inmigrantes",
  refugee: "refugiado refugiada refugiados refugiadas",
  volunteer: "voluntario voluntaria voluntarios voluntarias voluntariado",
  // Culture and knowledge
  culture: "cultura culturas culturais culturales",
  arts: "arte artes artistico artistica artisticos artisticas artista artistas",
  heritage: "patrimonio",
  memory: "memoria memorias",
  ancestral: "ancestrais ancestrales",
  traditional: "tradicional tradicionais tradicionales",
  knowledge: "saberes conhecimento conhecimentos conocimiento conocimientos",
  journalism: "jornalismo periodismo",
  communications: "comunicacao comunicacoes comunicacion comunicaciones",
  sport: "esporte esportes deporte deportes",
  // Health and care
  health: "saude salud medicinais medicinales",
  healing: "curar sanacion",
  wellbeing: "bienestar",
  care: "cuidado cuidados cuidar cuidamos",
  reproductive: "reprodutivo reprodutiva reprodutivos reprodutivas reproductivo reproductiva reproductivos reproductivas",
  // Rights, justice and economy
  rights: "direito direitos derecho derechos",
  human: "humano humana humanos humanas",
  justice: "justica justicia",
  democracy: "democracia",
  democratic: "democratico democratica democraticos democraticas",
  governance: "governanca gobernanza",
  policy: "politica politicas",
  violence: "violencia violencias",
  peace: "paz",
  equality: "igualdade igualdad",
  equity: "equidade equidad",
  inclusion: "inclusao",
  racial: "raciais raciales",
  racism: "racismo",
  poverty: "pobreza",
  economic: "economico economica economicos economicas",
  economy: "economia economias",
  solidarity: "solidariedade solidaridad solidario solidaria solidarios solidarias",
  cooperative: "cooperativa cooperativas cooperativo cooperativos",
  income: "renda rendas ingreso ingresos",
  employment: "emprego empregos empleo empleos",
  entrepreneurship:
    "empreendedorismo empreendimento empreendimentos empreendedor empreendedora empreendedores empreendedoras emprendimiento emprendimientos emprendedor emprendedora emprendedores emprendedoras",
  financial: "financeiro financeira financeiros financeiras financiero financiera financieros financieras",
};

/**
 * Phrases that name something other than their words' topics: places, a weather pattern and turns
 * of phrase. Their words are not read, with or without capitals, as speech gives them without.
 */
export const OTHER_MEANINGS: readonly string[] = [
  "costa rica", "costa do marfim", "costa de marfil", "mar del plata", "en la paz", "el nino", "la nina",
  "especie de", "rotacao de culturas", "culturas agricolas", "consorcio de culturas",
];

/**
 * Words that are also names of people and places, such as Costa, Paz and Terra. Written with a
 * capital inside a sentence, they are read as a name; at the start of a sentence they count.
 */
const ALSO_NAMES = new Set(["costa", "paz", "mar", "terra", "selva", "marinho", "marinha"]);

/** The English forms the rubric itself reads as a topic (its TERM_FAMILIES), besides the topic word. */
const ENGLISH_FORMS: Readonly<Record<string, string>> = {
  arts: "art artistic",
  culture: "cultural cultures",
  restoration: "restore restoring",
  education: "educational",
  ecosystem: "ecosystems",
  forest: "forests",
  farmer: "farmers",
};

/** The word lists, as lookups. Built on first use, so a page that never ranks does not build them. */
let lookups: { other: Map<string, string>; english: Map<string, string>; stops: Set<string> } | undefined;
function lexicon() {
  if (lookups) return lookups;
  const other = new Map<string, string>(), english = new Map<string, string>();
  for (const [topic, words] of Object.entries(TOPIC_WORDS)) {
    for (const word of words.split(" ")) other.set(word.replaceAll("_", " "), topic);
    for (const word of [topic, ...(ENGLISH_FORMS[topic]?.split(" ") ?? [])]) english.set(word, topic);
  }
  return (lookups = { other, english, stops: new Set(OTHER_MEANINGS) });
}

const fold = (word: string) => word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** How much of one text is read, as the rubric reads at most 6,000 characters of a card. */
const READ_LIMIT = 6000;
/** The longest phrase in the lists, in words. */
const LONGEST = 3;

/** The topics a text names, split into those named in English words and those named in Portuguese or Spanish. */
function readTopics(text: string): { english: Set<string>; other: Set<string> } {
  const { other: byWord, english: byEnglish, stops } = lexicon();
  const words: { folded: string; capital: boolean; starts: boolean }[] = [];
  let last = 0;
  const read = text.slice(0, READ_LIMIT);
  for (const match of read.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const word = match[0];
    words.push({
      folded: fold(word),
      capital: word !== word.toLowerCase(),
      // The first word, or one after a sentence's end, is capitalized for the sentence.
      starts: !words.length || /[.!?¡¿:\n]/u.test(read.slice(last, match.index)),
    });
    last = match.index + word.length;
  }
  const english = new Set<string>(), other = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    const phrase = (length: number) => words.slice(i, i + length).map(({ folded }) => folded).join(" ");
    const stop = [LONGEST, 2].find((length) => i + length <= words.length && stops.has(phrase(length)));
    if (stop) {
      i += stop - 1;
      continue;
    }
    for (const length of [2, LONGEST]) {
      const named = i + length <= words.length ? byWord.get(phrase(length)) : undefined;
      if (named) other.add(named);
    }
    const { folded, capital, starts } = words[i]!;
    if (ALSO_NAMES.has(folded) && capital && !starts) continue;
    const translated = byWord.get(folded);
    if (translated) other.add(translated);
    else {
      const stated = byEnglish.get(folded);
      if (stated) english.add(stated);
    }
  }
  return { english, other };
}

/** The catalog topics a text names, in English, Portuguese or Spanish words. */
export function namedTopics(text: string): Set<string> {
  const { english, other } = readTopics(text);
  return new Set([...english, ...other]);
}

/**
 * The themes a card is ranked with: its own themes first, then each catalog topic its description
 * names in Portuguese or Spanish, or that the words of its kept needs and offers name in any of the
 * three. A topic the description already names in English is left to the description. Topics from
 * needs and offers weigh as themes do, since the person asks or offers exactly that.
 */
export function fundingTopics(description: string, themes: readonly string[] = [], asks: readonly string[] = []): string[] {
  const { english, other } = readTopics(description);
  const own = new Set(themes);
  const added = new Set(other);
  for (const ask of asks) for (const topic of namedTopics(ask)) added.add(topic);
  return [...themes, ...[...added].filter((topic) => !own.has(topic) && !english.has(topic))];
}

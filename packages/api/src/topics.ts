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
 * word never counts as two shared topics. A word that is also English is left out: the rubric
 * reads it already, as itself (rural, digital, inclusion), or it means something else in English
 * (familiar, medicinal, fauna), so an English card is read as it always was. So is a word that
 * also names a colour or a place as often as a people, such as negra. Topics are subjects of work,
 * never places or kinds of organization, and a reading is never an eligibility decision.
 */
const TOPIC_WORDS: Readonly<Record<string, string>> = {
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
  coastal: "costa costas costeiro costeira costeiros costeiras costero costera costeros costeras litoral litorais litorales",
  fishers: "pescador pescadora pescadores pescadoras",
  fisheries: "pesca pescas pesqueiro pesqueira pesqueiros pesqueiras pesquero pesquera pesqueros pesqueras pesqueria pesquerias",
  forest: "floresta florestas florestal florestais bosque bosques forestal forestales selva selvas mata matas reflorestamento reflorestar reforestacion reforestar",
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
  amazon: "amazonia amazonico amazonica amazonicos amazonicas amazonas",
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
  children: "crianca criancas nino ninos infantil infantis infantiles",
  childhood: "infancia",
  youth: "jovem jovens joven jovenes juventude juventud adolescente adolescentes",
  women: "mulher mulheres mujer mujeres",
  girls: "menina meninas ninas",
  gender: "genero generos",
  feminist: "feminista feministas feminismo",
  family: "familia familiares",
  families: "familias",
  elders: "idoso idosa idosos idosas anciano anciana ancianos ancianas",
  disability: "deficiencia deficiencias discapacidad discapacidades",
  indigenous: "indigena indigenas",
  peoples: "povos pueblos",
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
  healing: "cura curas curar sanacion",
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
 * Words that are also names of people and places, such as Costa, Paz (La Paz) and Mar (Mar del
 * Plata). They name a topic only as written in lower case, as they are in running text.
 */
const LOWER_CASE_ONLY = new Set(["costa", "mata", "paz", "mar", "terra", "cura", "selva", "marinho", "marinha"]);

/** English forms the rubric reads as these terms besides a plain plural (its TERM_FAMILIES). */
const ENGLISH_FORMS: Readonly<Record<string, string>> = {
  arts: "art artistic",
  culture: "cultural",
  restoration: "restore restoring",
  education: "educational",
};

const fold = (word: string) => word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const plural = (term: string) => (/[^aeiou]y$/u.test(term) ? `${term.slice(0, -1)}ies` : `${term}s`);

const OTHER = new Map<string, string>();
const ENGLISH = new Map<string, string>();
for (const [topic, words] of Object.entries(TOPIC_WORDS)) {
  for (const word of words.split(" ")) {
    if (OTHER.has(word)) throw Error(`topic_word_twice:${word}`);
    OTHER.set(word, topic);
  }
  for (const word of [topic, plural(topic), ...(ENGLISH_FORMS[topic]?.split(" ") ?? [])]) ENGLISH.set(word, topic);
}

/** How much of a text is read, as the rubric reads at most 6,000 characters of a card. */
const READ_LIMIT = 6000;

/** The topics a text names, split into those named in English words and those named in Portuguese or Spanish. */
function readTopics(text: string): { english: Set<string>; other: Set<string> } {
  const english = new Set<string>(), other = new Set<string>();
  for (const [word] of text.slice(0, READ_LIMIT).matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const folded = fold(word);
    if (LOWER_CASE_ONLY.has(folded) && word !== word.toLowerCase()) continue;
    const translated = OTHER.get(folded);
    if (translated) other.add(translated);
    else {
      const stated = ENGLISH.get(folded);
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
 * three. A topic the description already names in English is left to the description, so an
 * English card's own words weigh as they always have.
 */
export function fundingTopics(description: string, themes: readonly string[] = [], asks: readonly string[] = []): string[] {
  const { english, other } = readTopics(description);
  const own = new Set(themes);
  const added = [...new Set([...other, ...namedTopics(asks.join("\n"))])];
  return [...themes, ...added.filter((topic) => !own.has(topic) && !english.has(topic))];
}

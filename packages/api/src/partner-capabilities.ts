import { partnerLexicalText } from "./partner-matcher.ts";
import { partnerConcepts } from "./partner-concepts.ts";

/** What a public description says a project makes available, and the kind of work it supports. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const clauses = (text: string) => fold(text).split(/[.!?;\n]+|\bbut\b(?=\s+(?:we|they|it)\b)/u);
const NOT_PROVIDED = /\b(?:no|not|never|without|cannot|can['’]t|don['’]t|seek\w*|looking for|need(?:s|ed)?|(?:plan|hope|intend|aim)(?:s)? to|want(?:s)? to|will|using|uses?|used|buscamos|precisamos|procuramos|cherchons|sans|nao)\b/u;
const EXCLUDED_SUBJECT = /\b(?:except|excluding|other than|not for|none (?:on|for)|no longer|discontinued|unavailable)\b/u;
const affirmed = (clause: string, pattern: RegExp) => {
  const claim = pattern.exec(clause);
  return claim !== null && !NOT_PROVIDED.test(clause.slice(0, claim.index + claim[0].length));
};

export const SOFTWARE = /\b(?:tools?|tooling|app(?:s|lications?)?|software|platforms?|dashboards?|databases?|digital systems?|ferramentas?|herramientas?|aplicativos?|aplicacion(?:es)?|plataformas?|outils?|logiciels?|plateformes?)\b/iu;
const TOOL_PRODUCT = /\b(?:builds?|built|develops?|developed|makes?|maintains?|provides?|offers?|releases?|released|is an?|are an?|is building|is developing|ofrecemos|oferecemos|desenvolvemos|desarrollamos|proposons|developpons)\s+(?:(?:an?|the|our|its|una?|uma?|une?|nosso)\s+)?(?:[\p{L}-]+\s+){0,4}(?:apps?|application|platforms?|protocol|software|tools?|toolkit|dashboard|marketplace|database|wallet|ferramentas?|herramientas?|aplicativos?|aplicacion(?:es)?|plataformas?|outils?|logiciels?|plateformes?)\b/u;
const TOOL_WORKFLOW = /\b(?:communities|community groups|users|teams|organisations|organizations)\s+can\b.{0,100}\b(?:log|document|record|track)\b.{0,70}\b(?:evidence|activities|work|impact|outcomes|contributions)\b.{0,100}\b(?:review|report|share|connect)\b/u;
const TOOL_CLAIMS = [TOOL_PRODUCT, TOOL_WORKFLOW];
export const providesTool = (text: string) => clauses(text).some((clause) => TOOL_CLAIMS.some((claim) => affirmed(clause, claim)));

const TUTORING = /\b(?:tutor\w*|consultanc\w*|consultor\w*|advis(?:e|ing|ory)|asesor\w*|accompagnement|conseill\w*|formateurs?)\b/u;
const INSTRUCTION = /\b(?:training|courses?|formation|formacion|formacao|cursos?)\b/u;
const SERVICE_CLAIM = /\b(?:offer|provide|deliver|run|lead|give|host)(?:s)?\s+(?:[\p{L}-]+\s+){0,6}(?:tutor\w*|consultanc\w*|advice|training|workshops?|courses?)\b|\b(?:we|they)\s+(?:teach|tutor|advise|mentor)\b|\b(?:ofrecemos|brindamos|oferecemos|proposons|dispensons)\s+(?:[\p{L}-]+\s+){0,6}(?:asesor\w*|consultor\w*|tutor\w*|formacion|formacao|formations?|accompagnement)\b/u;
const COURSE = /\b(?:free|gratuit\w*|gratis)\s+(?:[\p{L}-]+\s+){0,4}(?:education|training|courses?|cursos?|formations?)\b/u;
export const providesInstruction = (text: string) => clauses(text).some((clause) => affirmed(clause, SERVICE_CLAIM));

const LOAN = /\b(?:loan(?:s|ing)?|lend\w*|borrow\w*|prestam\w*|emprest\w*|pret(?:er|ons|s)?)\b/u;
const LOAN_CLAIM = /\b(?:we|they)\s+(?:can\s+)?(?:lend|loan)\s+(?:(?:a|our|the)\s+)?(?:audio\w*|recorders?|equipment|gear)\b|\b(?:prestamos|emprestamos|pretons)\b|\bavailable (?:to borrow|for loans?)\b|\b(?:equipment|gear|library)\s+(?:loans?|lending)\b/u;
const RECORDERS = /\b(?:recorders?|audiomoth\w*|acoustic sensors?|gravadores?|grabadoras?|enregistreurs?)\b/u;
const AUDIOMOTH = /\baudiomoth\w*\b/u;
const STUDIO_TIME = /\b(?:recording studio time|access to (?:a |the )?recording studio)\b/u;
const STUDIO_CLAIM = /\b(?:offer|rent out|provide)(?:s)?\s+(?:[\p{L}-]+\s+){0,5}(?:studio time|recording studios?|access to (?:a |the )?studio)\b|\bstudio\s+(?:is )?available (?:for hire|to book|to rent)\b/u;

type Field = { label: string; pattern: RegExp };
const AGROFORESTRY: Field = { label: "agroforestry", pattern: /\b(?:agroforest\w*|agroflorest\w*|food forests?)\b/u };
const PERMACULTURE: Field = { label: "permaculture", pattern: /\bpermacultur\w*\b/u };
const BIODIVERSITY: Field = { label: "biodiversity", pattern: /\b(?:biodivers\w*|wildlife|vida silvestre|fauna)\b/u };
const CORAL: Field = { label: "coral nursery management", pattern: /\b(?:coral(?:s|es)?|reef\w*|recifes?|arrecifes?|recifs?)\b/u };
const CORAL_WORK = /\b(?:nurser\w*|fragment\w*|transplant\w*|viveir\w*|viver\w*|pepiniere\w*)\b/u;
const TRACEABILITY: Field = { label: "traceability", pattern: /\b(?:traceab\w*|trazab\w*|rastreab\w*|tracabil\w*)\b/u };
const CIRCULAR: Field = { label: "circular supply chains", pattern: /\b(?:recycl\w*|recicla\w*|circular (?:supply|economy|value)|residu\w*|waste)\b/u };
const TRACE = /\b(?:trace|track|rastre\w*|traz\w*)\b/u;
const RECORD_WORK = /\b(?:record\w*|document\w*|evidence|data|observations?|registr\w*|datos|dados|donnees)\b/u;
const REPORT_IMPACT = /\b(?:report\w*|relatori\w*|informes?|rapports?|dashboard\w*|kpis?|indicador\w*|indicateur\w*|document\w*|record\w*|track\w*|monitor\w*|rastre\w*|registr\w*)\b/u;
const IMPACT = /\b(?:impact\w*|outcomes?|results?|resultad\w*|resultats?|contributions?|evidence|indicators?|indicador\w*|kpis?|uptime|attendance)\b/u;
const WORK = /\b(?:work|activities|atividades|actividades|trabalho|trabajo)\b/u;
const SHOW_WORK = /\b(?:review|publish|show|share|verif\w*|mostrar|revis\w*|exibir|partilhar)\b/u;
const WORK_RECORD = /\b(?:a|an|the)\s+(?:[\p{L}-]+\s+){0,3}(?:record|report|way)\b/u;
const IMPACT_OR_WORKFLOW = new RegExp(`${IMPACT.source}|${SHOW_WORK.source}`, "u");
const COMPOST = /\b(?:compost\w*|compostag\w*)\b/u;
const FOOD_SCRAPS = /\b(?:food (?:scraps?|waste)|organic (?:scraps?|waste)|residuos? organicos?|dechets? organiques?|restos? (?:de alimentos|de comida))\b/u;
const COMPOST_OPERATION = /\b(?:we|the (?:project|facility|site|group|team))\s+(?:(?:already|currently|also|have|has)\s+)?(?:run|operat|manag|collect|process|accept|divert|compost)\w*\b/u;
const IN_OPERATION = /\b(?:this|the|our) (?:project|program(?:me)?|initiative|site|facility|hub) (?:takes? place|operat\w*|runs?|is open)\b.{0,55}\b(?:weekly|daily|every week|every day)\b/u;
const SERVICE_HISTORY = /\b(?:we (?:use|work|have|share|help|run|build|teach|manage)|work(?:s|ing)? (?:with|on|across)|run(?:s|ning)?|teach\w*|train\w*|oper\w*|provid\w*|support\w*|built|build\w*|install\w*|develop\w*|offer\w*|design\w*|set up|conduct\w*|study|studies|research\w*|measur\w*|monitor\w*|document\w*|collect\w*|record\w*|evaluat\w*|restor\w*|rehabilitat\w*|reclaim\w*|steward\w*|facilitat\w*|implement\w*|collaborat\w*|creat\w*|receiv\w*|sustain\w*|tracked|tracking|learn\w*|wir\w*|census|inventory|school program|demonstration site|through|realiza\w*|trabaj\w*|desarroll\w*|ofrec\w*|oferec\w*|trabalh\w*|pesquis\w*|formam\w*|ensen\w*|travail\w*|enseign\w*|dispens\w*|propos\w*)\b/u;
const ASSERTION_DENIED = /\b(?:not|never|no longer|cannot|can['’]t|don['’]t|looking for|seek\w*|need\w*|would like to|plan\w* to|hope\w* to|aim\w* to|intend\w* to|will (?:start|launch|build|install|offer|provide)|busca\w*|precis\w*|procur\w*|cherch\w*|ne propose pas|sans|nao)\b/u;
const ONGOING_WORK = /\b(?:our (?:ongoing|current) work is|we(?: have|['’]ve) (?:cataly[sz]ed|delivered|organized|organised))\b/u;
const PLACEHOLDER = /^(?:about the project|project (?:story|background|title|description|summary)|our (?:mission|vision)|background and origins|share your vision|share about your|inspire others|what['’]s your project called)\b/u;
const CONSTRAINT_ONLY = /^(?:not|without|except|excluding|other than|none on)\b/u;
const GENERIC_PILOT = /\b(?:communit(?:y|ies)|groups?|local partners?|users?|testers?)\b.{0,44}\b(?:pilot\w*|test (?:it|our|the)|try (?:it|our|the))\b/u;
const CHILDCARE = /\b(?:childcare|child care|day ?care|creche|garderie|guarderia)\b/u;
const CHILDCARE_PROVIDED = /\b(?:provid\w*|runs?|operat\w*|offers?|oferec\w*|ofrece\w*|propos\w*)\s+(?:(?:free|on.site|supervised|paid|a|an|the|une?)\s+){0,4}(?:childcare|child care|day ?care|creche|garderie|guarderia)\b/u;

type KnownCapability = {
  label: string;
  claims: readonly RegExp[];
} & ({ requirements: readonly RegExp[] } | { words: readonly string[] });
type GeneralCapability = {
  label: string;
  subjects: readonly string[];
  concepts: ReadonlySet<number>;
  action: RegExp;
  qualifiers: readonly RegExp[];
};
type Capability = KnownCapability | GeneralCapability | { label: string; composting: true };
const GENERIC = /^(?:with|using|des|les|une|pour|dans|nos|notre|nous|una|para|con|los|las|por|como|dos|das|uma|digital|open|source|simple|community|communities|local|services?|learning|systems?|sistemas?)$/u;

function namedSubject(text: string): string[] {
  return partnerLexicalText(text).split(" ").filter((term) =>
    term && !GENERIC.test(term) && !SOFTWARE.test(term) && !TUTORING.test(term) && !INSTRUCTION.test(term));
}

const TRAINING_WORK = /\b(?:teach\w*|train\w*|tutor\w*|mentor\w*|advis\w*|consult\w*|workshops?|courses?|education|students? learn|learners?|curriculum|classes|schools?|formation\w*|formacion|formacao|ensen\w*|ensin\w*|capacita\w*|taller\w*|cursos?|oficinas?|enseign\w*|accompagnement|pelatihan|pengajar)\b/u;
const INSTALL_WORK = /\b(?:install\w*|wire\w*|wiring|deploy\w*|maintain\w*|repair\w*|repairing|service\w*|repar\w*|manteni\w*|instal\w*|cablead\w*|dimensionn\w*)\b/u;
const RESEARCH_WORK = /\b(?:research\w*|evaluat\w*|validat\w*|measur\w*|survey\w*|monitor\w*|document\w*|tracked|tracking|study|studies|identif\w*|collect\w*|census|inventor\w*|evalu\w*|medir|analys\w*|analiz\w*)\b/u;
const ART_WORK = /\b(?:art(?:ist\w*|s)?|storytell\w*|film\w*|documentar\w*|craft\w*|music\w*|taller\w*|cine\w*|cinema\w*|kesenian)\b/u;
const PLACE_WORK = /\b(?:operat\w*|host\w*|restor\w*|reclaim\w*|rehabilitat\w*|steward\w*|liv\w*|residenc\w*)\b/u;
const TRAINING_REQUEST = /\b(?:workshops?|train(?:ers?|ing)|teach\w*|tutor\w*|mentors?|mentoring|courses?|curriculum|formation|formacion|formacao|enseign\w*|conseill\w*|accompagnement|pelatihan|pengajar|aulas?)\b/u;
const REPAIR_REQUEST = /\b(?:repair\w*|maintenance|install\w*|mantenim\w*|manutenc\w*|instal\w*|cablead\w*)\b/u;
const RESEARCH_REQUEST = /\b(?:researchers?|evaluators?|validate|verify|measure|identify|study|studied|survey\w*|evaluation|medir|evaluation|medicao|pesquisa\w*|investigaci\w*)\b/u;
const HEADING_NOISE = new Set(`about across activities activity action among anyone area asked based building can capacity clear community communities
  could doing field first groups hands help here ideas impact initial initiative kind know knowledge lead local model need needs
  new on-site operating operational others outcomes people place practical program programme project provide qualified ready
  related relevant runs same share shared simple someone specific started starting support team teams tool trial using want way
  work working would years young youth en que con por del son sus una los las para como han quien quién donde desde durante
  nossos nossa das dos pelos pela seja quem uma precisamos precisamo queremos apoiadores buscamos procuramos nous notre les des
  qui aux pour dans sur une cette leur sont avec chez faut leurs yang kami untuk dapat dalam pada bisa dari area mitra butuh mereka`.split(/\s+/u));
const SUBJECT_NOISE = /^(?:run\w*|partner\w*|training|trainers?|teach\w*|mentors?|mentoring|cursos?|formations?|formaci[oó]n|forma[cç][aã]o|teach\w*|co|help\w*|free|access|loan\w*|borrow\w*|lent|using|verification|specialists?|experts?|design\w*|local\w*)$/u;
// Phrases represent the same work, including common translations of the subject rather than just of the verb.
const SUBJECTS: readonly [string, RegExp][] = [
  ["river restoration", /\b(?:river restoration|riparian restoration|stream rehabilitation|restor\w* (?:urban )?rivers?|river (?:revival|recovery)|reclaim\w*.{0,28}waterways?|restaur\w*.{0,18}(?:rio|rios|rivieres?))\b/u],
  ["bioacoustics", /\b(?:bioacoustic\w*|ecoacoustic\w*|acoustic (?:monitoring|surveys?|baseline)|bird.calls?|identify\w*.{0,22}(?:bird|wildlife) sounds?)\b/u],
  ["conservation", /\b(?:conservation\w*|conservacao|conservacion|ecological restoration)\b/u],
  ["school", /\b(?:schools?|students?|pupils?|classrooms?|alunos?|escolas?|ecoles?)\b/u],
  ["art", /\b(?:art(?:s|ist\w*)?|arte\w*|kesenian)\b/u],
  ["community arts", /\b(?:arte comunitari\w*|community arts?|artists?.{0,32}(?:youth|community)|community.{0,35}(?:artists?|art))\b/u],
  ["medicinal plants", /\b(?:medicinal plants?|plantas? medicin\w*)\b/u],
  ["climate monitoring with AI", /\b(?:(?:ai|inteligente|\w*geoai)\w*\b.{0,32}\b(?:climate monitoring|monitor\w* clim[aá]tic\w*)|monitor\w* clim[aá]tic\w*\b.{0,26}\b(?:inteligente|ia))\b/u],
  ["web3", /\b(?:web3|blockchain)\b/u],
  ["solar", /\b(?:solar\w*|photovolta\w*|fotovolta\w*)\b/u],
  ["housing", /\b(?:housing|habita\w*|vivien\w*|co.living|logements?)\b/u],
  ["documentary", /\b(?:documentar\w*|filmmak\w*|film (?:training|education|production)|audiovisual\w*)\b/u],
  ["seed saving", /\b(?:seed saving|seed banks?|seed librar\w*|seed collection\w*|preserv\w*.{0,16}seeds?|seed conservation)\b/u],
  ["fundraising", /\b(?:fundrais\w*|rais\w* funds|bake sale\w*)\b/u],
  ["wood construction", /\b(?:carpentr\w*|timber construction|wood construction|timber framing)\b/u],
  ["forest inventory", /\b(?:forest inventory|inventory tree stands|count\w* (?:every |all )?trees?|census farming residents)\b/u],
  ["nocturnal wildlife acoustics", /\b(?:nocturnal urban wildlife|after.dark city animals|nighttime wildlife)\b/u],
  ["cattle traceability", /\b(?:trazab\w*.{0,30}(?:contratos|engorda)|contratos.{0,105}trazab\w*|cattle.{0,30}traceability)\b/u],
];
// These terms name the deliverable or method, so overlap on its setting or participants cannot substitute.
const REQUIRED_QUALIFIERS = [
  /\b(?:grey.?water|gray.?water|aguas? gri[sz]es?|eaux? grises?)\b/u,
  /\b(?:classifi(?:er|cat[eo]r)\w*|classification model|automated.{0,24}(?:identifi|classifi)\w*)\b/u,
  /\b(?:legal counsel|legal advice|assessoria juridica|asesoria legal)\b/u,
  /\b(?:amphibi\w*|anfibi\w*)\b/u,
  /\b(?:reptil\w*)\b/u,
  /\b(?:mammal\w*|mamifer\w*)\b/u,
];

function subjectTerms(text: string): Set<string> {
  const normalized = fold(text);
  const words = namedSubject(normalized.replace(/[-–—]/gu, " "));
  const terms = new Set(words.filter((word) => !HEADING_NOISE.has(word) && !SUBJECT_NOISE.test(word)
    && /\p{L}/u.test(word)).map((word) => word.replace(/(?:s|ed|ing)$/u, "")));
  for (const [name, pattern] of SUBJECTS) if (pattern.test(normalized)) terms.add(name);
  return terms;
}

/** An open pilot invitation can use evidence of work at a suitable site. A named activity still needs its own proof. */
export function wantsGeneralPilot(title: string, description: string, initiative: string): boolean {
  const name = fold(initiative);
  const heading = name ? fold(title).replace(name, "") : fold(title);
  if (!GENERIC_PILOT.test(heading)) return false;
  const detail = fold(description).replace(/\b(?:test|try|trial|pilot)(?:ing)?\b/gu, "");
  if (SUBJECTS.some(([, term]) => term.test(detail))) return false;
  const words = subjectTerms(heading);
  return [...words].every((word) => ["pilot", "try", "test", "hub", "model", "feedback", "give", "honest"].includes(word));
}

function generalCapability(title: string, description: string): GeneralCapability | null {
  const heading = fold(title);
  const detail = fold(description);
  const text = `${heading}. ${detail}`;
  let subjects = [...subjectTerms(heading)];
  if (!subjects.length || subjects.every((word) => ["hub", "workshop", "school", "partner", "session", "program"].includes(word))) {
    subjects = [...subjectTerms(detail)];
  }
  const concepts = new Set(partnerConcepts(`${title}. ${description}`).keys());
  if (!subjects.length && !concepts.size) return null;
  const action = TRAINING_REQUEST.test(heading) ? TRAINING_WORK
    : REPAIR_REQUEST.test(heading) ? INSTALL_WORK
    : RESEARCH_REQUEST.test(heading) ? RESEARCH_WORK
    : ART_WORK.test(heading) ? ART_WORK
    : /\b(?:residencies|host site|river restoration pilot)\b/u.test(text) ? PLACE_WORK
    : SERVICE_HISTORY;
  return { label: "the requested work", subjects, concepts, action,
    qualifiers: REQUIRED_QUALIFIERS.filter((pattern) => pattern.test(heading)) };
}

/** A rule binds an explicit deliverable or service to the function and subject the request names. */
export function requestedCapability(title: string, description: string, wantsSoftware: boolean): Capability | null {
  const text = fold(`${title}. ${description}`);
  const words = namedSubject(title);
  if (LOAN.test(text) && RECORDERS.test(text)) {
    return { label: "acoustic equipment lending", claims: [LOAN_CLAIM], requirements: [AUDIOMOTH.test(text) ? AUDIOMOTH : RECORDERS] };
  }
  if (STUDIO_TIME.test(text)) return { label: "recording studio access", claims: [STUDIO_CLAIM], requirements: [] };
  if (CHILDCARE.test(fold(title)) && !TRAINING_REQUEST.test(fold(title).split(CHILDCARE)[0]!)) {
    return { label: "childcare provision", claims: [CHILDCARE_PROVIDED], requirements: [] };
  }
  if (COMPOST.test(text) && ((FOOD_SCRAPS.test(text) && /\b(?:processing|facility|site|accept|collecting)\b/u.test(text))
      || /\b(?:community compost\w*|weekly compost\w*)\b/u.test(text) && TRAINING_REQUEST.test(fold(title)))) {
    return { label: "community composting", composting: true };
  }
  if (TUTORING.test(text) || INSTRUCTION.test(fold(title))) {
    const subject = [AGROFORESTRY, PERMACULTURE].find(({ pattern }) => pattern.test(text));
    if (subject) return { label: `${subject.label} instruction or advice`, claims: [SERVICE_CLAIM, COURSE], requirements: [subject.pattern] };
    if (TUTORING.test(fold(title)) && words.length) return { label: "instruction or advice", claims: [SERVICE_CLAIM], words };
  }
  const impact = REPORT_IMPACT.test(text) && (IMPACT.test(text) || (WORK.test(text) && SHOW_WORK.test(text)));
  if (!wantsSoftware && !(impact && WORK_RECORD.test(fold(title)))) return generalCapability(title, description);
  if (CORAL.pattern.test(text) && CORAL_WORK.test(text)) {
    return { label: CORAL.label, claims: TOOL_CLAIMS, requirements: [CORAL.pattern, CORAL_WORK] };
  }
  const circular = CIRCULAR.pattern.test(text);
  if (TRACEABILITY.pattern.test(text) || (circular && TRACE.test(text))) {
    return { label: circular ? "traceability for circular supply chains" : TRACEABILITY.label, claims: TOOL_CLAIMS,
      requirements: circular ? [TRACEABILITY.pattern, CIRCULAR.pattern] : [TRACEABILITY.pattern] };
  }
  if (BIODIVERSITY.pattern.test(text) && RECORD_WORK.test(text)) {
    return { label: "biodiversity data tools", claims: TOOL_CLAIMS, requirements: [BIODIVERSITY.pattern, RECORD_WORK] };
  }
  if (impact) {
    return { label: "impact tracking and reporting", claims: TOOL_CLAIMS, requirements: [IMPACT_OR_WORKFLOW, REPORT_IMPACT] };
  }
  return words.length ? { label: "tool for the requested work", claims: TOOL_CLAIMS, words } : null;
}

/** The displayed evidence must contain the claim and all the requested capability's details. */
export function showsCapability(text: string, capability: Capability, title = "", explicitOffer = false): boolean {
  if ("composting" in capability) {
    return clauses(text).some((clause) => !ASSERTION_DENIED.test(clause) && (
      (FOOD_SCRAPS.test(clause) && COMPOST.test(clause) && COMPOST_OPERATION.test(clause))
      || (COMPOST.test(fold(title)) && IN_OPERATION.test(clause))
    ));
  }
  if ("action" in capability) {
    return clauses(text).some((clause) => {
      if (PLACEHOLDER.test(clause.trim()) || CONSTRAINT_ONLY.test(clause.trim()) || ASSERTION_DENIED.test(clause)
          || !capability.qualifiers.every((pattern) => pattern.test(clause))
          || EXCLUDED_SUBJECT.test(clause)) return false;
      const active = SERVICE_HISTORY.test(clause) || ONGOING_WORK.test(clause);
      if (!explicitOffer && (!active || (capability.action !== SERVICE_HISTORY && !capability.action.test(clause)))) return false;
      const stated = subjectTerms(clause);
      const anchors = capability.subjects.filter((word) => stated.has(word));
      const matchesConcept = capability.concepts.size > 0 && [...partnerConcepts(clause).keys()].some((id) => capability.concepts.has(id));
      const sharedActivity = ["river restoration", "bioacoustics", "web3", "fundraising", "wood construction", "forest inventory",
        "nocturnal wildlife acoustics", "cattle traceability", "community arts", "climate monitoring with AI"].some((name) => anchors.includes(name));
      return matchesConcept || sharedActivity || anchors.length >= Math.min(2, Math.max(1, capability.subjects.length));
    });
  }
  return clauses(text).some((clause) => {
    if (EXCLUDED_SUBJECT.test(clause) || !capability.claims.some((claim) => affirmed(clause, claim))) return false;
    if ("requirements" in capability) return capability.requirements.every((term) => term.test(clause));
    const { words } = capability;
    const stated = new Set(namedSubject(clause));
    return words.filter((word) => stated.has(word)).length >= Math.min(2, words.length);
  });
}

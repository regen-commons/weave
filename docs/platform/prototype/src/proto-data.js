/* Weave prototype: fictional example content. Every organisation, fund, place name and person here is invented for the prototype. Nothing is fetched or stored. */
window.WeaveData = (function () {
  const capitals = [
    { key: "living", glyph: "Li", label: "Living", plain: "Land and living things", example: "Land, water, seeds, soil", tip: "Living: land, water, seeds, soil and the species that depend on them." },
    { key: "material", glyph: "Ma", label: "Material", plain: "Tools and things", example: "Tools, buildings, vehicles", tip: "Material: tools, equipment, buildings, vehicles and materials." },
    { key: "intellectual", glyph: "In", label: "Intellectual", plain: "Knowledge", example: "Research, data, methods", tip: "Intellectual: what is known and written down, such as research, data, maps and methods." },
    { key: "experiential", glyph: "Ex", label: "Experiential", plain: "Skills and know-how", example: "Training, crafts, practice", tip: "Experiential: what people know how to do, learned by doing, such as crafts, farming and facilitation." },
    { key: "social", glyph: "So", label: "Social", plain: "Relationships", example: "Introductions, partners, hosts", tip: "Social: relationships and trust, such as introductions, partners, volunteers and fiscal hosts." },
    { key: "financial", glyph: "Fi", label: "Financial", plain: "Money", example: "Grants, loans, donations", tip: "Financial: money in any form, such as grants, loans, donations and payment." },
    { key: "cultural", glyph: "Cu", label: "Cultural", plain: "Culture and story", example: "Stories, art, music, language", tip: "Cultural: shared stories, art, music, language and the practices that carry them." },
    { key: "spiritual", glyph: "Sp", label: "Spiritual", plain: "Care and spirit", example: "Care, ritual, meaning", tip: "Spiritual: care, ritual, meaning and a felt connection to place." },
  ];

  const stages = {
    seed: "Just starting",
    sprout: "Getting going",
    flowering: "Up and running",
    tree: "Long established",
  };
  const stageTips = {
    seed: "Just starting: an idea, a first season, a few people.",
    sprout: "Getting going: regular work and first results, not steady yet.",
    flowering: "Up and running: steady work with a track record.",
    tree: "Long established: many years in, and others learn from you.",
  };

  const lenses = ["Place-based community", "Research", "Art and culture", "Technology", "Funders"];
  const lensInfo = {
    "Place-based community": { icon: "place", tip: "Groups rooted in one place, caring for its land and its people." },
    Research: { icon: "rcp-research", tip: "Studies, data and monitoring, often with communities." },
    "Art and culture": { icon: "rcp-culture", tip: "Art, story, music and the culture of a place." },
    Technology: { icon: "device", tip: "Tools, software, energy and other technology for the work." },
    Funders: { icon: "funding", tip: "Groups that give or move money to this kind of work." },
  };

  // At most five needs and five offers, so each initiative leads with what matters most.
  const limits = { need: 5, offer: 5 };

  const terms = {
    gift: "Gift",
    exchange: "Exchange",
    paid: "Paid",
    commitment: "A promise for later",
    open: "Open to anything",
  };

  const scopes = { here: "Here", region: "Our region", anywhere: "Anywhere" };

  // Ana's initiative, the one the walkthrough describes.
  const me = {
    name: "Guardiãs das Nascentes do Alto Rio das Almas",
    locations: ["Alto Rio das Almas, Goiás, Brazil"],
    description:
      "We protect the springs above our town. Forty families keep cattle away from the water, plant native trees along the banks and teach the school children where their water comes from. We want to restore four more hectares before the next rains.",
    spoken:
      "We are the Guardiãs das Nascentes, a group of families in the upper Rio das Almas, in Goiás. We look after the springs above the town, keep the cattle out, plant native trees, and the kids from the school come up with us. We need seedlings for four hectares, someone who can map the water, and fencing we cannot pay for yet.",
    links: ["guardiasdasnascentes.org.br", "instagram.com/guardiasdasnascentes"],
    scene: "springs",
    derived: {
      stage: "sprout",
      lenses: ["Place-based community"],
      themes: ["Springs and watershed restoration", "Agroforestry", "Community land stewardship"],
      places: [
        { kind: "Bioregion", name: "Cerrado Savannas" },
        { kind: "Watershed", name: "Rio das Almas, Tocantins basin" },
        { kind: "Country", name: "Brazil" },
      ],
      beneficiaries: "Forty families and the town school",
      languages: ["Portuguese"],
      scale: "Four hectares, one town",
    },
    needs: [
      {
        id: "n1",
        title: "Native seedlings for four hectares",
        line: "About 6,000 seedlings of species from the upper valley, ready before the rains.",
        capitals: ["living"],
        kept: true,
        scope: "region",
        when: "By October 2027",
        terms: ["gift", "exchange"],
        use: "To replant the banks of three springs.",
      },
      {
        id: "n2",
        title: "A hydrologist to map the springs",
        line: "Someone who can map where the water comes from and goes, with us, over a season.",
        capitals: ["intellectual", "experiential"],
        kept: false,
        scope: "anywhere",
        when: "In the dry season, May to September 2027",
        terms: ["exchange", "paid"],
        use: "So we know which springs to protect first.",
      },
      {
        id: "n3",
        title: "R$ 60,000 for fencing",
        line: "Posts and wire to keep cattle away from three springs while the seedlings take hold.",
        capitals: ["financial", "material"],
        amount: "R$ 60,000",
        kept: false,
        scope: "here",
        when: "Before October 2027",
        terms: ["gift"],
        use: "Fencing along the upper valley, agreed with the neighbouring farms.",
      },
    ],
    offers: [
      {
        id: "o1",
        title: "Spring-mapping walks for visiting groups",
        line: "A day walking the springs with the families who care for them.",
        capitals: ["experiential", "social"],
        kept: true,
        capacity: "Two groups a year",
        scope: "here",
        terms: ["exchange", "paid"],
        who: "Schools, researchers and other community groups",
      },
      {
        id: "o2",
        title: "A meeting place by the springs for thirty people",
        line: "A shaded clearing with a kitchen and water, for workshops and gatherings.",
        capitals: ["living", "material"],
        kept: false,
        capacity: "Up to thirty people, by arrangement",
        scope: "here",
        terms: ["exchange", "gift"],
        who: "Groups doing work in the basin",
      },
      {
        id: "o3",
        title: "Songs and stories of the water guardians",
        line: "An evening of the songs the older women sing at the springs, and the stories behind them.",
        capitals: ["cultural", "spiritual"],
        kept: false,
        capacity: "A few times a year",
        scope: "region",
        terms: ["gift", "exchange"],
        who: "Festivals, schools and gatherings",
      },
      {
        id: "o4",
        title: "A monthly care practice at the springs, open to visitors",
        line: "The first Sunday of each month we clean the springs together and sit with the water.",
        capitals: ["spiritual", "social"],
        kept: false,
        capacity: "Monthly",
        scope: "here",
        terms: ["gift"],
        who: "Anyone who comes with respect",
      },
    ],
  };

  // The same initiative with very long content, for the long-content state.
  const meLong = Object.assign({}, me, {
    name: "Associação Comunitária das Guardiãs das Nascentes do Alto Rio das Almas e dos Córregos Seco, Fundo e das Pedras",
    locations: [
      "Alto Rio das Almas, Goiás, Brazil",
      "Córrego Seco, Goiás, Brazil",
      "Córrego do Fundo, Goiás, Brazil",
      "Córrego das Pedras, Goiás, Brazil",
      "Serra Azul, Goiás, Brazil",
      "Pirenópolis, Goiás, Brazil",
      "Cocalzinho de Goiás, Brazil",
    ],
    description:
      "Protegemos as nascentes acima da nossa cidade. Quarenta famílias mantêm o gado longe da água, plantam árvores nativas ao longo das margens e ensinam as crianças da escola de onde vem a água que bebem. Desde 2019 recuperamos onze nascentes e dois quilómetros de mata ciliar, com mutirões mensais, sementes recolhidas no próprio vale e um viveiro comunitário que hoje produz cerca de três mil mudas por ano. Queremos recuperar mais quatro hectares antes das próximas chuvas, estender o trabalho aos córregos vizinhos e documentar o que aprendemos para que outras comunidades do Cerrado possam fazer o mesmo.",
    links: [
      "guardiasdasnascentes.org.br",
      "instagram.com/guardiasdasnascentes",
      "youtube.com/@guardiasdasnascentesaltoriodasalmas",
      "drive.example.org/relatorio-anual-2025-guardias-das-nascentes",
    ],
    derived: Object.assign({}, me.derived, {
      lenses: ["Place-based community", "Art and culture", "Research"],
      themes: [
        "Springs and watershed restoration",
        "Agroforestry",
        "Community land stewardship",
        "Environmental education",
        "Native seed collection",
        "Community nurseries",
        "Riparian forest",
        "Water governance",
        "Cerrado conservation",
        "Traditional knowledge",
        "Women-led organising",
        "Youth participation",
      ],
      places: [
        { kind: "Bioregion", name: "Cerrado Savannas" },
        { kind: "Watershed", name: "Rio das Almas, Tocantins basin" },
        { kind: "Watershed", name: "Córrego Seco, Tocantins basin" },
        { kind: "Watershed", name: "Rio Corumbá, Paraná basin" },
        { kind: "Country", name: "Brazil" },
      ],
      languages: ["Portuguese", "Spanish"],
    }),
  });

  const partners = [
    {
      id: "p1",
      name: "Serra Azul Agroforestry School",
      longName: "Escola de Agrofloresta e Saberes do Cerrado da Serra Azul e Região do Alto Tocantins",
      scene: "forest",
      place: "Rio das Almas basin, Brazil",
      country: "Brazil",
      stage: "flowering",
      lenses: ["Place-based community", "Research"],
      description:
        "A school on a restored farm where families from the basin learn to plant food forests. Runs a nursery of native species and a two-year course for young farmers.",
      links: ["serraazul.example.org"],
      fit: "strong",
      reasons: [
        { icon: "watershed", text: "Works in the same basin as you." },
        { icon: "offer", text: "Offers native seedlings, which you need." },
        { icon: "need", text: "Needs a venue for thirty people, which you offer." },
      ],
      needs: [
        { title: "A venue in the upper valley for field days", capitals: ["living"] },
        { title: "Co-applicants for a basin restoration grant", capitals: ["social"] },
      ],
      offers: [
        { title: "Native seedlings, 20,000 a year", capitals: ["living"] },
        { title: "Agroforestry training for families", capitals: ["experiential", "intellectual"] },
      ],
      confirmed: "18 October 2026",
      wantsYourOffer: true,
    },
    {
      id: "p2",
      name: "Cooperativa de Mulheres Coletoras de Sementes do Vale do Paranã",
      longName: "Cooperativa de Mulheres Coletoras de Sementes e Saberes Tradicionais do Vale do Paranã e Chapada dos Veadeiros",
      scene: "seeds",
      place: "Paranã valley, Brazil",
      country: "Brazil",
      stage: "seed",
      lenses: ["Place-based community", "Art and culture"],
      description:
        "Eighteen women who collect, clean and sell native Cerrado seed for restoration, and keep the songs that go with each species.",
      links: ["sementesdoparana.example.org"],
      fit: "good",
      stewardPick: true,
      reasons: [
        { icon: "need", text: "Needs a hydrologist too, so you could share one." },
        { icon: "offer", text: "Offers native seed, which your seedlings need." },
      ],
      needs: [
        { title: "A hydrologist to map the Paranã springs", capitals: ["intellectual"] },
        { title: "A place to run a seed fair", capitals: ["living", "material"] },
      ],
      offers: [
        { title: "Native Cerrado seed by the kilo", capitals: ["living", "material"] },
        { title: "Seed songs and stories", capitals: ["cultural"] },
      ],
      confirmed: "27 October 2026",
      wantsYourOffer: true,
    },
    {
      id: "p3",
      name: "Basin Mappers Collective",
      longName: "Basin Mappers Collective for Community Hydrology and Open Watershed Data",
      scene: "map",
      place: "Several places",
      country: "Several countries",
      stage: "tree",
      lenses: ["Research", "Technology"],
      description:
        "Hydrologists and mapmakers who work with communities to map their springs and rivers, and publish the maps as open data.",
      links: ["basinmappers.example.org"],
      fit: "possible",
      stale: "March 2026",
      reasons: [{ icon: "offer", text: "Offers watershed mapping, which you need." }],
      needs: [{ title: "Communities to pilot a spring survey method", capitals: ["social", "living"] }],
      offers: [
        { title: "Watershed mapping with communities", capitals: ["intellectual", "experiential"] },
        { title: "Open spring data for grant applications", capitals: ["intellectual"] },
      ],
      confirmed: "3 March 2026",
      wantsYourOffer: false,
    },
  ];

  const opportunities = [
    {
      id: "f1",
      title: "US$ 25,000 from the Headwaters Commons Fund",
      funder: "Headwaters Commons Fund",
      amount: "US$ 25,000",
      closes: "30 November 2026",
      closesISO: "2026-11-30",
      route: "Online form, in Portuguese or English",
      fit: "good",
      reasons: [
        { icon: "watershed", text: "Funds spring and watershed restoration in Brazil." },
        { icon: "need", text: "Covers fencing and planting, which you need money for." },
      ],
      eligibility: [
        "Registered organisations with two years of accounts, or an unregistered group applying with one.",
        "Work in Brazil, Colombia or Peru.",
        "Grants of US$ 10,000 to US$ 30,000 over one year.",
      ],
      gap: "a registered partner with two years of accounts",
      asks: [
        { id: "f1a", label: "A registered partner with two years of accounts", candidates: [{ id: "p1", why: "Registered association with four years of accounts" }, { id: "p3", why: "Registered nonprofit with accounts since 2016" }] },
        { id: "f1b", label: "A co-applicant working in Colombia or Peru", candidates: [] },
      ],
      partner: "p1",
      pairFit: "strong",
      pairReasons: [
        "Serra Azul is a registered association with four years of accounts, which this fund asks for.",
        "You bring the springs and the families. They bring the seedlings and the paperwork.",
      ],
      confirmed: "12 October 2026",
    },
    {
      id: "f2",
      title: "R$ 150,000 from the Fundo Cerrado Vivo",
      funder: "Fundo Cerrado Vivo",
      amount: "R$ 150,000",
      closes: "15 January 2027",
      closesISO: "2027-01-15",
      route: "Proposal by email, in Portuguese",
      fit: "strong",
      reasons: [
        { icon: "place", text: "Funds community work in the Cerrado, where you are." },
        { icon: "offer", text: "Values traditional knowledge and women-led groups." },
      ],
      eligibility: [
        "Community groups in the Cerrado biome, registered or with a fiscal host.",
        "A research or monitoring partner is required.",
        "Grants of R$ 50,000 to R$ 200,000 over two years.",
      ],
      gap: "a research or monitoring partner",
      asks: [
        { id: "f2a", label: "A research or monitoring partner", candidates: [{ id: "p3", why: "Monitors springs and publishes open data" }] },
        { id: "f2b", label: "A fiscal host in the Cerrado, if you are not registered", candidates: [{ id: "p1", why: "Hosts funds for groups in the basin" }] },
      ],
      partner: "p3",
      pairFit: "good",
      pairReasons: [
        "Basin Mappers Collective would be the monitoring partner this fund requires.",
        "Their open spring data would also serve your other applications.",
      ],
      confirmed: "29 October 2026",
    },
    {
      id: "f3",
      title: "€ 40,000 from the Living Waters Culture Prize",
      funder: "Living Waters Culture Prize",
      amount: "€ 40,000",
      closes: "28 February 2027",
      closesISO: "2027-02-28",
      route: "Nomination by a partner organisation",
      fit: "possible",
      reasons: [
        { icon: "offer", text: "Rewards story and song practices tied to water, which you offer." },
      ],
      eligibility: [
        "Cultural practices connected to a river or spring.",
        "Nominated by an organisation in a second country.",
        "One prize of € 40,000 and four of € 5,000.",
      ],
      gap: "a nominating organisation in another country",
      asks: [{ id: "f3a", label: "A nominating organisation in another country", candidates: [{ id: "d5", why: "Based in Costa Rica, a second country" }] }],
      partner: null,
      pairFit: null,
      pairReasons: [],
      confirmed: "20 October 2026",
    },
    {
      id: "f4",
      title: "R$ 30,000 from the Tocantins Basin Facility",
      funder: "Tocantins Basin Facility",
      amount: "R$ 30,000",
      closes: "31 March 2027",
      closesISO: "2027-03-31",
      route: "Online form, in Portuguese",
      fit: "good",
      reasons: [{ icon: "watershed", text: "Small grants for groups in the Tocantins basin." }],
      eligibility: ["Groups working in the Tocantins basin.", "Grants up to R$ 30,000."],
      gap: null,
      asks: [],
      partner: null,
      pairFit: null,
      pairReasons: [],
      confirmed: "5 October 2026",
    },
    {
      id: "f5",
      title: "R$ 8,000 from the Cerrado Seed Network micro-grants",
      funder: "Cerrado Seed Network",
      amount: "R$ 8,000",
      closes: "Rolling, next review 1 December 2026",
      closesISO: "2026-12-01",
      route: "Short form, in Portuguese",
      fit: "possible",
      reasons: [{ icon: "need", text: "Pays for seed and seedlings, which you need." }],
      eligibility: ["Members of the network, or groups applying with a member."],
      gap: "a member of the network to apply with",
      asks: [{ id: "f5a", label: "A member of the network to apply with", candidates: [{ id: "p2", why: "A member of the network since 2023" }] }],
      partner: "p2",
      pairFit: "good",
      pairReasons: ["The seed cooperative is a member and could apply with you."],
      confirmed: "22 October 2026",
    },
  ];

  const directory = [
    partners[0],
    partners[1],
    partners[2],
    {
      id: "d4",
      name: "Tech and Sun Lagoon Cooperative",
      longName: "Tech and Sun Lagoon Cooperative for Solar Fishing Lights and Mangrove Care",
      place: "Lagos lagoon, Nigeria",
      country: "Nigeria",
      stage: "sprout",
      lenses: ["Technology", "Place-based community"],
      scene: "lagoon",
      links: ["techandsun.example.org"],
      description: "Fishing families replacing kerosene lamps with solar lights and replanting the mangroves the lagoon has lost.",
      needs: [{ title: "A fiscal host for a first grant", capitals: ["social", "financial"] }],
      offers: [{ title: "Solar light assembly training", capitals: ["experiential", "material"] }],
      confirmed: "25 October 2026",
    },
    {
      id: "d5",
      name: "Casa das Águas Vivas",
      place: "Río Savegre, Costa Rica",
      country: "Costa Rica",
      stage: "flowering",
      lenses: ["Art and culture", "Place-based community"],
      scene: "river",
      links: ["aguasvivas.example.org"],
      description: "A river house where artists, farmers and scientists share a season of work on the Savegre.",
      needs: [{ title: "A storyteller in residence for three months", capitals: ["cultural"] }],
      offers: [{ title: "A residency with board and a studio", capitals: ["living", "material"] }],
      confirmed: "9 October 2026",
    },
    {
      id: "d6",
      name: "Delta Mangrove Guardians",
      place: "Niger delta, Nigeria",
      country: "Nigeria",
      stage: "seed",
      lenses: ["Place-based community"],
      scene: "mangrove",
      description: "Young people from three villages restoring mangrove creeks and recording the species that return.",
      needs: [{ title: "Boats and waders for creek work", capitals: ["material"] }],
      offers: [{ title: "Monthly creek bird counts", capitals: ["intellectual"] }],
      confirmed: "30 October 2026",
    },
    {
      id: "d7",
      name: "Pampa Seed Keepers",
      place: "Rio Grande do Sul, Brazil",
      country: "Brazil",
      stage: "tree",
      lenses: ["Research", "Place-based community"],
      scene: "grassland",
      description: "A thirty-year-old network of farmers keeping native grassland seed and the knowledge to use it.",
      imported: true,
      needs: [],
      offers: [{ title: "Grassland seed and advice", capitals: ["living", "intellectual"] }],
      confirmed: null,
    },
  ];

  const photos = {
    springs: { file: "img/springs.jpg", by: "@jballa", page: "https://unsplash.com/photos/green-trees-near-body-of-water-during-daytime-ct2IYdlx33g", alt: "A clear stream among rocks and trees in savanna country" },
    forest: { file: "img/forest.jpg", by: "@kawerodriguess", page: "https://unsplash.com/photos/a-narrow-dirt-path-through-a-dense-green-plantation-wWlbpQH81dk", alt: "A dirt path through a dense, green plantation of trees" },
    seeds: { file: "img/seeds.jpg", by: "Jonathan Kemper", page: "https://unsplash.com/photos/person-holding-brown-and-black-plant-aP6WE14v_ow", alt: "Hands holding a pile of dark seeds" },
    map: { file: "img/mapping.jpg", by: "@photoken123", page: "https://unsplash.com/photos/aerial-view-of-a-winding-river-through-dry-brush-hvdjdX1UGgM", alt: "A winding river through dry brush, seen from above" },
    lagoon: { file: "img/lagoon.jpg", by: "Greg Keelen", page: "https://unsplash.com/photos/a-fisherman-casts-his-net-on-the-water-DZMmcKTZCbA", alt: "A fisher casting a net from a small boat on calm water" },
    river: { file: "img/river.jpg", by: "Wietse Jongsma", page: "https://unsplash.com/photos/thatched-roof-huts-nestled-in-a-lush-jungle-setting-yBjWxjjghzQ", alt: "Thatched huts among tall forest by a river" },
    mangrove: { file: "img/mangrove.jpg", by: "LARAM", page: "https://unsplash.com/photos/mangrove-trees-with-exposed-roots-in-shallow-water-Hp36E2R7VtE", alt: "Mangrove trees with roots standing in shallow water" },
    grassland: { file: "img/grassland.jpg", by: "@luciano_a", page: "https://unsplash.com/photos/grass-field-under-cloudy-sky-during-daytime-YCI4DkADQGc", alt: "Open grassland under a wide, cloudy sky" },
    nursery: { file: "img/nursery.jpg", by: "Markus Spiske", page: "https://unsplash.com/photos/selective-focus-photo-of-plant-spouts-vrbZVyX2k4I", alt: "Rows of young seedlings in a tray" },
    planting: { file: "img/planting.jpg", by: "@vitormonthay", page: "https://unsplash.com/photos/person-holding-brown-dried-plant-EkEdHarUPTs", alt: "A hand setting a young tree into the ground" },
  };

  // The conversation for each step: the assistant's short questions and the example answers, spoken or typed.
  const convo = {
    initiative: [
      { from: "assistant", text: "Tell me about your initiative. What is it called, where do you work, and what do you do?" },
      { from: "person", via: "voice", text: "We are the Guardiãs das Nascentes, a group of families in the upper Rio das Almas, in Goiás. We look after the springs above the town, keep the cattle out, plant native trees, and the kids from the school come up with us." },
      { from: "assistant", text: "How long have you been at it, and who takes part?" },
      { from: "person", via: "typed", text: "Since 2019. Forty families, and the school comes up every month." },
      { from: "assistant", text: "Anything to add? A deck or a website helps me get the details right." },
      { from: "person", via: "attach", attachments: [{ kind: "file", name: "guardias-deck.pdf", size: "4.2 MB", note: "12 pages, read on this device" }, { kind: "link", name: "guardiasdasnascentes.org.br", note: "Preview fetched" }] },
      { from: "assistant", text: "That is enough to build your card. Add more any time, or build it now." },
    ],
    need: [
      { from: "assistant", text: "What would unlock the next chapter? Name up to five things." },
      { from: "person", via: "voice", text: "We need seedlings for four hectares, someone who can map the water, and fencing we cannot pay for yet." },
      { from: "assistant", text: "I made three cards. Money is one of eight kinds of support. Is anything else missing, like people, land or tools?" },
    ],
    offer: [
      { from: "assistant", text: "What do you have that others could use?" },
      { from: "person", via: "voice", text: "People come to walk the springs with us. We have a clearing where thirty can meet, the older women sing the water songs, and on the first Sunday we clean the springs together." },
      { from: "assistant", text: "I made four cards. Culture and care count too. Anything else?" },
    ],
  };

  const previews = {
    "guardiasdasnascentes.org.br": { title: "Guardiãs das Nascentes", text: "Quarenta famílias cuidando das nascentes do Alto Rio das Almas.", scene: "springs" },
    "instagram.com/guardiasdasnascentes": { title: "@guardiasdasnascentes on Instagram", text: "Mutirões, mudas e canções da água. 1,240 followers.", scene: "forest" },
    "serraazul.example.org": { title: "Serra Azul Agroforestry School", text: "Courses, nursery and field days in the Rio das Almas basin.", scene: "forest" },
    "sementesdoparana.example.org": { title: "Sementes do Paranã", text: "Native Cerrado seed, collected and cleaned by eighteen women.", scene: "seeds" },
    "basinmappers.example.org": { title: "Basin Mappers Collective", text: "Open maps of springs and rivers, made with the people who live by them.", scene: "map" },
    "techandsun.example.org": { title: "Tech and Sun Lagoon Cooperative", text: "Solar fishing lights and mangrove nurseries on the lagoon.", scene: "lagoon" },
    "aguasvivas.example.org": { title: "Casa das Águas Vivas", text: "Residencies on the Savegre for artists, farmers and scientists.", scene: "river" },
  };

  const ledger = [
    { when: "1 November 2026, 14:02", what: "Your initiative, step 1", where: "On this device", words: 0 },
    { when: "1 November 2026, 14:06", what: "Your needs, step 2", where: "On this device", words: 0 },
    { when: "1 November 2026, 14:11", what: "Your offers, step 3", where: "Cloud assistant, with your consent", words: 118, retention: "Not kept after the reply (Anthropic, zero data retention)" },
  ];

  const cloud = {
    provider: "Anthropic",
    model: "Claude Haiku 5.5",
    region: "EU servers where available",
    retention: "Not kept after the reply, under a zero data retention agreement",
    sent: "Only the text of this step, with email addresses and phone numbers removed",
    notSent: "Your voice, your files, your name and your email",
  };

  // Download tiers proposed after the review: a 350M-parameter model (about 255 MB) by default instead of 570 MB, small multilingual speech, and on a computer the browser's own model and speech where they exist. Sizes are Hugging Face file sizes; see the notes, "Smaller download".
  const tiers = {
    phone: { size: "255 MB", speech: "41 MB", upgrade: "570 MB", pitch: "255 MB, once. Then it works offline. Best on Wi-Fi.", speechPitch: "41 MB, once. Your voice never leaves this device." },
    desktop: { size: "255 MB", speech: "0 MB", upgrade: "570 MB", builtIn: true, builtInPitch: "This browser has its own assistant. Use it, and nothing downloads.", pitch: "255 MB, once. Then it works offline.", speechPitch: "This browser turns speech into text on this device. Nothing to download." },
  };

  return { capitals, stages, stageTips, lenses, lensInfo, limits, terms, scopes, me, meLong, partners, opportunities, directory, previews, photos, convo, ledger, cloud, tiers };
})();

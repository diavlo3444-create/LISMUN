import type {
  AtlasChapter,
  AtlasMetric,
  AtlasNavItem,
  CommitteeNode,
  ExperienceStage,
  SecretariatOffice,
} from '../types/atlas';

export const LISMUN_EMBLEM_IMAGE_PATH =
  '/assets/aistudio/WhatsApp_Image_2026-11-23_at_10.59.43_PM_9a2c95e7.jpeg';

export const ATLAS_NAV_ITEMS: AtlasNavItem[] = [
  { id: 'about', label: 'About', roman: 'I', coordinate: '46°12′N 06°09′E' },
  { id: 'experience', label: 'Experience', roman: 'II', coordinate: '52°04′N 04°18′E' },
  { id: 'committees', label: 'Committees', roman: 'III', coordinate: '40°45′N 73°58′W' },
  { id: 'secretariat', label: 'Secretariat', roman: 'IV', coordinate: '48°12′N 16°22′E' },
  { id: 'numbers', label: 'In Numbers', roman: 'V', coordinate: '01°17′S 36°49′E' },
];

export const ABOUT_CHAPTERS: AtlasChapter[] = [
  {
    id: 'meridian-origins',
    roman: 'Folio I',
    regionLabel: 'North Atlantic Meridian',
    title: 'An Assembly Drawn Upon Living Lines',
    subtitle: 'Origins of Parliamentary Diplomacy',
    coordinates: '40°44′56″N · 73°58′04″W',
    lonLat: [-73.968, 40.749],
    zoomScale: 1.45,
    body: 'Leadership International School MUN convenes student diplomats in an institutional forum modeled on classical multilateral statecraft. Every committee session treats negotiation as cartography: mapping competing national interests until common ground emerges.',
    caption: 'Fig. I — Western Atlantic Diplomatic Meridian & Sovereign Assembly Axis',
  },
  {
    id: 'geneva-concord',
    roman: 'Folio II',
    regionLabel: 'Continental Diplomatic Corridor',
    title: 'Precision of Mandate, Discipline of Word',
    subtitle: 'Treaty Architecture & Deliberation',
    coordinates: '46°13′36″N · 06°08′26″E',
    lonLat: [6.14, 46.227],
    zoomScale: 1.85,
    body: 'Rather than reducing global affairs to rapid point-scoring, LISMUN emphasizes archival research, disciplined rules of procedure, and consensus-built clauses that withstand real-world scrutiny.',
    caption: 'Fig. II — Geneva & The Hague Corridor of Humanitarian & Juridical Law',
  },
  {
    id: 'global-south-axis',
    roman: 'Folio III',
    regionLabel: 'Equatorial & Indo-Pacific Span',
    title: 'Every Latitude Represented at the Table',
    subtitle: 'Sovereign Equity Across Continents',
    coordinates: '01°17′11″S · 36°49′02″E',
    lonLat: [36.817, -1.286],
    zoomScale: 1.55,
    body: 'A credible diplomatic simulation requires every continent at the center of the map. Delegates represent diverse member states, grappling with climate sovereignty, security architecture, and economic development from every vantage point.',
    caption: 'Fig. III — Nairobi & Equatorial Assembly Axis Linking Hemispheres',
  },
];

export const EXPERIENCE_STAGES: ExperienceStage[] = [
  {
    id: 'research',
    index: '01',
    roman: 'I',
    title: 'Research',
    subtitle: 'Archival Study & Policy Preparation',
    quote: 'Before the debate, comes understanding.',
    coordinate: 'FOL. 01 · 51°30′N 00°07′W',
    folioCode: 'CHAPTER I · ARCHIVE',
    description:
      'Every delegation enters the chamber grounded in sovereign history. Delegates examine treaty precedent, national policy vectors, and regional cartography before drafting their opening position dossiers.',
    annotations: [
      'Country Research & Foreign Policy Matrix',
      'Primary Treaty & Charter Precedent',
      'Annotated Cartographic Briefing Notes',
    ],
    archivalHeading: 'Cartographic Preparation Index',
    archivalNote:
      'Primary sovereign briefs, boundary treaties, and economic dispatches indexed prior to committee roll call.',
  },
  {
    id: 'debate',
    index: '02',
    roman: 'II',
    title: 'Debate',
    subtitle: 'Formal Procedure & Parliamentary Speech',
    quote: 'Every position deserves a voice. Every argument, a challenge.',
    coordinate: 'FOL. 02 · 40°45′N 73°58′W',
    folioCode: 'CHAPTER II · CHAMBER',
    description:
      'Inside the council chamber, disciplined rhetoric replaces noise. Speakers deliver structured addresses, yield to points of information, and test competing doctrines under formal rules of procedure.',
    annotations: [
      'General Speakers List Addresses',
      'Moderated Caucus Interventions',
      'Parliamentary Points & Yields',
    ],
    archivalHeading: 'Order of Parliamentary Proceedings',
    archivalNote:
      'Structured speaking lists, formal points of inquiry, and disciplined chamber decorum govern every motion.',
  },
  {
    id: 'diplomacy',
    index: '03',
    roman: 'III',
    title: 'Diplomacy',
    subtitle: 'Alliance Building & Quiet Compromise',
    quote: 'Progress begins when perspectives meet.',
    coordinate: 'FOL. 03 · 46°13′N 06°08′E',
    folioCode: 'CHAPTER III · CORRIDORS',
    description:
      'Across unmoderated corridors, regional blocs converge around shared draft tables. Delegates reconcile sovereign red lines, broker bilateral concessions, and stitch together durable multilateral alliances.',
    annotations: [
      'Regional Bloc Alignment & Negotiation',
      'Bilateral Clause Reconciliation',
      'Multilateral Signatory Coalitions',
    ],
    archivalHeading: 'Meridian Accord Protocol',
    archivalNote:
      'Cross-regional drafting blocs align competing mandates into shared frameworks between New York and Geneva.',
  },
  {
    id: 'resolution',
    index: '04',
    roman: 'IV',
    title: 'Resolution',
    subtitle: 'Consensus Drafting & Final Ratification',
    quote: 'An idea is only the beginning. Its impact is what matters.',
    coordinate: 'FOL. 04 · 52°05′N 04°17′E',
    folioCode: 'CHAPTER IV · FINAL ACT',
    description:
      'Working papers mature into binding operative clauses. Through clause-by-clause scrutiny, formal amendments, and roll-call voting, the assembly inscribes its collective verdict into the conference record.',
    annotations: [
      'Operative Clause & Mandate Architecture',
      'Friendly & Unfriendly Amendments',
      'Roll-Call Ratification & Final Act',
    ],
    archivalHeading: 'Sovereign Final Act',
    archivalNote:
      'Ratified upon the floor of Leadership International School MUN Session I and inscribed into the permanent folio.',
  },
];

export const TBA_COMMITTEE_OPTION = {
  id: 'tba',
  code: 'TBA',
  name: 'All Committees To Be Announced',
} as const;

// Geographic coordinates strictly used for decorative global capital pins on the Hero globe;
// Session I committees themselves are To Be Announced (TBA).
export const COMMITTEE_NODES: CommitteeNode[] = [
  {
    id: 'unsc',
    code: 'UNSC',
    name: 'United Nations Security Council',
    organ: 'Principal Security Organ',
    city: 'New York',
    coordinates: '40°44′56″N · 73°58′04″W',
    lonLat: [-73.968, 40.749],
    connectedTo: ['unhrc', 'icj', 'iaea'],
    mandate:
      'Charged under the UN Charter with the maintenance of international peace and security, crisis response, peacekeeping authorization, and binding Chapter VII directives.',
    agendaStatus: 'Inaugural Session · Agenda Dossier Forthcoming',
    sessionProtocol: 'P5 Veto Procedure · Crisis Directives',
    plateType: 'chamber',
  },
  {
    id: 'unhrc',
    code: 'UNHRC',
    name: 'Human Rights Council',
    organ: 'Intergovernmental Subsidiary Body',
    city: 'Geneva',
    coordinates: '46°13′36″N · 06°08′26″E',
    lonLat: [6.14, 46.227],
    connectedTo: ['unsc', 'icj', 'unesco'],
    mandate:
      'Responsible for strengthening the promotion and protection of human rights globally, conducting Universal Periodic Reviews, and addressing thematic emergencies.',
    agendaStatus: 'Inaugural Session · Agenda Dossier Forthcoming',
    sessionProtocol: 'Standard General Assembly Procedure',
    plateType: 'council',
  },
  {
    id: 'icj',
    code: 'ICJ',
    name: 'International Court of Justice',
    organ: 'Principal Judicial Organ',
    city: 'The Hague',
    coordinates: '52°05′12″N · 04°17′44″E',
    lonLat: [4.295, 52.087],
    connectedTo: ['unsc', 'unhrc', 'iaea'],
    mandate:
      'The principal judicial seat of the United Nations at the Peace Palace, adjudicating legal disputes submitted by states and issuing advisory opinions on international law.',
    agendaStatus: 'Inaugural Session · Case Docket Forthcoming',
    sessionProtocol: 'Advocate Memorials & Oral Pleadings',
    plateType: 'court',
  },
  {
    id: 'iaea',
    code: 'IAEA',
    name: 'International Atomic Energy Agency',
    organ: 'Autonomous Technical Organ',
    city: 'Vienna',
    coordinates: '48°14′05″N · 16°25′01″E',
    lonLat: [16.417, 48.235],
    connectedTo: ['unsc', 'icj', 'unep'],
    mandate:
      'Advances peaceful nuclear science and technology while enforcing international safeguards against the proliferation of nuclear weapons.',
    agendaStatus: 'Inaugural Session · Agenda Dossier Forthcoming',
    sessionProtocol: 'Technical Board & Safeguards Protocol',
    plateType: 'treaty',
  },
  {
    id: 'unep',
    code: 'UNEP',
    name: 'United Nations Environment Programme',
    organ: 'Global Environmental Authority',
    city: 'Nairobi',
    coordinates: '01°14′03″S · 36°49′06″E',
    lonLat: [36.818, -1.234],
    connectedTo: ['iaea', 'unesco', 'unhrc'],
    mandate:
      'Coordinates global environmental governance, climate adaptation treaties, biodiversity preservation, and sustainable development frameworks.',
    agendaStatus: 'Inaugural Session · Agenda Dossier Forthcoming',
    sessionProtocol: 'Standard Assembly & Drafting Committees',
    plateType: 'council',
  },
  {
    id: 'unesco',
    code: 'UNESCO',
    name: 'Educational, Scientific & Cultural Organization',
    organ: 'Specialized Agency',
    city: 'Paris',
    coordinates: '48°50′59″N · 02°18′22″E',
    lonLat: [2.306, 48.85],
    connectedTo: ['unhrc', 'unep', 'unsc'],
    mandate:
      'Builds international peace through multilateral cooperation in education, cultural heritage preservation, scientific exchange, and press freedom.',
    agendaStatus: 'Inaugural Session · Agenda Dossier Forthcoming',
    sessionProtocol: 'Standard Assembly Procedure',
    plateType: 'treaty',
  },
];

export const SECRETARIAT_OFFICES: SecretariatOffice[] = [
  {
    id: 'sg-mallak-abbas',
    accessionCode: 'ARCH. I · SG',
    title: 'Secretary-General',
    appointees: 'Mallak Abbas',
    division: 'Office of the Secretary-General',
    appointmentStatus: 'Session I Secretariat · Confirmed Officeholder',
    coordinates: '40°44′56″N · 73°58′04″W',
    portfolio:
      'Presides over Leadership International School MUN Session I, safeguarding the conference charter, leading executive diplomatic oversight, and addressing the plenary assembly.',
    responsibilities: [
      'Conference Charter & Institutional Stewardship',
      'Opening & Closing Plenary Ceremonies',
      'Executive Secretariat Governance',
    ],
    motto: 'Concordia et Consilium',
  },
  {
    id: 'sg-sollaf-mustafa',
    accessionCode: 'ARCH. II · SG',
    title: 'Secretary-General',
    appointees: 'Sollaf Mustafa',
    division: 'Office of the Secretary-General',
    appointmentStatus: 'Session I Secretariat · Confirmed Officeholder',
    coordinates: '40°44′56″N · 73°58′04″W',
    portfolio:
      'Presides alongside the Secretariat over Leadership International School MUN Session I, guiding institutional policy, diplomatic protocol, and assembly leadership.',
    responsibilities: [
      'Executive Policy & Charter Oversight',
      'Plenary Leadership & Diplomatic Protocol',
      'Secretariat & Committee Coordination',
    ],
    motto: 'Concordia et Consilium',
  },
  {
    id: 'dsg-mohamed-walid',
    accessionCode: 'ARCH. III · DSG',
    title: 'Deputy Secretary-General',
    appointees: 'Mohamed Walid',
    division: 'Office of the Deputy Secretary-General',
    appointmentStatus: 'Session I Secretariat · Confirmed Officeholder',
    coordinates: '46°13′36″N · 06°08′26″E',
    portfolio:
      'Directs cross-departmental coordination, institutional logistics, chamber operations, and executive readiness across all conference committees and organizing teams.',
    responsibilities: [
      'Cross-Departmental Operations & Readiness',
      'Chamber Coordination & Conference Schedule',
      'Institutional Partnerships & Protocol Support',
    ],
    motto: 'Ordo et Praecisio',
  },
  {
    id: 'usg-lily',
    accessionCode: 'ARCH. IV · USG',
    title: 'Under-Secretary-General',
    appointees: 'Lily',
    division: 'Office of the Under-Secretary-General',
    appointmentStatus: 'Session I Secretariat · Confirmed Officeholder',
    coordinates: '52°05′12″N · 04°17′44″E',
    portfolio:
      'Stewards delegate services, academic standards, team coordination, and committee preparation to ensure a cohesive experience throughout Session I.',
    responsibilities: [
      'Academic & Committee Readiness Standards',
      'Delegate Relations & Onboarding Coordination',
      'Departmental Execution & Floor Support',
    ],
    motto: 'Scientia et Jurisprudentia',
  },
  {
    id: 'advisor-marwan-nasr',
    accessionCode: 'ARCH. V · ADV',
    title: 'Senior Advisor',
    appointees: 'Marwan Nasr',
    division: 'Executive Advisory Council',
    appointmentStatus: 'Session I Secretariat · Confirmed Advisor',
    coordinates: '48°14′05″N · 16°25′01″E',
    portfolio:
      'Provides senior strategic counsel, parliamentary guidance, and institutional mentorship to the Secretariat, department heads, and organizing teams.',
    responsibilities: [
      'Strategic Counsel & Institutional Continuity',
      'Secretariat & Department Head Mentorship',
      'Policy Review & Crisis Contingency Advisory',
    ],
    motto: 'Consilium et Veritas',
  },
  {
    id: 'advisor-najla-rami',
    accessionCode: 'ARCH. VI · ADV',
    title: 'Senior Advisor',
    appointees: 'Najla Rami',
    division: 'Executive Advisory Council',
    appointmentStatus: 'Session I Secretariat · Confirmed Advisor',
    coordinates: '48°14′05″N · 16°25′01″E',
    portfolio:
      'Advises the Secretariat on conference governance, delegate experience standards, and executive preparedness across all divisions.',
    responsibilities: [
      'Executive Governance & Standards Review',
      'Organizing Team & Leadership Mentorship',
      'Session Readiness & Protocol Counsel',
    ],
    motto: 'Consilium et Veritas',
  },
];

// Strictly honors "Use only verified statistics. If none are available, create a layout ready for real values but do not invent numbers."
export const ATLAS_LEDGER_METRICS: AtlasMetric[] = [
  {
    id: 'session-roman',
    value: 1,
    displayFallback: 'I',
    romanLabel: 'SESSION',
    label: 'Inaugural Sovereign Assembly',
    detail: 'The founding edition of Leadership International School MUN, anchored by the Roman numeral I upon its crest.',
    verifiedNote: 'Verified from LISMUN Institutional Charter',
  },
  {
    id: 'diplomatic-phases',
    value: 4,
    displayFallback: '04',
    label: 'Phases of Conference Statecraft',
    detail: 'Research, Debate, Diplomacy, and Resolution — four continuous stages guiding every delegate dossier.',
    verifiedNote: 'Verified Conference Structure',
  },
  {
    id: 'conference-committees',
    value: null,
    displayFallback: 'TBA',
    romanLabel: 'STATUS',
    label: 'Conference Committees',
    detail: 'All Leadership International School MUN committees, council mandates, and agenda dossiers for Session I are currently to be announced.',
    verifiedNote: 'Session I Committee Roster Pending',
  },
  {
    id: 'delegate-registry',
    value: null,
    displayFallback: 'OPEN',
    label: 'Delegate & Delegation Registry',
    detail: 'Official delegate headcount and participating country matrix figures publish upon close of registration.',
    verifiedNote: 'Pending Close of Session I Registry',
  },
];

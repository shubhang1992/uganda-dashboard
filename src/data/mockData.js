// Mock Data — Distributor Admin Dashboard, Universal Pensions Uganda
// Hierarchy: Country → 4 Regions → 12 Districts → ~30 Branches → ~120 Agents → ~2000 Subscribers

// ─── Seeded RNG for deterministic data ───────────────────────────────────────
let _seed = 42;
function rand() { _seed = (_seed * 16807 + 0) % 2147483647; return (_seed - 1) / 2147483646; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

// ─── Ugandan name pools ─────────────────────────────────────────────────────
const FIRST_NAMES_M = ['James','Robert','David','Joseph','Samuel','Peter','John','Moses','Isaac','Patrick','Ronald','Brian','Denis','Frank','Henry','Richard','Charles','Emmanuel','Gerald','Andrew'];
const FIRST_NAMES_F = ['Grace','Sarah','Agnes','Mary','Rose','Esther','Florence','Janet','Rebecca','Judith','Harriet','Dorothy','Irene','Beatrice','Prossy','Lillian','Carol','Diana','Annet','Brenda'];
const LAST_NAMES = ['Okello','Namubiru','Mugisha','Kabuye','Ssempala','Atuhaire','Owori','Nankya','Tumusiime','Byaruhanga','Namutebi','Kisakye','Obua','Drazu','Akello','Okiror','Natukunda','Musinguzi','Katusiime','Babirye','Nsubuga','Kasozi','Lubega','Kato','Wasswa','Nakato','Kiiza','Asiimwe','Mwesigwa','Arinaitwe'];

function ugandanName(gender) {
  const first = gender === 'female' ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M);
  return `${first} ${pick(LAST_NAMES)}`;
}

// ─── Monthly contribution trend generator ────────────────────────────────────
function monthlyTrend(base, growth = 0.03, variance = 0.08) {
  const arr = [];
  let val = base;
  for (let i = 0; i < 12; i++) {
    val = Math.round(val * (1 + growth + (rand() - 0.5) * variance));
    arr.push(val);
  }
  return arr;
}

// ─── COUNTRY ─────────────────────────────────────────────────────────────────
export const COUNTRY = {
  id: 'ug',
  name: 'Uganda',
  center: [32.3, 1.4],
  metrics: {
    aum: 48_000_000_000,
    totalBranches: 30,
    totalAgents: 120,
    totalSubscribers: 2000,
    totalContributions: 32_000_000_000,
    totalWithdrawals: 4_800_000_000,
    coverageRate: 67,
    activeRate: 82,
    complaintsCount: 34,
    monthlyContributions: [2_400_000_000, 2_480_000_000, 2_550_000_000, 2_600_000_000, 2_680_000_000, 2_720_000_000, 2_800_000_000, 2_850_000_000, 2_920_000_000, 2_980_000_000, 3_050_000_000, 3_120_000_000],
    genderRatio: { male: 52, female: 46, other: 2 },
    ageDistribution: { '18-25': 280, '26-35': 620, '36-45': 540, '46-55': 360, '55+': 200 },
  },
};

// ─── REGIONS ─────────────────────────────────────────────────────────────────
export const REGIONS = {
  'r-central': { id: 'r-central', name: 'Central', parentId: 'ug', center: [32.58, 0.35], metrics: null },
  'r-eastern': { id: 'r-eastern', name: 'Eastern', parentId: 'ug', center: [33.75, 1.56], metrics: null },
  'r-northern': { id: 'r-northern', name: 'Northern', parentId: 'ug', center: [32.30, 2.77], metrics: null },
  'r-western': { id: 'r-western', name: 'Western', parentId: 'ug', center: [30.27, -0.61], metrics: null },
};

// ─── DISTRICTS ───────────────────────────────────────────────────────────────
export const DISTRICTS = {
  'd-kampala':   { id: 'd-kampala',   name: 'Kampala',   parentId: 'r-central',  center: [32.5833, 0.3136] },
  'd-wakiso':    { id: 'd-wakiso',    name: 'Wakiso',    parentId: 'r-central',  center: [32.4467, 0.4044] },
  'd-mukono':    { id: 'd-mukono',    name: 'Mukono',    parentId: 'r-central',  center: [32.7554, 0.3533] },
  'd-jinja':     { id: 'd-jinja',     name: 'Jinja',     parentId: 'r-eastern',  center: [33.2040, 0.4244] },
  'd-mbale':     { id: 'd-mbale',     name: 'Mbale',     parentId: 'r-eastern',  center: [34.1755, 1.0750] },
  'd-soroti':    { id: 'd-soroti',    name: 'Soroti',    parentId: 'r-eastern',  center: [33.6112, 1.7150] },
  'd-gulu':      { id: 'd-gulu',      name: 'Gulu',      parentId: 'r-northern', center: [32.2995, 2.7746] },
  'd-lira':      { id: 'd-lira',      name: 'Lira',      parentId: 'r-northern', center: [32.5338, 2.2499] },
  'd-arua':      { id: 'd-arua',      name: 'Arua',      parentId: 'r-northern', center: [30.9110, 3.0200] },
  'd-mbarara':   { id: 'd-mbarara',   name: 'Mbarara',   parentId: 'r-western',  center: [30.6545, -0.6046] },
  'd-kabarole':  { id: 'd-kabarole',  name: 'Fort Portal (Kabarole)', parentId: 'r-western', center: [30.2750, 0.6710] },
  'd-kabale':    { id: 'd-kabale',    name: 'Kabale',    parentId: 'r-western',  center: [29.9889, -1.2491] },
};

// ─── BRANCHES ────────────────────────────────────────────────────────────────
const BRANCH_DEFS = [
  // Central — Kampala (3)
  { id: 'b-kla-main',     name: 'Kampala Main',       districtId: 'd-kampala',  center: [32.5811, 0.3163] },
  { id: 'b-kla-wandegeya',name: 'Wandegeya',          districtId: 'd-kampala',  center: [32.5750, 0.3390] },
  { id: 'b-kla-ntinda',   name: 'Ntinda',             districtId: 'd-kampala',  center: [32.6120, 0.3480] },
  // Wakiso (2)
  { id: 'b-wak-entebbe',  name: 'Entebbe',            districtId: 'd-wakiso',   center: [32.4633, 0.0551] },
  { id: 'b-wak-nansana',  name: 'Nansana',            districtId: 'd-wakiso',   center: [32.5297, 0.3648] },
  // Mukono (2)
  { id: 'b-muk-main',     name: 'Mukono Town',        districtId: 'd-mukono',   center: [32.7500, 0.3500] },
  { id: 'b-muk-lugazi',   name: 'Lugazi',             districtId: 'd-mukono',   center: [32.9200, 0.3900] },
  // Eastern — Jinja (3)
  { id: 'b-jin-main',     name: 'Jinja Main',         districtId: 'd-jinja',    center: [33.2070, 0.4300] },
  { id: 'b-jin-bugembe',  name: 'Bugembe',            districtId: 'd-jinja',    center: [33.2340, 0.4520] },
  { id: 'b-jin-kakira',   name: 'Kakira',             districtId: 'd-jinja',    center: [33.2780, 0.5000] },
  // Mbale (2)
  { id: 'b-mbl-main',     name: 'Mbale Main',         districtId: 'd-mbale',    center: [34.1750, 1.0650] },
  { id: 'b-mbl-nkoma',    name: 'Nkoma',              districtId: 'd-mbale',    center: [34.2100, 1.1000] },
  // Soroti (2)
  { id: 'b-sor-main',     name: 'Soroti Main',        districtId: 'd-soroti',   center: [33.6110, 1.7140] },
  { id: 'b-sor-arapai',   name: 'Arapai',             districtId: 'd-soroti',   center: [33.5600, 1.7500] },
  // Northern — Gulu (3)
  { id: 'b-gul-main',     name: 'Gulu Main',          districtId: 'd-gulu',     center: [32.3000, 2.7700] },
  { id: 'b-gul-layibi',   name: 'Layibi',             districtId: 'd-gulu',     center: [32.2800, 2.7850] },
  { id: 'b-gul-bardege',  name: 'Bardege',            districtId: 'd-gulu',     center: [32.3100, 2.7900] },
  // Lira (2)
  { id: 'b-lir-main',     name: 'Lira Main',          districtId: 'd-lira',     center: [32.5400, 2.2500] },
  { id: 'b-lir-ojwina',   name: 'Ojwina',             districtId: 'd-lira',     center: [32.5200, 2.2300] },
  // Arua (3)
  { id: 'b-aru-main',     name: 'Arua Main',          districtId: 'd-arua',     center: [30.9100, 3.0200] },
  { id: 'b-aru-oli',      name: 'Oli',                districtId: 'd-arua',     center: [30.9300, 3.0350] },
  { id: 'b-aru-adumi',    name: 'Adumi',              districtId: 'd-arua',     center: [30.8800, 3.0500] },
  // Western — Mbarara (3)
  { id: 'b-mba-main',     name: 'Mbarara Main',       districtId: 'd-mbarara',  center: [30.6580, -0.6070] },
  { id: 'b-mba-kakoba',   name: 'Kakoba',             districtId: 'd-mbarara',  center: [30.6400, -0.6200] },
  { id: 'b-mba-nyamitanga',name:'Nyamitanga',          districtId: 'd-mbarara',  center: [30.6700, -0.5900] },
  // Kabarole (2)
  { id: 'b-kab-main',     name: 'Fort Portal Main',   districtId: 'd-kabarole', center: [30.2750, 0.6710] },
  { id: 'b-kab-rwimi',    name: 'Rwimi',              districtId: 'd-kabarole', center: [30.3300, 0.6200] },
  // Kabale (3)
  { id: 'b-kbl-main',     name: 'Kabale Main',        districtId: 'd-kabale',   center: [29.9900, -1.2500] },
  { id: 'b-kbl-katuna',   name: 'Katuna',             districtId: 'd-kabale',   center: [29.9700, -1.2000] },
  { id: 'b-kbl-maziba',   name: 'Maziba',             districtId: 'd-kabale',   center: [29.9500, -1.2800] },
];

export const BRANCHES = {};
BRANCH_DEFS.forEach((b) => {
  BRANCHES[b.id] = { ...b, parentId: b.districtId, metrics: null };
  delete BRANCHES[b.id].districtId;
});

// ─── AGENTS ──────────────────────────────────────────────────────────────────
export const AGENTS = {};
const AGENT_STATUSES = ['active', 'active', 'active', 'active', 'inactive']; // 80% active
let agentCounter = 0;

Object.keys(BRANCHES).forEach((branchId) => {
  const count = randInt(3, 5); // 3-5 agents per branch → ~120 total
  for (let i = 0; i < count; i++) {
    agentCounter++;
    const gender = rand() < 0.55 ? 'male' : 'female';
    const id = `a-${String(agentCounter).padStart(3, '0')}`;
    const branchCenter = BRANCHES[branchId].center;
    AGENTS[id] = {
      id,
      name: ugandanName(gender),
      parentId: branchId,
      center: [branchCenter[0] + (rand() - 0.5) * 0.02, branchCenter[1] + (rand() - 0.5) * 0.02],
      phone: `+2567${randInt(0, 9)}${randInt(1000000, 9999999)}`,
      rating: Math.round((3 + rand() * 2) * 10) / 10, // 3.0 - 5.0
      performance: randInt(45, 100),
      status: pick(AGENT_STATUSES),
      metrics: null, // populated below
    };
  }
});

// ─── SUBSCRIBERS (generated lazily) ──────────────────────────────────────────
const PRODUCTS = ['SavePlus', 'PensionBasic', 'PensionPremium', 'EducationSaver', 'HealthCover'];
const KYC_STATUSES = ['complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'pending', 'pending', 'incomplete']; // ~70% complete

let _subscribersCache = null;

function generateSubscribers() {
  if (_subscribersCache) return _subscribersCache;
  const subs = {};
  const agentIds = Object.keys(AGENTS);
  const subsPerAgent = Math.ceil(2000 / agentIds.length);
  let subCounter = 0;

  agentIds.forEach((agentId) => {
    const count = randInt(subsPerAgent - 4, subsPerAgent + 4);
    for (let i = 0; i < count && subCounter < 2000; i++) {
      subCounter++;
      const gRoll = rand();
      const gender = gRoll < 0.55 ? 'male' : gRoll < 0.98 ? 'female' : 'other';
      const age = pick([
        randInt(18, 25), randInt(18, 25),
        randInt(26, 35), randInt(26, 35), randInt(26, 35), randInt(26, 35),
        randInt(36, 45), randInt(36, 45), randInt(36, 45),
        randInt(46, 55), randInt(46, 55),
        randInt(56, 70),
      ]);
      const isActive = rand() < 0.80;
      const monthlyAmt = randInt(5, 50) * 1000; // 5K–50K UGX
      const contribHistory = monthlyTrend(monthlyAmt, isActive ? 0.02 : -0.05, 0.15);
      const totalC = contribHistory.reduce((s, v) => s + v, 0);
      const totalW = Math.round(totalC * (rand() * 0.15));
      const id = `s-${String(subCounter).padStart(4, '0')}`;
      const name = ugandanName(gender === 'other' ? (rand() < 0.5 ? 'male' : 'female') : gender);
      const numProducts = randInt(1, 3);
      const heldProducts = [];
      const used = new Set();
      for (let p = 0; p < numProducts; p++) {
        let prod = pick(PRODUCTS);
        while (used.has(prod)) prod = pick(PRODUCTS);
        used.add(prod);
        heldProducts.push(prod);
      }

      subs[id] = {
        id,
        name,
        email: `${name.toLowerCase().replace(/\s/g, '.')}${subCounter}@mail.ug`,
        phone: `+2567${randInt(0, 9)}${randInt(1000000, 9999999)}`,
        gender,
        age,
        parentId: agentId,
        kycStatus: pick(KYC_STATUSES),
        isActive,
        contributionHistory: contribHistory,
        totalContributions: totalC,
        totalWithdrawals: totalW,
        registeredDate: `${2024 + (subCounter % 2)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
        productsHeld: heldProducts,
      };
    }
  });
  _subscribersCache = subs;
  return subs;
}

// Proxy so SUBSCRIBERS behaves like a plain object but generates lazily
export const SUBSCRIBERS = new Proxy({}, {
  get(_, prop) {
    const data = generateSubscribers();
    if (prop === Symbol.iterator) return data[Symbol.iterator];
    return data[prop];
  },
  ownKeys() { return Object.keys(generateSubscribers()); },
  getOwnPropertyDescriptor(_, prop) {
    const data = generateSubscribers();
    if (prop in data) return { configurable: true, enumerable: true, value: data[prop] };
    return undefined;
  },
  has(_, prop) { return prop in generateSubscribers(); },
});

// ─── Aggregate metrics bottom-up ─────────────────────────────────────────────
function ageBucket(age) {
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  if (age <= 55) return '46-55';
  return '55+';
}

function emptyMetrics() {
  return {
    totalSubscribers: 0,
    totalAgents: 0,
    totalContributions: 0,
    totalWithdrawals: 0,
    coverageRate: 0,
    activeRate: 0,
    complaintsCount: 0,
    monthlyContributions: new Array(12).fill(0),
    genderRatio: { male: 0, female: 0, other: 0 },
    ageDistribution: { '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '55+': 0 },
  };
}

function addMetrics(target, source) {
  target.totalSubscribers += source.totalSubscribers;
  target.totalAgents += source.totalAgents;
  target.totalContributions += source.totalContributions;
  target.totalWithdrawals += source.totalWithdrawals;
  target.complaintsCount += source.complaintsCount;
  for (let i = 0; i < 12; i++) target.monthlyContributions[i] += source.monthlyContributions[i];
  ['male', 'female', 'other'].forEach((g) => { target.genderRatio[g] += source.genderRatio[g]; });
  Object.keys(target.ageDistribution).forEach((k) => { target.ageDistribution[k] += source.ageDistribution[k]; });
}

function finalizeRates(m) {
  if (m.totalSubscribers > 0) {
    const activeCount = Math.round(m.totalSubscribers * m.activeRate / (m.totalSubscribers || 1));
    m.activeRate = Math.round((activeCount / m.totalSubscribers) * 100);
    m.coverageRate = randInt(55, 80);
  }
  // Normalize gender ratio to percentages
  const gTotal = m.genderRatio.male + m.genderRatio.female + m.genderRatio.other;
  if (gTotal > 0) {
    m.genderRatio = {
      male: Math.round((m.genderRatio.male / gTotal) * 100),
      female: Math.round((m.genderRatio.female / gTotal) * 100),
      other: Math.round((m.genderRatio.other / gTotal) * 100),
    };
  }
}

// Compute agent-level metrics from subscribers
const subs = generateSubscribers();
Object.values(AGENTS).forEach((agent) => {
  const m = emptyMetrics();
  const agentSubs = Object.values(subs).filter((s) => s.parentId === agent.id);
  m.totalSubscribers = agentSubs.length;
  m.totalAgents = 1;
  let activeCount = 0;
  agentSubs.forEach((s) => {
    m.totalContributions += s.totalContributions;
    m.totalWithdrawals += s.totalWithdrawals;
    if (s.isActive) activeCount++;
    m.genderRatio[s.gender]++;
    m.ageDistribution[ageBucket(s.age)]++;
    s.contributionHistory.forEach((v, i) => { m.monthlyContributions[i] += v; });
  });
  m.activeRate = m.totalSubscribers ? Math.round((activeCount / m.totalSubscribers) * 100) : 0;
  m.coverageRate = randInt(55, 80);
  m.complaintsCount = randInt(0, 3);
  finalizeRates(m);
  agent.metrics = m;
});

// Roll up: branch ← agents
Object.values(BRANCHES).forEach((branch) => {
  const m = emptyMetrics();
  Object.values(AGENTS).filter((a) => a.parentId === branch.id).forEach((a) => addMetrics(m, a.metrics));
  m.complaintsCount = randInt(0, 5);
  finalizeRates(m);
  branch.metrics = m;
});

// Roll up: district ← branches
Object.values(DISTRICTS).forEach((district) => {
  const m = emptyMetrics();
  Object.values(BRANCHES).filter((b) => b.parentId === district.id).forEach((b) => addMetrics(m, b.metrics));
  m.complaintsCount = randInt(1, 6);
  finalizeRates(m);
  district.metrics = m;
});

// Roll up: region ← districts
Object.values(REGIONS).forEach((region) => {
  const m = emptyMetrics();
  Object.values(DISTRICTS).filter((d) => d.parentId === region.id).forEach((d) => addMetrics(m, d.metrics));
  m.complaintsCount = randInt(3, 12);
  finalizeRates(m);
  region.metrics = m;
});

// ─── LEVEL CONSTANTS & LOOKUP MAPS ───────────────────────────────────────────
export const LEVELS = { COUNTRY: 'country', REGION: 'region', DISTRICT: 'district', BRANCH: 'branch', AGENT: 'agent', SUBSCRIBER: 'subscriber' };

const LEVEL_MAP = {
  [LEVELS.COUNTRY]: { ug: COUNTRY },
  [LEVELS.REGION]: REGIONS,
  [LEVELS.DISTRICT]: DISTRICTS,
  [LEVELS.BRANCH]: BRANCHES,
  [LEVELS.AGENT]: AGENTS,
  [LEVELS.SUBSCRIBER]: SUBSCRIBERS,
};

const CHILD_LEVEL = {
  [LEVELS.COUNTRY]: LEVELS.REGION,
  [LEVELS.REGION]: LEVELS.DISTRICT,
  [LEVELS.DISTRICT]: LEVELS.BRANCH,
  [LEVELS.BRANCH]: LEVELS.AGENT,
  [LEVELS.AGENT]: LEVELS.SUBSCRIBER,
};

// ─── Helper functions ────────────────────────────────────────────────────────

/** Get all child entities of a given parent at the next hierarchy level */
export function getChildEntities(level, parentId) {
  const childLevel = CHILD_LEVEL[level];
  if (!childLevel) return [];
  const map = LEVEL_MAP[childLevel];
  return Object.values(map).filter((e) => e.parentId === parentId);
}

/** Look up any entity by level + id */
export function getEntityById(level, id) {
  return LEVEL_MAP[level]?.[id] ?? null;
}

/** Build a breadcrumb path from selectedIds map, e.g. { region: 'r-central', district: 'd-kampala' } */
export function getBreadcrumbPath(currentLevel, selectedIds) {
  const crumbs = [{ level: LEVELS.COUNTRY, id: 'ug', name: COUNTRY.name }];
  const order = [LEVELS.REGION, LEVELS.DISTRICT, LEVELS.BRANCH, LEVELS.AGENT, LEVELS.SUBSCRIBER];
  for (const lvl of order) {
    const id = selectedIds[lvl];
    if (!id) break;
    const entity = getEntityById(lvl, id);
    if (entity) crumbs.push({ level: lvl, id, name: entity.name });
    if (lvl === currentLevel) break;
  }
  return crumbs;
}

/** Format UGX amounts with K/M/B suffixes */
export function formatUGX(amount) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}UGX ${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}UGX ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}UGX ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}UGX ${abs}`;
}

/** Get all entities at a given level */
export function getAllEntities(level) {
  return Object.values(LEVEL_MAP[level] || {});
}

/** Get parent entity of a given entity */
export function getParentEntity(level, id) {
  const entity = getEntityById(level, id);
  if (!entity?.parentId) return null;
  const order = [LEVELS.COUNTRY, LEVELS.REGION, LEVELS.DISTRICT, LEVELS.BRANCH, LEVELS.AGENT];
  const idx = order.indexOf(level);
  return idx > 0 ? getEntityById(order[idx - 1], entity.parentId) : COUNTRY;
}

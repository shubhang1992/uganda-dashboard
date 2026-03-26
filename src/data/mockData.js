// Mock Data — Distributor Admin Dashboard, Universal Pensions Uganda
// Hierarchy: Country → 4 Regions → 56 Districts (20 active) → ~85 Branches → ~500 Agents → ~25,000 Subscribers

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
    aum: 485_000_000_000,
    totalBranches: 85,
    totalAgents: 520,
    totalSubscribers: 25000,
    totalContributions: 326_000_000_000,
    totalWithdrawals: 48_500_000_000,
    coverageRate: 36,
    activeRate: 78,
    complaintsCount: 187,
    monthlyContributions: [24_000_000_000, 24_800_000_000, 25_500_000_000, 26_200_000_000, 26_800_000_000, 27_200_000_000, 28_000_000_000, 28_500_000_000, 29_200_000_000, 29_800_000_000, 30_500_000_000, 31_200_000_000],
    genderRatio: { male: 52, female: 46, other: 2 },
    ageDistribution: { '18-25': 3500, '26-35': 7750, '36-45': 6750, '46-55': 4500, '55+': 2500 },
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
// All 56 GADM districts. Districts with branches are marked active: true.
export const DISTRICTS = {
  // ── Central (13) ──
  'd-kalangala':    { id: 'd-kalangala',    name: 'Kalangala',    parentId: 'r-central',  center: [32.3412, -0.4084], active: false },
  'd-kampala':      { id: 'd-kampala',      name: 'Kampala',      parentId: 'r-central',  center: [32.6185, 0.3021],  active: true },
  'd-kayunga':      { id: 'd-kayunga',      name: 'Kayunga',      parentId: 'r-central',  center: [32.9466, 0.9013],  active: false },
  'd-kiboga':       { id: 'd-kiboga',       name: 'Kiboga',       parentId: 'r-central',  center: [31.7465, 0.9831],  active: false },
  'd-luwero':       { id: 'd-luwero',       name: 'Luwero',       parentId: 'r-central',  center: [32.2722, 1.0335],  active: true },
  'd-masaka':       { id: 'd-masaka',       name: 'Masaka',       parentId: 'r-central',  center: [31.8699, -0.2540], active: true },
  'd-mpigi':        { id: 'd-mpigi',        name: 'Mpigi',        parentId: 'r-central',  center: [31.9594, 0.1434],  active: false },
  'd-mubende':      { id: 'd-mubende',      name: 'Mubende',      parentId: 'r-central',  center: [31.6833, 0.4859],  active: false },
  'd-mukono':       { id: 'd-mukono',       name: 'Mukono',       parentId: 'r-central',  center: [33.0105, 0.1404],  active: true },
  'd-nakasongola':  { id: 'd-nakasongola',  name: 'Nakasongola',  parentId: 'r-central',  center: [32.3083, 1.3570],  active: false },
  'd-rakai':        { id: 'd-rakai',        name: 'Rakai',        parentId: 'r-central',  center: [31.4361, -0.5601], active: false },
  'd-sembabule':    { id: 'd-sembabule',    name: 'Sembabule',    parentId: 'r-central',  center: [31.3050, -0.0314], active: false },
  'd-wakiso':       { id: 'd-wakiso',       name: 'Wakiso',       parentId: 'r-central',  center: [32.4303, 0.1547],  active: true },
  // ── Eastern (15) ──
  'd-bugiri':       { id: 'd-bugiri',       name: 'Bugiri',       parentId: 'r-eastern',  center: [33.7925, 0.2416],  active: false },
  'd-busia':        { id: 'd-busia',        name: 'Busia',        parentId: 'r-eastern',  center: [34.0112, 0.4163],  active: false },
  'd-iganga':       { id: 'd-iganga',       name: 'Iganga',       parentId: 'r-eastern',  center: [33.5236, 0.7617],  active: true },
  'd-jinja':        { id: 'd-jinja',        name: 'Jinja',        parentId: 'r-eastern',  center: [33.2174, 0.5388],  active: true },
  'd-kaberamaido':  { id: 'd-kaberamaido',  name: 'Kaberamaido',  parentId: 'r-eastern',  center: [33.2455, 1.8276],  active: false },
  'd-kamuli':       { id: 'd-kamuli',       name: 'Kamuli',       parentId: 'r-eastern',  center: [33.2093, 0.9958],  active: false },
  'd-kapchorwa':    { id: 'd-kapchorwa',    name: 'Kapchorwa',    parentId: 'r-eastern',  center: [34.5531, 1.4380],  active: false },
  'd-katakwi':      { id: 'd-katakwi',      name: 'Katakwi',      parentId: 'r-eastern',  center: [33.6099, 2.0851],  active: false },
  'd-kumi':         { id: 'd-kumi',         name: 'Kumi',         parentId: 'r-eastern',  center: [34.0267, 1.3750],  active: false },
  'd-mayuge':       { id: 'd-mayuge',       name: 'Mayuge',       parentId: 'r-eastern',  center: [33.4887, 0.2862],  active: false },
  'd-mbale':        { id: 'd-mbale',        name: 'Mbale',        parentId: 'r-eastern',  center: [34.3073, 0.9730],  active: true },
  'd-pallisa':      { id: 'd-pallisa',      name: 'Pallisa',      parentId: 'r-eastern',  center: [33.7870, 1.1862],  active: false },
  'd-sironko':      { id: 'd-sironko',      name: 'Sironko',      parentId: 'r-eastern',  center: [34.3236, 1.3233],  active: false },
  'd-soroti':       { id: 'd-soroti',       name: 'Soroti',       parentId: 'r-eastern',  center: [33.5436, 1.6871],  active: true },
  'd-tororo':       { id: 'd-tororo',       name: 'Tororo',       parentId: 'r-eastern',  center: [34.0863, 0.7003],  active: true },
  // ── Northern (13) ──
  'd-adjumani':     { id: 'd-adjumani',     name: 'Adjumani',     parentId: 'r-northern', center: [31.7590, 3.2089],  active: false },
  'd-apac':         { id: 'd-apac',         name: 'Apac',         parentId: 'r-northern', center: [32.5858, 2.1351],  active: true },
  'd-arua':         { id: 'd-arua',         name: 'Arua',         parentId: 'r-northern', center: [31.0845, 3.0614],  active: true },
  'd-gulu':         { id: 'd-gulu',         name: 'Gulu',         parentId: 'r-northern', center: [32.0353, 2.8126],  active: true },
  'd-kitgum':       { id: 'd-kitgum',       name: 'Kitgum',       parentId: 'r-northern', center: [32.9648, 3.3043],  active: false },
  'd-kotido':       { id: 'd-kotido',       name: 'Kotido',       parentId: 'r-northern', center: [33.9263, 3.1447],  active: false },
  'd-lira':         { id: 'd-lira',         name: 'Lira',         parentId: 'r-northern', center: [33.0866, 2.2282],  active: true },
  'd-moroto':       { id: 'd-moroto',       name: 'Moroto',       parentId: 'r-northern', center: [34.5340, 2.4266],  active: false },
  'd-moyo':         { id: 'd-moyo',         name: 'Moyo',         parentId: 'r-northern', center: [31.7326, 3.5107],  active: false },
  'd-nakapiripirit':{ id: 'd-nakapiripirit', name: 'Nakapiripirit', parentId: 'r-northern', center: [34.6549, 1.8244], active: false },
  'd-nebbi':        { id: 'd-nebbi',        name: 'Nebbi',        parentId: 'r-northern', center: [31.1016, 2.5440],  active: false },
  'd-pader':        { id: 'd-pader',        name: 'Pader',        parentId: 'r-northern', center: [33.0572, 2.8593],  active: false },
  'd-yumbe':        { id: 'd-yumbe',        name: 'Yumbe',        parentId: 'r-northern', center: [31.2603, 3.3991],  active: false },
  // ── Western (15) ──
  'd-bundibugyo':   { id: 'd-bundibugyo',   name: 'Bundibugyo',   parentId: 'r-western',  center: [30.2464, 0.9045],  active: false },
  'd-bushenyi':     { id: 'd-bushenyi',     name: 'Bushenyi',     parentId: 'r-western',  center: [30.1435, -0.4577], active: true },
  'd-hoima':        { id: 'd-hoima',        name: 'Hoima',        parentId: 'r-western',  center: [31.1381, 1.4229],  active: true },
  'd-kabale':       { id: 'd-kabale',       name: 'Kabale',       parentId: 'r-western',  center: [29.9677, -1.2081], active: true },
  'd-kabarole':     { id: 'd-kabarole',     name: 'Kabarole',     parentId: 'r-western',  center: [30.2986, 0.5883],  active: true },
  'd-kamwenge':     { id: 'd-kamwenge',     name: 'Kamwenge',     parentId: 'r-western',  center: [30.5023, 0.2491],  active: false },
  'd-kanungu':      { id: 'd-kanungu',      name: 'Kanungu',      parentId: 'r-western',  center: [29.7181, -0.7766], active: false },
  'd-kasese':       { id: 'd-kasese',       name: 'Kasese',       parentId: 'r-western',  center: [29.9884, 0.1606],  active: true },
  'd-kibale':       { id: 'd-kibale',       name: 'Kibale',       parentId: 'r-western',  center: [30.9942, 0.9622],  active: false },
  'd-kisoro':       { id: 'd-kisoro',       name: 'Kisoro',       parentId: 'r-western',  center: [29.6862, -1.1928], active: false },
  'd-kyenjojo':     { id: 'd-kyenjojo',     name: 'Kyenjojo',     parentId: 'r-western',  center: [30.7522, 0.5625],  active: false },
  'd-masindi':      { id: 'd-masindi',      name: 'Masindi',      parentId: 'r-western',  center: [31.7444, 1.8511],  active: false },
  'd-mbarara':      { id: 'd-mbarara',      name: 'Mbarara',      parentId: 'r-western',  center: [30.6576, -0.3391], active: true },
  'd-ntungamo':     { id: 'd-ntungamo',     name: 'Ntungamo',     parentId: 'r-western',  center: [30.3006, -0.9579], active: false },
  'd-rukungiri':    { id: 'd-rukungiri',    name: 'Rukungiri',    parentId: 'r-western',  center: [29.8838, -0.7064], active: false },
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

  // ── Additional branches for existing districts ──
  // Kampala (4 more)
  { id: 'b-kla-kawempe',  name: 'Kawempe',             districtId: 'd-kampala',  center: [32.5680, 0.3550] },
  { id: 'b-kla-makindye', name: 'Makindye',            districtId: 'd-kampala',  center: [32.6020, 0.2960] },
  { id: 'b-kla-rubaga',   name: 'Rubaga',              districtId: 'd-kampala',  center: [32.5520, 0.3100] },
  { id: 'b-kla-nakasero', name: 'Nakasero',            districtId: 'd-kampala',  center: [32.5850, 0.3200] },
  // Wakiso (3 more)
  { id: 'b-wak-kira',     name: 'Kira',                districtId: 'd-wakiso',   center: [32.6350, 0.3720] },
  { id: 'b-wak-kasangati', name: 'Kasangati',          districtId: 'd-wakiso',   center: [32.5350, 0.4200] },
  { id: 'b-wak-bweyogerere', name: 'Bweyogerere',      districtId: 'd-wakiso',   center: [32.6500, 0.3500] },
  // Mukono (2 more)
  { id: 'b-muk-seeta',    name: 'Seeta',               districtId: 'd-mukono',   center: [32.6700, 0.3600] },
  { id: 'b-muk-namanve',  name: 'Namanve',             districtId: 'd-mukono',   center: [32.7100, 0.3400] },
  // Jinja (2 more)
  { id: 'b-jin-walukuba', name: 'Walukuba',            districtId: 'd-jinja',    center: [33.1900, 0.4400] },
  { id: 'b-jin-mpumudde', name: 'Mpumudde',            districtId: 'd-jinja',    center: [33.2200, 0.4600] },
  // Mbale (2 more)
  { id: 'b-mbl-nakaloke', name: 'Nakaloke',            districtId: 'd-mbale',    center: [34.2000, 1.0900] },
  { id: 'b-mbl-wanale',   name: 'Wanale',              districtId: 'd-mbale',    center: [34.1600, 1.0500] },
  // Soroti (2 more)
  { id: 'b-sor-gweri',    name: 'Gweri',               districtId: 'd-soroti',   center: [33.6400, 1.7300] },
  { id: 'b-sor-kamuda',   name: 'Kamuda',              districtId: 'd-soroti',   center: [33.5800, 1.6900] },
  // Gulu (2 more)
  { id: 'b-gul-pece',     name: 'Pece',                districtId: 'd-gulu',     center: [32.2900, 2.7600] },
  { id: 'b-gul-laroo',    name: 'Laroo',               districtId: 'd-gulu',     center: [32.3050, 2.8000] },
  // Lira (2 more)
  { id: 'b-lir-adyel',    name: 'Adyel',               districtId: 'd-lira',     center: [32.5500, 2.2600] },
  { id: 'b-lir-railway',  name: 'Railway',              districtId: 'd-lira',     center: [32.5300, 2.2400] },
  // Arua (2 more)
  { id: 'b-aru-mvara',    name: 'Mvara',               districtId: 'd-arua',     center: [30.9200, 3.0100] },
  { id: 'b-aru-pangisa',  name: 'Pangisa',             districtId: 'd-arua',     center: [30.8900, 3.0400] },
  // Mbarara (2 more)
  { id: 'b-mba-kamukuzi', name: 'Kamukuzi',            districtId: 'd-mbarara',  center: [30.6500, -0.6100] },
  { id: 'b-mba-ruti',     name: 'Ruti',                districtId: 'd-mbarara',  center: [30.6800, -0.5700] },
  // Kabarole (2 more)
  { id: 'b-kab-kijura',   name: 'Kijura',              districtId: 'd-kabarole', center: [30.2600, 0.6500] },
  { id: 'b-kab-kahinju',  name: 'Kahinju',             districtId: 'd-kabarole', center: [30.3100, 0.6800] },

  // ── New active districts — branches ──
  // Luwero (3)
  { id: 'b-luw-main',     name: 'Luwero Town',         districtId: 'd-luwero',   center: [32.4730, 0.8490] },
  { id: 'b-luw-wobulenzi', name: 'Wobulenzi',          districtId: 'd-luwero',   center: [32.5100, 0.7600] },
  { id: 'b-luw-bombo',    name: 'Bombo',               districtId: 'd-luwero',   center: [32.5330, 0.5830] },
  // Masaka (3)
  { id: 'b-mas-main',     name: 'Masaka Main',         districtId: 'd-masaka',   center: [31.7340, -0.3340] },
  { id: 'b-mas-nyendo',   name: 'Nyendo',              districtId: 'd-masaka',   center: [31.7200, -0.3500] },
  { id: 'b-mas-kimanya',  name: 'Kimanya',             districtId: 'd-masaka',   center: [31.7400, -0.3200] },
  // Iganga (2)
  { id: 'b-iga-main',     name: 'Iganga Main',         districtId: 'd-iganga',   center: [33.4860, 0.6090] },
  { id: 'b-iga-nakigo',   name: 'Nakigo',              districtId: 'd-iganga',   center: [33.5100, 0.6300] },
  // Tororo (2)
  { id: 'b-tor-main',     name: 'Tororo Main',         districtId: 'd-tororo',   center: [34.1810, 0.6920] },
  { id: 'b-tor-nagongera', name: 'Nagongera',           districtId: 'd-tororo',   center: [34.0500, 0.7500] },
  // Apac (2)
  { id: 'b-apa-main',     name: 'Apac Main',           districtId: 'd-apac',     center: [32.5350, 1.9850] },
  { id: 'b-apa-ibuje',    name: 'Ibuje',               districtId: 'd-apac',     center: [32.5500, 2.0200] },
  // Bushenyi (2)
  { id: 'b-bus-main',     name: 'Bushenyi Main',       districtId: 'd-bushenyi', center: [30.1870, -0.5420] },
  { id: 'b-bus-ishaka',   name: 'Ishaka',              districtId: 'd-bushenyi', center: [30.1500, -0.5200] },
  // Hoima (3)
  { id: 'b-hoi-main',     name: 'Hoima Main',          districtId: 'd-hoima',    center: [31.3530, 1.4310] },
  { id: 'b-hoi-kigorobya', name: 'Kigorobya',          districtId: 'd-hoima',    center: [31.3900, 1.5100] },
  { id: 'b-hoi-kitoba',   name: 'Kitoba',              districtId: 'd-hoima',    center: [31.3200, 1.4000] },
  // Kasese (3)
  { id: 'b-kas-main',     name: 'Kasese Main',         districtId: 'd-kasese',   center: [30.0880, 0.1830] },
  { id: 'b-kas-hima',     name: 'Hima',                districtId: 'd-kasese',   center: [30.0500, 0.2500] },
  { id: 'b-kas-kilembe',  name: 'Kilembe',             districtId: 'd-kasese',   center: [30.0000, 0.2000] },
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
  const count = randInt(5, 8); // 5-8 agents per branch → ~500 total
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
  const TARGET_SUBS = 25000;
  const subsPerAgent = Math.ceil(TARGET_SUBS / agentIds.length);
  let subCounter = 0;

  agentIds.forEach((agentId) => {
    const count = randInt(Math.max(20, subsPerAgent - 15), subsPerAgent + 15);
    for (let i = 0; i < count && subCounter < TARGET_SUBS; i++) {
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
      const isActive = rand() < (0.60 + rand() * 0.35);
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
  // Track actual active subscriber count for correct rate calculation
  target._activeCount = (target._activeCount || 0) + Math.round(source.totalSubscribers * source.activeRate / 100);
  for (let i = 0; i < 12; i++) target.monthlyContributions[i] += source.monthlyContributions[i];
  ['male', 'female', 'other'].forEach((g) => { target.genderRatio[g] += source.genderRatio[g]; });
  Object.keys(target.ageDistribution).forEach((k) => { target.ageDistribution[k] += source.ageDistribution[k]; });
}

function finalizeRates(m) {
  if (m.totalSubscribers > 0) {
    m.activeRate = Math.round(((m._activeCount || 0) / m.totalSubscribers) * 100);
    m.coverageRate = randInt(55, 80);
  }
  delete m._activeCount;
  // AUM = contributions + simulated investment returns (~50% of contributions)
  m.aum = Math.round(m.totalContributions * (1 + rand() * 0.3 + 0.35));
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
  const distBranches = Object.values(BRANCHES).filter((b) => b.parentId === district.id);
  distBranches.forEach((b) => addMetrics(m, b.metrics));
  m.totalBranches = distBranches.length;
  m.complaintsCount = randInt(1, 6);
  finalizeRates(m);
  district.metrics = m;
});

// Roll up: region ← districts
Object.values(REGIONS).forEach((region) => {
  const m = emptyMetrics();
  const regionDistricts = Object.values(DISTRICTS).filter((d) => d.parentId === region.id);
  regionDistricts.forEach((d) => addMetrics(m, d.metrics));
  m.totalBranches = regionDistricts.reduce((sum, d) => sum + (d.metrics?.totalBranches || 0), 0);
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

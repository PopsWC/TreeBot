// One-time import: GGH Members Only Harvest.xlsx -> TreeBot DB
// Usage:
//   node scripts/import-harvest.js            dry-run (default)
//   node scripts/import-harvest.js --apply    write to DB
// Also exported as a lib (buildReport/runImport) for the one-time admin endpoint.
// DB target: DB_PATH env var or ./data.
//
// Model decisions (locked with Andrew):
// - Boxes are the unit; 180 trees/box (per-species overridable later)
// - Official request keys win; composites for the rest
// - All historical drops imported with real dates + crew attribution
// - cyote willow 014 = Sandbar willow SW014; river alder 72 = SpecA072;
//   bog birch 64 = new species+key, no allocation
// - Partial boxes tracked exactly via drop_history.partial_stems
// - Inventory seeded with plain reefer counts (drops are direct inserts)

const path = require('path');
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const TREES_PER_BOX = 180;

// ---------- Seedlot mapping ----------
const SEEDLOT_MAP = {
  'bebbs willow 005':        { key: 'BEB005',      short: 'beb005',      species: "Bebb's Willow" },
  'black twin berry 29':     { key: 'twin-029',    short: 'twin29',      species: 'Twinberry' },
  'blue joint reedgrass 40': { key: 'BJR040',      short: 'bjr40',       species: 'Bluejoint reedgrass' },
  'bog birch 64':            { key: 'bbirch-064',  short: 'bbirch64',    species: 'Bog birch' },
  'canadian golden rod 76':  { key: 'CGR076',      short: 'cgold76',     species: 'Canada Goldenrod' },
  'chives 16':               { key: 'Chi016',      short: 'chives16',    species: 'Wild chives' },
  'cyote willow 014':        { key: 'SW014',       short: 'sw014',       species: 'Sandbar willow' },
  'dogwood 018':             { key: 'dogwood-018', short: 'dogwood18',   species: 'Red-osier dogwood' },
  'field mint 036':          { key: 'Mint036',     short: 'mint36',      species: 'Field mint' },
  'fireweed 14a':            { key: 'Fire14A',     short: 'fire14a',     species: 'Fireweed' },
  'green alder 055b':        { key: 'galder-055b', short: 'galder055b',  species: 'Green alder' },
  'green alder 081':         { key: 'galder-081',  short: 'galder081',   species: 'Green alder' },
  'northern bed straw 43':   { key: 'NBS043',      short: 'nbs43',       species: 'Northern bedstraw' },
  'paper birch 68':          { key: 'Paper068',    short: 'paper068',    species: 'Paper birch' },
  'paper birch 93':          { key: 'Paper093',    short: 'paper093',    species: 'Paper birch' },
  'poplar 005':              { key: 'bpop-005',    short: 'bpop005',     species: 'Balsam Poplar' },
  'poplar 011':              { key: 'bpop-011',    short: 'bpop011',     species: 'Balsam Poplar' },
  'poplar 014':              { key: 'bpop-014',    short: 'bpop014',     species: 'Balsam Poplar' },
  'river alder 72':          { key: 'SpecA072',    short: 'ralder72',    species: 'Speckled alder' },
  'spreding dogbane 73':     { key: 'dogbane-073', short: 'dogbane73',   species: 'Spreading dogbane' },
  'tall golden rod 67':      { key: 'tgold-067',   short: 'tgold67',     species: 'Tall goldenrod' },
  'wild strawberry 28':      { key: 'StrawB028',   short: 'straw28',     species: 'Wild strawberry' },
  'yarrow 41':               { key: 'Y41',         short: 'y41',         species: 'Yarrow' },
};

const SPECIES_TO_KEY = {
  'Balsam Poplar': 'bpop-005', 'Paper birch': 'Paper068', "Bebb's Willow": 'BEB005',
  'Green alder': 'galder-055b', 'Red-osier dogwood': 'dogwood-018', 'Sandbar willow': 'SW014',
  'Speckled alder': 'SpecA072', 'Twinberry': 'twin-029', 'Canada Goldenrod': 'CGR076',
  'Tall goldenrod': 'tgold-067', 'Fireweed': 'Fire14A', 'Northern bedstraw': 'NBS043',
  'Wild chives': 'Chi016', 'Wild strawberry': 'StrawB028', 'Yarrow': 'Y41',
  'Bluejoint reedgrass': 'BJR040', 'Spreading dogbane': 'dogbane-073',
  'Rose (species unspecified)': 'rose-001', 'Red raspberry': 'rasp-001',
  'Chokecherry': 'choke-001', 'Pin cherry': 'pinch-001', 'Saskatoon': 'sask-001',
  'Velvet-leaved blueberry': 'vlblue-001', 'Dwarf birch': 'dbirch-001',
  'Labrador tea': 'labtea-001', 'Field mint': 'Mint036', 'Bog birch': 'bbirch-064',
};

function loadData() {
  const jsonPath = path.join(__dirname, 'harvest-data.json');
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function plan(data) {
  const report = { species: new Set(), keys: [], sections: new Set(), allocations: [], inventory: [], drops: [], warnings: [] };

  for (const s of data.seedlotsSpecies) report.species.add(s);
  for (const info of Object.values(SEEDLOT_MAP)) report.species.add(info.species);

  const usedKeys = new Map();
  for (const row of data.drops) {
    const m = SEEDLOT_MAP[row.seedlot];
    if (!m) { report.warnings.push(`Unmapped seedlot in drops: "${row.seedlot}" (row ${row.rowNum})`); continue; }
    usedKeys.set(m.key, m);
  }
  for (const [species, key] of Object.entries(SPECIES_TO_KEY)) {
    if (!usedKeys.has(key)) {
      usedKeys.set(key, { key, short: key.replace(/-/g, ''), species });
    }
  }
  report.keys = [...usedKeys.values()];

  for (let i = 1; i <= 26; i++) report.sections.add(String(i));

  for (const alloc of data.allocations) {
    if (alloc.stems <= 0) continue;
    const key = SPECIES_TO_KEY[alloc.species];
    if (!key) { report.warnings.push(`No key for allocation species: ${alloc.species}`); continue; }
    report.allocations.push({ section: String(alloc.area), key, boxes: Math.ceil(alloc.stems / TREES_PER_BOX), stems: alloc.stems });
  }

  for (const inv of data.reefer) {
    const key = SPECIES_TO_KEY[inv.species];
    if (!key) continue;
    report.inventory.push({ key, species: inv.species, boxes: inv.reeferBoxes || 0 });
  }
  for (const [key, info] of usedKeys) {
    if (!report.inventory.find(i => i.key === key)) {
      report.inventory.push({ key, species: info.species, boxes: 0 });
    }
  }

  for (const row of data.drops) {
    const m = SEEDLOT_MAP[row.seedlot];
    if (!m) continue;
    report.drops.push({
      date: row.date, section: String(row.area), key: m.key,
      boxes: row.boxes || 0, partialStems: row.partialStems || 0,
      crew: row.crew, rowNum: row.rowNum
    });
  }

  report.species = [...report.species];
  report.sections = [...report.sections];
  return report;
}

function apply(db, report) {
  const stats = { species: 0, keys: 0, sections: 0, allocations: 0, inventory: 0, drops: 0 };

  db.transaction(() => {
    const speciesIds = {};
    for (const name of report.species) {
      let sp = db.getSpecies(name);
      if (!sp) {
        const id = db.createSpecies(name, TREES_PER_BOX);
        sp = { id };
        stats.species++;
      }
      speciesIds[name] = sp.id;
    }

    const keyIds = {};
    for (const k of report.keys) {
      let existing = db.getRequestKey(k.key);
      if (!existing) {
        keyIds[k.key] = db.createRequestKey(k.key, speciesIds[k.species], k.short);
        stats.keys++;
      } else {
        keyIds[k.key] = existing.id;
      }
    }

    for (const s of report.sections) {
      if (!db.getSection(s)) {
        db.createSection(s, `Area ${s}`);
        stats.sections++;
      }
    }

    for (const a of report.allocations) {
      const kid = keyIds[a.key];
      if (!kid) continue;
      if (!db.getAllocation(a.section, kid)) {
        db.setAllocation(a.section, kid, a.boxes);
        stats.allocations++;
      }
    }

    for (const inv of report.inventory) {
      const kid = keyIds[inv.key];
      if (!kid) continue;
      db.updateInventory(kid, inv.boxes);
      stats.inventory++;
    }

    for (const d of report.drops) {
      const kid = keyIds[d.key];
      if (!kid) continue;
      if (d.boxes === 0 && d.partialStems === 0) continue;
      db.addDrop(d.section, kid, d.boxes, `import:${d.crew}`, d.partialStems, d.date);
      db.addActivityLogAt(`import:${d.crew}`, 'drop', d.key, d.boxes, d.section, d.date);
      stats.drops++;
    }
  })();

  return stats;
}

function summarize(report) {
  return {
    species: report.species.length,
    keys: report.keys.length,
    sections: report.sections.length,
    allocations: report.allocations.length,
    allocationBoxes: report.allocations.reduce((a, x) => a + x.boxes, 0),
    allocationStems: report.allocations.reduce((a, x) => a + x.stems, 0),
    inventoryKeys: report.inventory.length,
    inventoryBoxes: report.inventory.reduce((a, x) => a + x.boxes, 0),
    drops: report.drops.length,
    dropBoxes: report.drops.reduce((a, x) => a + x.boxes, 0),
    dropPartials: report.drops.reduce((a, x) => a + x.partialStems, 0),
  };
}

function buildReport() {
  return plan(loadData());
}

function runImport() {
  const report = buildReport();
  const db = require('../src/database');
  const stats = apply(db, report);
  return { plan: summarize(report), warnings: report.warnings, stats };
}

if (require.main === module) {
  const report = buildReport();
  const s = summarize(report);
  console.log('=== IMPORT PLAN ===');
  console.log(`Species:     ${s.species}`);
  console.log(`Keys:        ${s.keys}`);
  console.log(`Sections:    ${s.sections}`);
  console.log(`Allocations: ${s.allocations} (${s.allocationBoxes} boxes / ${s.allocationStems} stems)`);
  console.log(`Inventory:   ${s.inventoryKeys} keys (${s.inventoryBoxes} boxes seeded)`);
  console.log(`Drops:       ${s.drops} rows (${s.dropBoxes} boxes + ${s.dropPartials} partial stems)`);
  if (report.warnings.length) {
    console.log('\n⚠️ WARNINGS:');
    report.warnings.forEach(w => console.log('  -', w));
  }
  if (!APPLY) {
    console.log('\n(dry run — pass --apply to write)');
  } else {
    const db = require('../src/database');
    console.log('\n=== APPLIED ===');
    console.log(apply(db, report));
  }
}

module.exports = { buildReport, runImport };

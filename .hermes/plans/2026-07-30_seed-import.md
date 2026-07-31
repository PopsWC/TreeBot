# TreeBot Seed Data Import Plan (GGH Members Only Harvest.xlsx)

> **Status:** approved direction, ready to implement. One-time import script + one small schema decision.

**Source:** `/opt/data/cache/documents/doc_9e7be28281a9_GGH Members Only Harvest.xlsx`
- SEEDLOTS: 26 species × areas 1–26 targets (stems), 854,871 total
- TREE TRACKER: 250 real drop rows (July 25–29), crews AP/SK/RT/DP, ~180 trees/box
- THE PLAN: current reefer stock (boxes) per species

**Locked decisions:** boxes are the unit; 180 trees/box (configurable); import ALL historical drops; official request keys win, composites for the rest.

---

## Seedlot → request key mapping

Official keys in SEEDLOTS: Paper068, Paper093, BEB005, SW014, SpecA072, CGR076, Fire14A, NBS043, Chi016, StrawB028, Y41, Y45, Y43B, BJR040, Mint036, 29 (twinberry).

But TREE TRACKER crews reference **species + lot number**, e.g. "poplar 005", "green alder 055B", "cyote willow 014". Mapping (canonical key ← sheet spelling):

| Key (in TreeBot) | Short | Species | Sheet spellings |
|---|---|---|---|
| `bebbs-005` | bebbs005 | Bebb's Willow | bebbs willow 005 (BEB005 is the official key — conflict, see Q1) |
| `bpop-005` / `-011` / `-014` | bpop005… | Balsam Poplar | poplar 005/011/014, balsam poplar … |
| `galder-055b` | galder055b | Green alder | green alder 055B, Alder 55B |
| `galder-081` | galder081 | Green alder | green alder 081, alder 81 |
| `ralder-072` | ralder072 | River/Speckled alder | river alder 72 (SpecA072 official) |
| `paper-068` / `paper-093` | paper068/93 | Paper birch | paper birch 68/93 (Paper068/Paper093 official) |
| `cyote-014` | cyote014 | Coyote willow (Sandbar?) | cyote willow 014 (SW014?) |
| `yarrow-41` | y41 | Yarrow | yarrow 41 (Y41 official) |
| `tgold-067` | tgold67 | Tall goldenrod | tall golden rod 67 |
| `cgold-076` | cgold76 | Canada Goldenrod | canadian golden rod 76 (CGR076) |
| `dogbane-073` | dogbane73 | Spreading dogbane | spreding dogbane 73 (typo in sheet) |
| `dogwood-018` | dogwood18 | Red-osier dogwood | dogwood 018 |
| `bbirch-064` | bbirch64 | Bog birch | bog birch 64 |
| `twin-029` | twin29 | Twinberry | black twin berry 29 (29 official) |
| `bjr-040` | bjr40 | Bluejoint reedgrass | blue joint reedgrass 40 (BJR040) |
| `chives-016` | chives16 | Wild chives | chives 16 (Chi016) |
| `mint-036` | mint36 | Field mint | field mint 036 (Mint036) |
| `fire-14a` | fire14a | Fireweed | fireweed 14a (Fire14A) |
| `straw-028` | straw28 | Wild strawberry | wild strawberry 28 (StrawB028) |
| `nbs-043` | nbs43 | Northern bedstraw | northern bed straw 43 (NBS043) |

**Ambiguity flags needing your decision (Q1):**
- "bebbs willow 005" — official BEB005 exists; use `BEB005` as the key (preferred) with short `005`? But poplar 005 also exists → short keys must stay unique → Bebb's gets `beb005`, poplars get `bpop005/011/014`.
- "cyote willow 014" — is this Sandbar willow SW014 or a distinct Coyote willow? (Spreadsheet has no "Coyote willow" species row in SEEDLOTS; SW014 = Sandbar.) Assume SW014 unless you say otherwise.
- "river alder 72" — assume = Speckled alder SpecA072.

## Import steps (script: `scripts/import-harvest.js`, dry-run by default)

1. **Species:** 26 from SEEDLOTS + "Coyote willow", "Bog birch", "River alder" if confirmed distinct.
2. **Request keys:** per mapping above; official key as request_key where it exists (BEB005, SW014, SpecA072, Paper068/093, CGR076, Fire14A, NBS043, Chi016, StrawB028, Y41, BJR040, Mint036, twinberry "29"), composites otherwise (bpop-005, galder-055b, tgold-067, dogbane-073, dogwood-018, bbirch-064).
3. **Sections:** "1".."26" created only where they have allocations or drops (17 areas used in drops; create all 26 for completeness).
4. **Allocations (boxes):** SEEDLOTS stems ÷ 180, **rounded to 1 decimal then ceiled to whole boxes** per species×area. Splitting rule when a species has multiple seedlots in the same area (e.g. Yarrow has Y41/Y45/Y43B, poplar has 005/011/014): allocation goes to the seedlot that TREE TRACKER shows drops against in that area; if no drops, to the first listed lot. Review in dry-run output.
5. **Inventory (main stock):** THE PLAN "Boxes at Reefer" per species → assigned to that species' primary seedlot (the one with drops; else first). NA → 0. NOTE: importing drops decrements inventory — so **import order = keys → sections → allocations → inventory → drops**, with inventory set to reefer + (sum of imported drops per lot) so that after drops apply, remaining = reefer count. 
6. **Drops:** 250 rows → `drop_history` with original dates (need created_at override — see schema change below), `dropped_by = 'import:AP'` etc. Partial boxes: `# in Partial Box` stems ÷ 180 rounded to nearest whole box and noted; rows with only partials < 90 stems are recorded as 0-box activity-log entries (no drop row) to keep box counts exact. Q2 below.
7. **Activity logs:** one entry per imported drop for audit.
8. **Dry-run report:** totals per species/section vs SEEDLOTS totals (must match 854,871 stems ± rounding), drops per lot vs TREE TRACKER cumulative, inventory vs THE PLAN. You approve, then run with `--apply`.

## Schema change needed (small)

- `drop_history.created_at` currently defaults to `datetime('now')` — historical import needs to set the real date. `addDrop` gains an optional `createdAt` param (defaults unchanged). Same for `activity_logs`.
- No other schema changes. Trees/box stays a conversion factor (180) in the import script only; TreeBot stays boxes-only internally.

## Verification

- After import: `/stock` totals = THE PLAN reefer numbers; `/status section 1` dropped counts = Sheet5 reconciliation numbers (e.g. section 1 green alder 055B planted 4660 trees ≈ 26 boxes); dashboard progress bars match the paper sheet.
- Then sync to Google Sheets so the mirror reflects reality.

## Questions

1. Confirm the 3 ambiguity resolutions (BEB005→beb005 short; cyote willow 014 = SW014; river alder 72 = SpecA072)?
2. Partial boxes: round to whole boxes (simple, ±89 stems error) or should TreeBot learn "partial box" tracking later and for now just round? I recommend round for import, add partials as a feature later if crews need it.
3. Import target: run against **production** (Railway volume, currently nearly empty — just the persist-test key) — I'll delete the test key first. OK?

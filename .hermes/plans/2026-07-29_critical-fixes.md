# TreeBot Critical/High Fixes Implementation Plan

> **For Hermes:** Implement task-by-task, TDD where practical, commit per task.

**Goal:** Fix the 8 critical/high findings from the full code review so TreeBot is safe for production use.

**Scope (from review):**
1. Sheets `replaceTabData` clear-then-append data loss
2. `applyImport` not transactional
3. Twilio webhook validation fails open
4. Timeout race double-executes sync
5. Missing transactions on multi-write ops (drop, undo, deleteSection)
6. Foreign keys not enforced
7. Duplicate short_key allowed
8. Negative quantities storable

Plus tightly-coupled quick wins folded in where they touch the same code:
- `getDropsBySectionAndKey` NULL → COALESCE
- `getLatestDrop` missing `id DESC` tiebreak
- `from: whatsapp:` prefix validation in whatsapp.js
- Twilio 1600-char truncation limit (was 4000)
- ⚠️ responses misclassified as ok by API wrapper
- NaN quantity guards (web API + handlers)
- Undo drop deletes wrong row (store dropId in action_data)
- Undo crash when inventory row missing

---

## Task 1: database.js foundation (FK pragma, CHECK, transactions, tiebreaks)

**Files:** Modify `src/database.js`

**Changes:**
1. After `journal_mode = WAL` add: `db.pragma('foreign_keys = ON');`
2. New helper `withTransaction(fn)` exported: wraps `db.transaction(fn)`.
3. `deleteSection`: wrap the 3 DELETEs in `db.transaction(...)()`; also restore inventory for deleted drops before deleting? — **Decision:** NO inventory restore (matches current semantics; drops history is deleted intentionally). Transaction only.
4. `getDropsBySectionAndKey`: add `COALESCE(SUM(quantity), 0)`.
5. `getLatestDrop`: add `, id DESC` tiebreak.
6. `getRecentLogs`/`getUserLogs`: add `, id DESC` tiebreak.
7. Negative quantity guard: add validation in `updateInventory` and `upsertInventory` — throw/return error if `quantity < 0` or not a finite integer. (CHECK constraint can't be added to existing tables without rebuild; enforce at write points instead — all writes flow through these two functions.)
8. Short-key uniqueness guard: add helper `getRequestKeyByShort` already exists; uniqueness enforced at command layer (Task 4), since existing DBs may already contain duplicates and a UNIQUE index would fail to build.

**Verify:** node script — FK on (`PRAGMA foreign_keys` = 1), negative updateInventory throws, getDropsBySectionAndKey returns 0 not null, transaction rollback test (force error mid-deleteSection).

**Commit:** `fix: FK pragma, transactions, COALESCE/tiebreak fixes, negative-quantity guards`

---

## Task 2: Transactional mutations in command handlers (drop, undo)

**Files:** Modify `src/commands/index.js`, `src/database.js`

**Changes:**
1. `drop` handler: wrap `addDrop` + `updateInventory` + `addActivityLog` + `addActionHistory` in one transaction (new db helper `performDrop({...})` that does all 4 atomically and returns the new drop id).
2. Store `dropId` in action_data. 
3. `undo` drop branch: delete drop by stored `dropId` (fixes wrong-row deletion); fall back to getLatestDrop only for legacy action rows without dropId. Wrap restore-inventory + remove-drop + delete-action in a transaction.
4. `undo` drop: fix `inventory` undefined crash — compute newQty safely; if inventory row missing, recreate at `actionData.quantity`.
5. `undo` addstock: wrap in transaction.

**Verify:** end-to-end script — drop → undo restores exact state; two users drop same section/key → undo removes own drop; crash-safety via transaction rollback test.

**Commit:** `fix: transactional drop/undo; undo deletes exact drop by id`

---

## Task 3: Sync safety — transactional import, no double-execute, safe replace

**Files:** Modify `src/sync.js`, `src/sheets.js`

**Changes:**
1. `applyImport`: wrap entire import in `db.transaction()`. Need db module to expose the raw transaction wrapper — add `dbHelpers.transaction(fn)` in Task 1. On any error: rollback, return failure, do NOT clear pendingImport.
2. Timeout double-execute (`sync.js:458-483`): restructure `autoSync` — track completion with a flag; on timeout, do NOT start a second `executeSyncAction`; just return `{success:false, message:'Sync timed out — will retry on next action'}`. (The in-flight sync finishing later is harmless: replaceTabData is idempotent per-tab.)
3. Sheets replace safety (`sheets.js replaceTabData`): re-order to **append-only-after-clear-success pattern** is impossible atomically via Sheets API. Best available mitigation:
   - a) Read existing data first; if append fails after clear, attempt to restore old rows (best-effort restore in catch).
   - b) Before clearing, verify the new row set is non-empty OR explicitly allowed empty; never clear a tab when new data fetch produced 0 rows due to error.
   - Implement (a) with (b) guard. Log clearly on restore attempt.
4. Import: guard empty-tab reads — if a tab read fails, record error instead of treating as empty (sync.js generateImportPreview already records errors; applyImport must not skip silently — count as import errors and abort transaction).

**Verify:** script with mocked sheets module — simulate append failure → old data restored; simulate timeout → single execution; applyImport with forced mid-error → DB unchanged.

**Commit:** `fix: transactional import, sync timeout race, sheets clear/append restore`

---

## Task 4: Validation hardening (Twilio, short keys, NaN, ⚠️ classification, message length)

**Files:** Modify `src/index.js`, `src/whatsapp.js`, `src/commands/index.js` (addkey), `src/api.js`

**Changes:**
1. Twilio validation: `validate: process.env.TWILIO_SKIP_VALIDATION !== 'true'` — validate by default in ALL environments; only skip when explicitly opted out. Log a startup warning if validation is skipped. If `TWILIO_AUTH_TOKEN` missing AND validation not skipped → warn loudly at startup (validation can't work).
2. whatsapp.js: normalize `from` — prefix `whatsapp:` if absent. Reduce `MAX_MESSAGE_LENGTH` to 1500 (safe under 1600 with TwiML overhead).
3. addkey: reject duplicate `short_key` (check `getRequestKeyByShort(shortKey).length > 0` → error listing conflicting key).
4. Quantity validation: in `drop`, `addstock`, `setalloc` handlers add `!Number.isInteger(args.quantity) || args.quantity <= 0` → error. (Covers NaN/floats from web API.)
5. api.js `handle()`: `ok` heuristic — treat `❌` AND `⚠️` prefixes as non-ok (400); everything else ok.
6. api.js: reject non-object bodies; for `/drops`, `/stock`, `/allocations` coerce `quantity = Number(req.body.quantity)` before handler (handlers validate).

**Verify:** webhook POST without valid signature in dev now 403s only if validation forced... (twilio.webhook with validate:true rejects unsigned) — test with TWILIO_SKIP_VALIDATION=true for local dev flows; addkey duplicate short key rejected; POST /api/drops {quantity: 2.5} → 400; over-allocation drop → 400 with ⚠️ message.

**Commit:** `fix: twilio validation default-on, short-key uniqueness, NaN guards, api ok-classification`

---

## Task 5: Regression + push

1. Full lifecycle test script (fresh DB): addkey(dup short → reject) → addstock → section → alloc → drop → drop over-alloc (400 ⚠️) → undo → removesection confirm.
2. WhatsApp webhook smoke: /help, /stock via simulated POST with validation skipped locally.
3. Browser smoke: drop flow + login flow with WEB_UI_TOKEN.
4. Update README env var table (TWILIO_SKIP_VALIDATION).
5. Commit + push.

---

## Risks / notes

- Existing production DBs with duplicate short_keys or negative quantities won't be blocked retroactively — guards only prevent new writes. Import path also validates.
- `db.transaction` nesting: better-sqlite3 supports nested via savepoints automatically; autoSync runs OUTSIDE transactions (async) — transaction wraps only the sync DB writes, never awaited Sheets calls (they're after commit).
- Sheets restore-on-failure is best-effort; the real durability fix (Railway volume or Postgres) is out of scope but recommended later.

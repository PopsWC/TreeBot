const express = require('express');
const db = require('./database');
const sheets = require('./sheets');
const sync = require('./sync');
const commands = require('./commands');

const router = express.Router();

// Optional bearer-token protection for the web UI (set WEB_UI_TOKEN on Railway)
const WEB_UI_TOKEN = process.env.WEB_UI_TOKEN;
function checkToken(req, res, next) {
  if (!WEB_UI_TOKEN) return next();
  const header = req.headers.authorization || '';
  if (header === `Bearer ${WEB_UI_TOKEN}`) return next();
  res.status(401).json({ ok: false, message: 'Unauthorized' });
}
router.use(checkToken);

// Web users identify themselves by name (stored in their browser, sent as a header).
// Same trust model as WhatsApp — no accounts, just per-person attribution and undo.
function webUser(req) {
  const name = (req.headers['x-user-name'] || '').toString().trim().slice(0, 40);
  return {
    from: name ? `web:${name}` : 'web',
    name: name ? `Web (${name})` : 'Web UI'
  };
}

// Wrap a command handler so web actions behave exactly like WhatsApp commands
// (same validation, logging, undo history, Sheets auto-sync).
function handle(handler, coerceQuantity = false) {
  return async (req, res) => {
    try {
      if (coerceQuantity && req.body && req.body.quantity !== undefined) {
        req.body.quantity = Number(req.body.quantity);
      }
      const user = webUser(req);
      const text = await handler(req.body, user.from, user.name);
      // ❌ = error, ⚠️ = rejected with warning (e.g. over-allocation) — both non-ok
      const rejected = typeof text === 'string' && (text.startsWith('❌') || text.startsWith('⚠️'));
      res.status(rejected ? 400 : 200).json({ ok: !rejected, message: text });
    } catch (e) {
      console.error('API handler error:', e);
      res.status(500).json({ ok: false, message: e.message });
    }
  };
}

// ---- Read-only endpoints ----

router.get('/inventory', (req, res) => res.json(db.getAllInventory()));

router.get('/sections', (req, res) => {
  const sections = db.getAllSections();
  res.json(sections.map(s => ({ ...s, stats: db.getSectionStats(s.id) })));
});

router.get('/keys', (req, res) => res.json(db.getAllRequestKeys()));

router.get('/species', (req, res) => res.json(db.getAllSpecies()));

router.get('/allocations', (req, res) => res.json(db.getAllAllocations()));

router.get('/allocations/:section', (req, res) => {
  const allocs = db.getSectionAllocations(req.params.section);
  res.json(allocs.map(a => ({
    ...a,
    dropped: db.getDropsBySectionAndKey(a.section, a.request_key_id)?.total_dropped || 0
  })));
});

router.get('/logs', (req, res) => res.json(db.getRecentLogs(50)));

router.get('/sheets/status', (req, res) => res.json({
  connection: sheets.getConnectionStatus(),
  sync: sync.getSyncStatus()
}));

// ---- Mutation endpoints (reuse WhatsApp command handlers) ----

router.post('/drops', handle(commands.drop, true));
router.post('/stock', handle(commands.addstock, true));
router.post('/allocations', handle(commands.setalloc, true));
router.post('/keys', handle(commands.addkey));
router.post('/sections', handle(commands.addsection));
router.post('/undo', handle(commands.undo));

router.put('/sections/:id', (req, res, next) => {
  req.body = { section: req.params.id, description: req.body.description };
  handle(commands.editsection)(req, res, next);
});

router.delete('/sections/:id', (req, res, next) => {
  req.body = { section: req.params.id, confirmed: req.query.confirmed === 'true' };
  handle(commands.removesection)(req, res, next);
});

router.post('/sync', (req, res, next) => {
  req.body = { target: req.body.target || null };
  handle(commands.sync)(req, res, next);
});

// ---- Import (Sheets -> SQLite) as explicit web flow ----

router.post('/import/preview', async (req, res) => {
  try {
    const tabs = req.body && Array.isArray(req.body.tabs) && req.body.tabs.length > 0
      ? req.body.tabs
      : undefined;
    const preview = await sync.generateImportPreview(tabs);
    sync.setPendingImport(preview);
    res.json({ ok: true, preview });
  } catch (e) {
    console.error('Import preview error:', e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/import/confirm', async (req, res) => {
  try {
    const pending = sync.getPendingImport();
    if (!pending) {
      return res.status(400).json({ ok: false, message: 'No pending import. Run a preview first.' });
    }
    const results = await sync.applyImport(pending);
    sync.clearPendingImport();
    res.json({ ok: true, results });
  } catch (e) {
    console.error('Import confirm error:', e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/import/cancel', (req, res) => {
  sync.clearPendingImport();
  res.json({ ok: true, message: 'Import cancelled' });
});

module.exports = router;

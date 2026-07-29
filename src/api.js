const express = require('express');
const db = require('./database');
const sheets = require('./sheets');
const sync = require('./sync');
const commands = require('./commands');

const router = express.Router();

const WEB_USER = { from: 'web', name: 'Web UI' };

// Wrap a command handler so web actions behave exactly like WhatsApp commands
// (same validation, logging, undo history, Sheets auto-sync).
function handle(handler) {
  return async (req, res) => {
    try {
      const text = await handler(req.body, WEB_USER.from, WEB_USER.name);
      const ok = typeof text === 'string' && !text.startsWith('❌');
      res.status(ok ? 200 : 400).json({ ok, message: text });
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

router.post('/drops', handle(commands.drop));
router.post('/stock', handle(commands.addstock));
router.post('/allocations', handle(commands.setalloc));
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

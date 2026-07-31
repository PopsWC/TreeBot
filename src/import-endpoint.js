// One-time harvest import endpoint — protected by IMPORT_SECRET env var.
// Delete this file and its require() after the import is done.
const express = require('express');
const router = express.Router();

router.post('/run', async (req, res) => {
  const secret = process.env.IMPORT_SECRET;
  if (!secret || req.headers['x-import-secret'] !== secret) {
    return res.status(403).json({ ok: false, message: 'Forbidden' });
  }
  try {
    const { runImport } = require('../scripts/import-harvest-lib');
    const result = runImport();
    res.json({ ok: true, result });
  } catch (e) {
    console.error('Harvest import failed:', e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;

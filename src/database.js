const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'inventory.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS species (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS request_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT UNIQUE NOT NULL,
    species_id INTEGER NOT NULL,
    short_key TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (species_id) REFERENCES species(id)
  );

  CREATE TABLE IF NOT EXISTS main_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (request_key_id) REFERENCES request_keys(id),
    UNIQUE(request_key_id)
  );

  CREATE TABLE IF NOT EXISTS section_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    request_key_id INTEGER NOT NULL,
    target_quantity INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (section) REFERENCES sections(id),
    FOREIGN KEY (request_key_id) REFERENCES request_keys(id),
    UNIQUE(section, request_key_id)
  );

  CREATE TABLE IF NOT EXISTS drop_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    request_key_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    dropped_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (section) REFERENCES sections(id),
    FOREIGN KEY (request_key_id) REFERENCES request_keys(id)
  );

  CREATE TABLE IF NOT EXISTS action_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    action TEXT NOT NULL,
    request_key TEXT,
    quantity INTEGER,
    section TEXT,
    target_section TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Database helper functions
const dbHelpers = {
  // Species operations
  getSpecies(name) {
    return db.prepare('SELECT * FROM species WHERE name = ?').get(name);
  },

  createSpecies(name) {
    const result = db.prepare('INSERT INTO species (name) VALUES (?)').run(name);
    return result.lastInsertRowid;
  },

  getAllSpecies() {
    return db.prepare('SELECT * FROM species ORDER BY name').all();
  },

  // Request key operations
  getRequestKey(key) {
    return db.prepare(`
      SELECT rk.*, s.name as species_name 
      FROM request_keys rk 
      JOIN species s ON rk.species_id = s.id 
      WHERE rk.request_key = ?
    `).get(key);
  },

  getRequestKeyByShort(shortKey) {
    return db.prepare(`
      SELECT rk.*, s.name as species_name 
      FROM request_keys rk 
      JOIN species s ON rk.species_id = s.id 
      WHERE rk.short_key = ?
    `).all(shortKey);
  },

  createRequestKey(requestKey, speciesId, shortKey = null, notes = null) {
    const result = db.prepare(
      'INSERT INTO request_keys (request_key, species_id, short_key, notes) VALUES (?, ?, ?, ?)'
    ).run(requestKey, speciesId, shortKey, notes);
    return result.lastInsertRowid;
  },

  getAllRequestKeys() {
    return db.prepare(`
      SELECT rk.*, s.name as species_name 
      FROM request_keys rk 
      JOIN species s ON rk.species_id = s.id 
      ORDER BY s.name, rk.request_key
    `).all();
  },

  getRequestKeysBySpecies(speciesName) {
    return db.prepare(`
      SELECT rk.*, s.name as species_name 
      FROM request_keys rk 
      JOIN species s ON rk.species_id = s.id 
      WHERE s.name = ?
      ORDER BY rk.request_key
    `).all(speciesName);
  },

  // Main inventory operations
  getInventory(requestKeyId) {
    return db.prepare('SELECT * FROM main_inventory WHERE request_key_id = ?').get(requestKeyId);
  },

  updateInventory(requestKeyId, quantity) {
    const existing = db.prepare('SELECT * FROM main_inventory WHERE request_key_id = ?').get(requestKeyId);
    
    if (existing) {
      db.prepare("UPDATE main_inventory SET quantity = ?, updated_at = datetime('now') WHERE request_key_id = ?")
        .run(quantity, requestKeyId);
    } else {
      db.prepare('INSERT INTO main_inventory (request_key_id, quantity) VALUES (?, ?)')
        .run(requestKeyId, quantity);
    }
  },

  getAllInventory() {
    return db.prepare(`
      SELECT mi.*, rk.request_key, rk.short_key, s.name as species_name 
      FROM main_inventory mi
      JOIN request_keys rk ON mi.request_key_id = rk.id
      JOIN species s ON rk.species_id = s.id
      WHERE mi.quantity > 0
      ORDER BY s.name, rk.request_key
    `).all();
  },

  // Section allocation operations
  getAllocation(section, requestKeyId) {
    return db.prepare(
      'SELECT * FROM section_allocations WHERE section = ? AND request_key_id = ?'
    ).get(section, requestKeyId);
  },

  setAllocation(section, requestKeyId, targetQuantity) {
    const existing = db.prepare(
      'SELECT * FROM section_allocations WHERE section = ? AND request_key_id = ?'
    ).get(section, requestKeyId);
    
    if (existing) {
      db.prepare(
        'UPDATE section_allocations SET target_quantity = ? WHERE section = ? AND request_key_id = ?'
      ).run(targetQuantity, section, requestKeyId);
    } else {
      db.prepare(
        'INSERT INTO section_allocations (section, request_key_id, target_quantity) VALUES (?, ?, ?)'
      ).run(section, requestKeyId, targetQuantity);
    }
  },

  getSectionAllocations(section) {
    return db.prepare(`
      SELECT sa.*, rk.request_key, rk.short_key, s.name as species_name
      FROM section_allocations sa
      JOIN request_keys rk ON sa.request_key_id = rk.id
      JOIN species s ON rk.species_id = s.id
      WHERE sa.section = ?
      ORDER BY s.name
    `).all(section);
  },

  getAllAllocations() {
    return db.prepare(`
      SELECT sa.*, rk.request_key, rk.short_key, s.name as species_name
      FROM section_allocations sa
      JOIN request_keys rk ON sa.request_key_id = rk.id
      JOIN species s ON rk.species_id = s.id
      ORDER BY sa.section, s.name
    `).all();
  },

  // Drop history operations
  getDropsBySection(section) {
    return db.prepare(`
      SELECT dh.*, rk.request_key, rk.short_key, s.name as species_name
      FROM drop_history dh
      JOIN request_keys rk ON dh.request_key_id = rk.id
      JOIN species s ON rk.species_id = s.id
      WHERE dh.section = ?
      ORDER BY dh.created_at DESC
    `).all(section);
  },

  getDropsBySectionAndKey(section, requestKeyId) {
    return db.prepare(`
      SELECT SUM(quantity) as total_dropped
      FROM drop_history
      WHERE section = ? AND request_key_id = ?
    `).get(section, requestKeyId);
  },

  addDrop(section, requestKeyId, quantity, droppedBy) {
    const result = db.prepare(
      'INSERT INTO drop_history (section, request_key_id, quantity, dropped_by) VALUES (?, ?, ?, ?)'
    ).run(section, requestKeyId, quantity, droppedBy);
    return result.lastInsertRowid;
  },

  removeDrop(dropId) {
    return db.prepare('DELETE FROM drop_history WHERE id = ?').run(dropId);
  },

  getLatestDrop(section, requestKeyId, droppedBy) {
    return db.prepare(
      'SELECT id FROM drop_history WHERE section = ? AND request_key_id = ? AND dropped_by = ? ORDER BY created_at DESC LIMIT 1'
    ).get(section, requestKeyId, droppedBy);
  },

  getLastDrops(userPhone, limit = 5) {
    return db.prepare(`
      SELECT dh.*, rk.request_key, s.name as species_name
      FROM drop_history dh
      JOIN request_keys rk ON dh.request_key_id = rk.id
      JOIN species s ON rk.species_id = s.id
      WHERE dh.dropped_by = ?
      ORDER BY dh.created_at DESC
      LIMIT ?
    `).all(userPhone, limit);
  },

  // Action history for undo
  addActionHistory(userPhone, actionType, actionData) {
    const result = db.prepare(
      'INSERT INTO action_history (user_phone, action_type, action_data) VALUES (?, ?, ?)'
    ).run(userPhone, actionType, JSON.stringify(actionData));
    return result.lastInsertRowid;
  },

  getLastUserActions(userPhone, limit = 5) {
    return db.prepare(
      'SELECT * FROM action_history WHERE user_phone = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userPhone, limit);
  },

  deleteActionHistory(actionId) {
    return db.prepare('DELETE FROM action_history WHERE id = ?').run(actionId);
  },

  // Activity logs
  addActivityLog(userPhone, action, requestKey, quantity, section, targetSection = null) {
    db.prepare(
      'INSERT INTO activity_logs (user_phone, action, request_key, quantity, section, target_section) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userPhone, action, requestKey, quantity, section, targetSection);
  },

  getRecentLogs(limit = 10) {
    return db.prepare(
      'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  },

  getUserLogs(userPhone, limit = 10) {
    return db.prepare(
      'SELECT * FROM activity_logs WHERE user_phone = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userPhone, limit);
  },

  // Section operations
  getSection(sectionId) {
    return db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);
  },

  createSection(sectionId, description = null) {
    const result = db.prepare(
      'INSERT INTO sections (id, description) VALUES (?, ?)'
    ).run(sectionId, description);
    return result;
  },

  updateSection(sectionId, description) {
    return db.prepare(
      'UPDATE sections SET description = ? WHERE id = ?'
    ).run(description, sectionId);
  },

  deleteSection(sectionId) {
    // Delete related records first
    db.prepare('DELETE FROM drop_history WHERE section = ?').run(sectionId);
    db.prepare('DELETE FROM section_allocations WHERE section = ?').run(sectionId);
    return db.prepare('DELETE FROM sections WHERE id = ?').run(sectionId);
  },

  getAllSections() {
    return db.prepare('SELECT * FROM sections ORDER BY id').all();
  },

  getSectionStats(sectionId) {
    const allocations = db.prepare(
      'SELECT COUNT(*) as count FROM section_allocations WHERE section = ?'
    ).get(sectionId);
    const drops = db.prepare(
      'SELECT COUNT(*) as count, COALESCE(SUM(quantity), 0) as total FROM drop_history WHERE section = ?'
    ).get(sectionId);
    return {
      allocations: allocations.count,
      drops: drops.count,
      totalDropped: drops.total
    };
  },

  // Get all data for sheets sync
  getAllInventoryForSync() {
    return db.prepare(`
      SELECT mi.*, rk.request_key, rk.short_key, s.name as species_name, 
             mi.updated_at as last_updated
      FROM main_inventory mi
      JOIN request_keys rk ON mi.request_key_id = rk.id
      JOIN species s ON rk.species_id = s.id
      ORDER BY s.name, rk.request_key
    `).all();
  },

  getAllAllocationsForSync() {
    return db.prepare(`
      SELECT sa.*, rk.request_key, rk.short_key, s.name as species_name,
             (SELECT COALESCE(SUM(quantity), 0) FROM drop_history 
              WHERE section = sa.section AND request_key_id = sa.request_key_id) as dropped,
             sa.target_quantity - (SELECT COALESCE(SUM(quantity), 0) FROM drop_history 
              WHERE section = sa.section AND request_key_id = sa.request_key_id) as remaining
      FROM section_allocations sa
      JOIN request_keys rk ON sa.request_key_id = rk.id
      JOIN species s ON rk.species_id = s.id
      ORDER BY sa.section, s.name
    `).all();
  },

  getAllDropsForSync() {
    return db.prepare(`
      SELECT dh.*, rk.request_key, s.name as species_name
      FROM drop_history dh
      JOIN request_keys rk ON dh.request_key_id = rk.id
      JOIN species s ON rk.species_id = s.id
      ORDER BY dh.created_at DESC
      LIMIT 500
    `).all();
  },

  getAllLogsForSync() {
    return db.prepare(
      'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 500'
    ).all();
  },

  // Get all request keys for sync (including zero inventory)
  getAllRequestKeysForSync() {
    return db.prepare(`
      SELECT rk.*, s.name as species_name
      FROM request_keys rk
      JOIN species s ON rk.species_id = s.id
      ORDER BY s.name, rk.request_key
    `).all();
  },

  // Upsert functions for import
  upsertInventory(requestKey, quantity) {
    const key = db.prepare('SELECT id FROM request_keys WHERE request_key = ?').get(requestKey);
    if (!key) {
      return { success: false, action: 'skipped', error: `Request key "${requestKey}" not found` };
    }
    
    const existing = db.prepare('SELECT * FROM main_inventory WHERE request_key_id = ?').get(key.id);
    
    if (existing) {
      db.prepare("UPDATE main_inventory SET quantity = ?, updated_at = datetime('now') WHERE request_key_id = ?")
        .run(quantity, key.id);
      return { success: true, action: 'updated', requestKey };
    } else {
      db.prepare('INSERT INTO main_inventory (request_key_id, quantity) VALUES (?, ?)')
        .run(key.id, quantity);
      return { success: true, action: 'inserted', requestKey };
    }
  },

  upsertAllocation(section, requestKey, targetQuantity) {
    const sectionExists = db.prepare('SELECT id FROM sections WHERE id = ?').get(section);
    if (!sectionExists) {
      return { success: false, action: 'skipped', error: `Section "${section}" not found` };
    }
    
    const key = db.prepare('SELECT id FROM request_keys WHERE request_key = ?').get(requestKey);
    if (!key) {
      return { success: false, action: 'skipped', error: `Request key "${requestKey}" not found` };
    }
    
    const existing = db.prepare(
      'SELECT * FROM section_allocations WHERE section = ? AND request_key_id = ?'
    ).get(section, key.id);
    
    if (existing) {
      db.prepare(
        'UPDATE section_allocations SET target_quantity = ? WHERE section = ? AND request_key_id = ?'
      ).run(targetQuantity, section, key.id);
      return { success: true, action: 'updated', section, requestKey };
    } else {
      db.prepare(
        'INSERT INTO section_allocations (section, request_key_id, target_quantity) VALUES (?, ?, ?)'
      ).run(section, key.id, targetQuantity);
      return { success: true, action: 'inserted', section, requestKey };
    }
  },

  upsertRequestKey(requestKey, shortKey, speciesName, notes) {
    // Get or create species
    let species = db.prepare('SELECT id FROM species WHERE name = ?').get(speciesName);
    if (!species) {
      const result = db.prepare('INSERT INTO species (name) VALUES (?)').run(speciesName);
      species = { id: result.lastInsertRowid };
    }
    
    const existing = db.prepare('SELECT id FROM request_keys WHERE request_key = ?').get(requestKey);
    
    if (existing) {
      db.prepare(
        'UPDATE request_keys SET species_id = ?, short_key = ?, notes = ? WHERE request_key = ?'
      ).run(species.id, shortKey || null, notes || null, requestKey);
      return { success: true, action: 'updated', requestKey };
    } else {
      db.prepare(
        'INSERT INTO request_keys (request_key, species_id, short_key, notes) VALUES (?, ?, ?, ?)'
      ).run(requestKey, species.id, shortKey || null, notes || null);
      return { success: true, action: 'inserted', requestKey };
    }
  },

  upsertSection(sectionId, description) {
    const existing = db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId);
    
    if (existing) {
      if (description) {
        db.prepare('UPDATE sections SET description = ? WHERE id = ?').run(description, sectionId);
      }
      return { success: true, action: 'updated', sectionId };
    } else {
      db.prepare('INSERT INTO sections (id, description) VALUES (?, ?)').run(sectionId, description || null);
      return { success: true, action: 'inserted', sectionId };
    }
  },

  requestKeyExists(requestKey) {
    return !!db.prepare('SELECT id FROM request_keys WHERE request_key = ?').get(requestKey);
  },

  sectionExists(sectionId) {
    return !!db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId);
  }
};

module.exports = dbHelpers;

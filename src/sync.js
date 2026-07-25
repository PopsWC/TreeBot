const db = require('./database');
const sheets = require('./sheets');

// Tab names
const TABS = {
  INVENTORY: 'Inventory',
  ALLOCATIONS: 'Allocations',
  DROPS: 'Drop History',
  LOGS: 'Activity Log',
  SECTIONS: 'Sections',
  REQUEST_KEYS: 'Request Keys'
};

// Importable tabs (excluding Drop History and Activity Log)
const IMPORT_TABS = ['Inventory', 'Allocations', 'Request Keys', 'Sections'];

// Expected columns for each importable tab
const IMPORT_COLUMNS = {
  'Inventory': ['Request Key', 'Short Key', 'Species', 'Quantity', 'Last Updated'],
  'Allocations': ['Section', 'Request Key', 'Short Key', 'Species', 'Target', 'Dropped', 'Remaining'],
  'Request Keys': ['Request Key', 'Short Key', 'Species', 'Notes', 'Created'],
  'Sections': ['Section ID', 'Description', 'Created']
};

// Track last sync times
const lastSyncTimes = {
  [TABS.INVENTORY]: null,
  [TABS.ALLOCATIONS]: null,
  [TABS.DROPS]: null,
  [TABS.LOGS]: null,
  [TABS.SECTIONS]: null,
  [TABS.REQUEST_KEYS]: null
};

// Pending import storage
let pendingImport = null;

// Sync inventory tab
async function syncInventory() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not connected' };
  }
  
  try {
    const inventory = db.getAllInventoryForSync();
    
    const rows = inventory.map(item => [
      item.request_key,
      item.short_key || '',
      item.species_name,
      item.quantity,
      item.last_updated || new Date().toISOString()
    ]);
    
    // Add header
    const header = ['Request Key', 'Short Key', 'Species', 'Quantity', 'Last Updated'];
    rows.unshift(header);
    
    const result = await sheets.replaceTabData(TABS.INVENTORY, rows);
    
    if (result.success) {
      lastSyncTimes[TABS.INVENTORY] = new Date().toISOString();
      console.log(`Synced Inventory: ${inventory.length} rows`);
      return { success: true, count: inventory.length };
    } else {
      console.error(`Failed to sync Inventory: ${result.error}`);
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('Error syncing inventory:', error);
    return { success: false, message: error.message };
  }
}

// Sync allocations tab
async function syncAllocations() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not connected' };
  }
  
  try {
    const allocations = db.getAllAllocationsForSync();
    
    const rows = allocations.map(item => [
      item.section,
      item.request_key,
      item.short_key || '',
      item.species_name,
      item.target_quantity,
      item.dropped,
      item.remaining
    ]);
    
    // Add header
    const header = ['Section', 'Request Key', 'Short Key', 'Species', 'Target', 'Dropped', 'Remaining'];
    rows.unshift(header);
    
    const result = await sheets.replaceTabData(TABS.ALLOCATIONS, rows);
    
    if (result.success) {
      lastSyncTimes[TABS.ALLOCATIONS] = new Date().toISOString();
      console.log(`Synced Allocations: ${allocations.length} rows`);
      return { success: true, count: allocations.length };
    } else {
      console.error(`Failed to sync Allocations: ${result.error}`);
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('Error syncing allocations:', error);
    return { success: false, message: error.message };
  }
}

// Sync drop history tab
async function syncDrops() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not connected' };
  }
  
  try {
    const drops = db.getAllDropsForSync();
    
    const rows = drops.map(item => [
      item.created_at,
      item.dropped_by || '',
      item.request_key,
      item.species_name,
      item.quantity,
      item.section
    ]);
    
    // Add header
    const header = ['Timestamp', 'User', 'Request Key', 'Species', 'Quantity', 'Section'];
    rows.unshift(header);
    
    const result = await sheets.replaceTabData(TABS.DROPS, rows);
    
    if (result.success) {
      lastSyncTimes[TABS.DROPS] = new Date().toISOString();
      console.log(`Synced Drop History: ${drops.length} rows`);
      return { success: true, count: drops.length };
    } else {
      console.error(`Failed to sync Drop History: ${result.error}`);
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('Error syncing drops:', error);
    return { success: false, message: error.message };
  }
}

// Sync activity log tab
async function syncLogs() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not connected' };
  }
  
  try {
    const logs = db.getAllLogsForSync();
    
    const rows = logs.map(item => [
      item.created_at,
      item.user_phone,
      item.action,
      item.request_key || '',
      item.quantity || '',
      item.section || '',
      item.target_section || ''
    ]);
    
    // Add header
    const header = ['Timestamp', 'User', 'Action', 'Request Key', 'Quantity', 'Section', 'Target Section'];
    rows.unshift(header);
    
    const result = await sheets.replaceTabData(TABS.LOGS, rows);
    
    if (result.success) {
      lastSyncTimes[TABS.LOGS] = new Date().toISOString();
      console.log(`Synced Activity Log: ${logs.length} rows`);
      return { success: true, count: logs.length };
    } else {
      console.error(`Failed to sync Activity Log: ${result.error}`);
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('Error syncing logs:', error);
    return { success: false, message: error.message };
  }
}

// Sync sections tab
async function syncSections() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not connected' };
  }
  
  try {
    const sections = db.getAllSections();
    
    const rows = sections.map(item => [
      item.id,
      item.description || '',
      item.created_at
    ]);
    
    // Add header
    const header = ['Section ID', 'Description', 'Created'];
    rows.unshift(header);
    
    const result = await sheets.replaceTabData(TABS.SECTIONS, rows);
    
    if (result.success) {
      lastSyncTimes[TABS.SECTIONS] = new Date().toISOString();
      console.log(`Synced Sections: ${sections.length} rows`);
      return { success: true, count: sections.length };
    } else {
      console.error(`Failed to sync Sections: ${result.error}`);
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('Error syncing sections:', error);
    return { success: false, message: error.message };
  }
}

// Sync request keys tab
async function syncRequestKeys() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not connected' };
  }
  
  try {
    const requestKeys = db.getAllRequestKeysForSync();
    
    const rows = requestKeys.map(item => [
      item.request_key,
      item.short_key || '',
      item.species_name,
      item.notes || '',
      item.created_at
    ]);
    
    // Add header
    const header = ['Request Key', 'Short Key', 'Species', 'Notes', 'Created'];
    rows.unshift(header);
    
    const result = await sheets.replaceTabData(TABS.REQUEST_KEYS, rows);
    
    if (result.success) {
      lastSyncTimes[TABS.REQUEST_KEYS] = new Date().toISOString();
      console.log(`Synced Request Keys: ${requestKeys.length} rows`);
      return { success: true, count: requestKeys.length };
    } else {
      console.error(`Failed to sync Request Keys: ${result.error}`);
      return { success: false, message: result.error };
    }
  } catch (error) {
    console.error('Error syncing request keys:', error);
    return { success: false, message: error.message };
  }
}

// Sync all tabs
async function syncAll() {
  if (!sheets.isAvailable()) {
    return { 
      success: false, 
      message: 'Google Sheets not connected',
      results: []
    };
  }
  
  const results = [];
  
  const inventoryResult = await syncInventory();
  results.push({ tab: 'Inventory', ...inventoryResult });
  
  const allocationsResult = await syncAllocations();
  results.push({ tab: 'Allocations', ...allocationsResult });
  
  const dropsResult = await syncDrops();
  results.push({ tab: 'Drop History', ...dropsResult });
  
  const logsResult = await syncLogs();
  results.push({ tab: 'Activity Log', ...logsResult });
  
  const sectionsResult = await syncSections();
  results.push({ tab: 'Sections', ...sectionsResult });
  
  const requestKeysResult = await syncRequestKeys();
  results.push({ tab: 'Request Keys', ...requestKeysResult });
  
  const allSuccess = results.every(r => r.success);
  
  return {
    success: allSuccess,
    message: allSuccess ? 'All tabs synced' : 'Some tabs failed to sync',
    results
  };
}

// Sync specific tab
async function syncTab(target) {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not connected' };
  }
  
  const lowerTarget = target.toLowerCase();
  
  if (lowerTarget.includes('inventory')) {
    return await syncInventory();
  }
  
  if (lowerTarget.includes('alloc')) {
    return await syncAllocations();
  }
  
  if (lowerTarget.includes('drop')) {
    return await syncDrops();
  }
  
  if (lowerTarget.includes('log')) {
    return await syncLogs();
  }
  
  if (lowerTarget.includes('section')) {
    return await syncSections();
  }
  
  if (lowerTarget.includes('request') || lowerTarget.includes('key')) {
    return await syncRequestKeys();
  }
  
  return { success: false, message: `Unknown target: ${target}. Use: inventory, allocations, drops, logs, sections, request keys` };
}

// Auto-sync specific tabs after actions (called from command handlers)
async function autoSync(actionType) {
  if (!sheets.isAvailable()) {
    return { 
      success: false, 
      message: 'Google Sheets not connected',
      synced: [] 
    };
  }
  
  const synced = [];
  const errors = [];
  
  try {
    switch (actionType) {
      case 'addstock':
      case 'drop': {
        const inv = await syncInventory();
        const alloc = await syncAllocations();
        const drops = await syncDrops();
        const logs = await syncLogs();
        
        if (inv.success) synced.push('Inventory');
        else errors.push(`Inventory: ${inv.message}`);
        
        if (alloc.success) synced.push('Allocations');
        else errors.push(`Allocations: ${alloc.message}`);
        
        if (drops.success) synced.push('Drops');
        else errors.push(`Drops: ${drops.message}`);
        
        if (logs.success) synced.push('Logs');
        else errors.push(`Logs: ${logs.message}`);
        break;
      }
      
      case 'setalloc': {
        const alloc = await syncAllocations();
        const logs = await syncLogs();
        
        if (alloc.success) synced.push('Allocations');
        else errors.push(`Allocations: ${alloc.message}`);
        
        if (logs.success) synced.push('Logs');
        else errors.push(`Logs: ${logs.message}`);
        break;
      }
      
      case 'addsection':
      case 'removesection':
      case 'editsection': {
        const sections = await syncSections();
        const alloc = await syncAllocations();
        const logs = await syncLogs();
        
        if (sections.success) synced.push('Sections');
        else errors.push(`Sections: ${sections.message}`);
        
        if (alloc.success) synced.push('Allocations');
        else errors.push(`Allocations: ${alloc.message}`);
        
        if (logs.success) synced.push('Logs');
        else errors.push(`Logs: ${logs.message}`);
        break;
      }
      
      case 'addkey': {
        const inv = await syncInventory();
        const requestKeys = await syncRequestKeys();
        const logs = await syncLogs();
        
        if (inv.success) synced.push('Inventory');
        else errors.push(`Inventory: ${inv.message}`);
        
        if (requestKeys.success) synced.push('Request Keys');
        else errors.push(`Request Keys: ${requestKeys.message}`);
        
        if (logs.success) synced.push('Logs');
        else errors.push(`Logs: ${logs.message}`);
        break;
      }
      
      case 'import': {
        const allResult = await syncAll();
        if (allResult.success) {
          synced.push('All tabs');
        } else {
          for (const r of allResult.results) {
            if (r.success) synced.push(r.tab);
            else errors.push(`${r.tab}: ${r.message}`);
          }
        }
        break;
      }
      
      default: {
        // Unknown action, sync all
        const allResult = await syncAll();
        if (allResult.success) {
          synced.push('All tabs');
        } else {
          errors.push('Some tabs failed');
        }
      }
    }
    
    return {
      success: errors.length === 0,
      message: errors.length === 0 
        ? `Synced: ${synced.join(', ')}`
        : `Synced: ${synced.join(', ')}${errors.length > 0 ? `\nFailed: ${errors.join(', ')}` : ''}`,
      synced,
      errors
    };
  } catch (error) {
    console.error('Auto-sync error:', error);
    return {
      success: false,
      message: `Sync error: ${error.message}`,
      synced,
      errors: [error.message]
    };
  }
}

// Get sync status for debugging
function getSyncStatus() {
  return {
    available: sheets.isAvailable(),
    lastSyncTimes,
    tabs: Object.keys(TABS).map(key => ({
      name: TABS[key],
      lastSync: lastSyncTimes[TABS[key]]
    }))
  };
}

// Format sync status for display
function formatSyncStatus(syncResult) {
  if (!syncResult) return '';
  
  if (syncResult.success) {
    return `📊 Sync: ✅ ${syncResult.synced.join(', ')}`;
  } else {
    const syncedStr = syncResult.synced.length > 0 ? `✅ ${syncResult.synced.join(', ')}` : '';
    const failed = syncResult.errors.length > 0 ? `❌ ${syncResult.errors.join(', ')}` : '';
    return `📊 Sync: ${[syncedStr, failed].filter(Boolean).join(' | ')}`;
  }
}

// ==================== IMPORT FUNCTIONS ====================

// Parse inventory rows from Sheets
function parseInventoryRows(rows) {
  const parsed = [];
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const requestKey = row['Request Key']?.trim();
    const quantity = row['Quantity']?.trim();
    
    if (!requestKey) {
      errors.push(`Row ${i + 2}: Missing Request Key`);
      continue;
    }
    
    if (!quantity || isNaN(parseInt(quantity))) {
      errors.push(`Row ${i + 2}: Invalid quantity for "${requestKey}"`);
      continue;
    }
    
    parsed.push({
      requestKey,
      quantity: parseInt(quantity)
    });
  }
  
  return { parsed, errors };
}

// Parse allocations rows from Sheets
function parseAllocationsRows(rows) {
  const parsed = [];
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const section = row['Section']?.trim();
    const requestKey = row['Request Key']?.trim();
    const target = row['Target']?.trim();
    
    if (!section) {
      errors.push(`Row ${i + 2}: Missing Section`);
      continue;
    }
    
    if (!requestKey) {
      errors.push(`Row ${i + 2}: Missing Request Key`);
      continue;
    }
    
    if (!target || isNaN(parseInt(target))) {
      errors.push(`Row ${i + 2}: Invalid target for "${requestKey}" in section "${section}"`);
      continue;
    }
    
    parsed.push({
      section,
      requestKey,
      targetQuantity: parseInt(target)
    });
  }
  
  return { parsed, errors };
}

// Parse request keys rows from Sheets
function parseRequestKeysRows(rows) {
  const parsed = [];
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const requestKey = row['Request Key']?.trim();
    const shortKey = row['Short Key']?.trim();
    const species = row['Species']?.trim();
    const notes = row['Notes']?.trim();
    
    if (!requestKey) {
      errors.push(`Row ${i + 2}: Missing Request Key`);
      continue;
    }
    
    if (!species) {
      errors.push(`Row ${i + 2}: Missing Species for "${requestKey}"`);
      continue;
    }
    
    parsed.push({
      requestKey,
      shortKey: shortKey || null,
      species,
      notes: notes || null
    });
  }
  
  return { parsed, errors };
}

// Parse sections rows from Sheets
function parseSectionsRows(rows) {
  const parsed = [];
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sectionId = row['Section ID']?.trim();
    const description = row['Description']?.trim();
    
    if (!sectionId) {
      errors.push(`Row ${i + 2}: Missing Section ID`);
      continue;
    }
    
    parsed.push({
      sectionId,
      description: description || null
    });
  }
  
  return { parsed, errors };
}

// Check what would change for inventory
function checkInventoryChanges(data) {
  const newItems = [];
  const updatedItems = [];
  const unchangedItems = [];
  
  for (const item of data) {
    const existing = db.getRequestKey(item.requestKey);
    if (!existing) {
      // Key doesn't exist in DB, will be skipped during import
      continue;
    }
    
    const inventory = db.getInventory(existing.id);
    const currentQty = inventory?.quantity || 0;
    
    if (!inventory) {
      newItems.push(item);
    } else if (currentQty !== item.quantity) {
      updatedItems.push({ ...item, currentQty });
    } else {
      unchangedItems.push(item);
    }
  }
  
  return { new: newItems, updated: updatedItems, unchanged: unchangedItems };
}

// Check what would change for allocations
function checkAllocationChanges(data) {
  const newItems = [];
  const updatedItems = [];
  const unchangedItems = [];
  
  for (const item of data) {
    const existing = db.getAllocation(item.section, db.getRequestKey(item.requestKey)?.id);
    
    if (!existing) {
      newItems.push(item);
    } else if (existing.target_quantity !== item.targetQuantity) {
      updatedItems.push({ ...item, currentTarget: existing.target_quantity });
    } else {
      unchangedItems.push(item);
    }
  }
  
  return { new: newItems, updated: updatedItems, unchanged: unchangedItems };
}

// Check what would change for request keys
function checkRequestKeyChanges(data) {
  const newItems = [];
  const updatedItems = [];
  const unchangedItems = [];
  
  for (const item of data) {
    const existing = db.getRequestKey(item.requestKey);
    
    if (!existing) {
      newItems.push(item);
    } else {
      // Check if any fields changed
      const speciesChanged = existing.species_name !== item.species;
      const shortKeyChanged = existing.short_key !== item.shortKey;
      const notesChanged = existing.notes !== item.notes;
      
      if (speciesChanged || shortKeyChanged || notesChanged) {
        updatedItems.push(item);
      } else {
        unchangedItems.push(item);
      }
    }
  }
  
  return { new: newItems, updated: updatedItems, unchanged: unchangedItems };
}

// Check what would change for sections
function checkSectionChanges(data) {
  const newItems = [];
  const updatedItems = [];
  const unchangedItems = [];
  
  for (const item of data) {
    const existing = db.getSection(item.sectionId);
    
    if (!existing) {
      newItems.push(item);
    } else if (item.description && existing.description !== item.description) {
      updatedItems.push(item);
    } else {
      unchangedItems.push(item);
    }
  }
  
  return { new: newItems, updated: updatedItems, unchanged: unchangedItems };
}

// Generate import preview
async function generateImportPreview(tabs = IMPORT_TABS) {
  const preview = {
    inventory: null,
    allocations: null,
    requestKeys: null,
    sections: null
  };
  
  // Read and parse each tab
  if (tabs.includes('Inventory')) {
    const result = await sheets.readTabData('Inventory');
    if (result.success && result.data.length > 0) {
      const { parsed, errors } = parseInventoryRows(result.data);
      const changes = checkInventoryChanges(parsed);
      preview.inventory = {
        found: result.data.length,
        valid: parsed.length,
        errors: errors,
        ...changes
      };
    } else {
      preview.inventory = {
        found: 0,
        valid: 0,
        errors: result.error ? [result.error] : [],
        new: [],
        updated: [],
        unchanged: []
      };
    }
  }
  
  if (tabs.includes('Allocations')) {
    const result = await sheets.readTabData('Allocations');
    if (result.success && result.data.length > 0) {
      const { parsed, errors } = parseAllocationsRows(result.data);
      const changes = checkAllocationChanges(parsed);
      preview.allocations = {
        found: result.data.length,
        valid: parsed.length,
        errors: errors,
        ...changes
      };
    } else {
      preview.allocations = {
        found: 0,
        valid: 0,
        errors: result.error ? [result.error] : [],
        new: [],
        updated: [],
        unchanged: []
      };
    }
  }
  
  if (tabs.includes('Request Keys')) {
    const result = await sheets.readTabData('Request Keys');
    if (result.success && result.data.length > 0) {
      const { parsed, errors } = parseRequestKeysRows(result.data);
      const changes = checkRequestKeyChanges(parsed);
      preview.requestKeys = {
        found: result.data.length,
        valid: parsed.length,
        errors: errors,
        ...changes
      };
    } else {
      preview.requestKeys = {
        found: 0,
        valid: 0,
        errors: result.error ? [result.error] : [],
        new: [],
        updated: [],
        unchanged: []
      };
    }
  }
  
  if (tabs.includes('Sections')) {
    const result = await sheets.readTabData('Sections');
    if (result.success && result.data.length > 0) {
      const { parsed, errors } = parseSectionsRows(result.data);
      const changes = checkSectionChanges(parsed);
      preview.sections = {
        found: result.data.length,
        valid: parsed.length,
        errors: errors,
        ...changes
      };
    } else {
      preview.sections = {
        found: 0,
        valid: 0,
        errors: result.error ? [result.error] : [],
        new: [],
        updated: [],
        unchanged: []
      };
    }
  }
  
  return preview;
}

// Apply import to database (transactional)
async function applyImport(preview) {
  const results = {
    inventory: { inserted: 0, updated: 0, skipped: 0, errors: [] },
    allocations: { inserted: 0, updated: 0, skipped: 0, errors: [] },
    requestKeys: { inserted: 0, updated: 0, skipped: 0, errors: [] },
    sections: { inserted: 0, updated: 0, skipped: 0, errors: [] }
  };
  
  // Import request keys first (dependencies)
  if (preview.requestKeys) {
    // Re-parse to get fresh data
    const result = await sheets.readTabData('Request Keys');
    if (result.success) {
      const { parsed } = parseRequestKeysRows(result.data);
      for (const item of parsed) {
        const upsertResult = db.upsertRequestKey(item.requestKey, item.shortKey, item.species, item.notes);
        if (upsertResult.success) {
          if (upsertResult.action === 'inserted') results.requestKeys.inserted++;
          else results.requestKeys.updated++;
        } else {
          results.requestKeys.skipped++;
          results.requestKeys.errors.push(upsertResult.error);
        }
      }
    }
  }
  
  // Import sections
  if (preview.sections) {
    const result = await sheets.readTabData('Sections');
    if (result.success) {
      const { parsed } = parseSectionsRows(result.data);
      for (const item of parsed) {
        const upsertResult = db.upsertSection(item.sectionId, item.description);
        if (upsertResult.success) {
          if (upsertResult.action === 'inserted') results.sections.inserted++;
          else results.sections.updated++;
        } else {
          results.sections.skipped++;
          results.sections.errors.push(upsertResult.error);
        }
      }
    }
  }
  
  // Import inventory
  if (preview.inventory) {
    const result = await sheets.readTabData('Inventory');
    if (result.success) {
      const { parsed } = parseInventoryRows(result.data);
      for (const item of parsed) {
        const upsertResult = db.upsertInventory(item.requestKey, item.quantity);
        if (upsertResult.success) {
          if (upsertResult.action === 'inserted') results.inventory.inserted++;
          else results.inventory.updated++;
        } else {
          results.inventory.skipped++;
          results.inventory.errors.push(upsertResult.error);
        }
      }
    }
  }
  
  // Import allocations
  if (preview.allocations) {
    const result = await sheets.readTabData('Allocations');
    if (result.success) {
      const { parsed } = parseAllocationsRows(result.data);
      for (const item of parsed) {
        const upsertResult = db.upsertAllocation(item.section, item.requestKey, item.targetQuantity);
        if (upsertResult.success) {
          if (upsertResult.action === 'inserted') results.allocations.inserted++;
          else results.allocations.updated++;
        } else {
          results.allocations.skipped++;
          results.allocations.errors.push(upsertResult.error);
        }
      }
    }
  }
  
  return results;
}

// Store pending import
function setPendingImport(preview) {
  pendingImport = preview;
}

// Get pending import
function getPendingImport() {
  return pendingImport;
}

// Clear pending import
function clearPendingImport() {
  pendingImport = null;
}

module.exports = {
  syncInventory,
  syncAllocations,
  syncDrops,
  syncLogs,
  syncSections,
  syncRequestKeys,
  syncAll,
  syncTab,
  autoSync,
  getSyncStatus,
  formatSyncStatus,
  TABS,
  IMPORT_TABS,
  generateImportPreview,
  applyImport,
  setPendingImport,
  getPendingImport,
  clearPendingImport
};

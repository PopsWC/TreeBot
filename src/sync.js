const db = require('./database');
const sheets = require('./sheets');

// Tab names
const TABS = {
  INVENTORY: 'Inventory',
  ALLOCATIONS: 'Allocations',
  DROPS: 'Drop History',
  LOGS: 'Activity Log',
  SECTIONS: 'Sections'
};

// Track last sync times
const lastSyncTimes = {
  [TABS.INVENTORY]: null,
  [TABS.ALLOCATIONS]: null,
  [TABS.DROPS]: null,
  [TABS.LOGS]: null,
  [TABS.SECTIONS]: null
};

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
  
  return { success: false, message: `Unknown target: ${target}. Use: inventory, allocations, drops, logs, sections` };
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
        const logs = await syncLogs();
        
        if (inv.success) synced.push('Inventory');
        else errors.push(`Inventory: ${inv.message}`);
        
        if (logs.success) synced.push('Logs');
        else errors.push(`Logs: ${logs.message}`);
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
    const synced = syncResult.synced.length > 0 ? `✅ ${syncResult.synced.join(', ')}` : '';
    const failed = syncResult.errors.length > 0 ? `❌ ${syncResult.errors.join(', ')}` : '';
    return `📊 Sync: ${[synced, failed].filter(Boolean).join(' | ')}`;
  }
}

module.exports = {
  syncInventory,
  syncAllocations,
  syncDrops,
  syncLogs,
  syncSections,
  syncAll,
  syncTab,
  autoSync,
  getSyncStatus,
  formatSyncStatus,
  TABS
};

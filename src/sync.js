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

// Sync inventory tab
async function syncInventory() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not configured' };
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
    
    await sheets.replaceTabData(TABS.INVENTORY, rows);
    console.log(`Synced Inventory: ${inventory.length} rows`);
    
    return { success: true, count: inventory.length };
  } catch (error) {
    console.error('Error syncing inventory:', error);
    return { success: false, message: error.message };
  }
}

// Sync allocations tab
async function syncAllocations() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not configured' };
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
    
    await sheets.replaceTabData(TABS.ALLOCATIONS, rows);
    console.log(`Synced Allocations: ${allocations.length} rows`);
    
    return { success: true, count: allocations.length };
  } catch (error) {
    console.error('Error syncing allocations:', error);
    return { success: false, message: error.message };
  }
}

// Sync drop history tab
async function syncDrops() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not configured' };
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
    
    await sheets.replaceTabData(TABS.DROPS, rows);
    console.log(`Synced Drop History: ${drops.length} rows`);
    
    return { success: true, count: drops.length };
  } catch (error) {
    console.error('Error syncing drops:', error);
    return { success: false, message: error.message };
  }
}

// Sync activity log tab
async function syncLogs() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not configured' };
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
    
    await sheets.replaceTabData(TABS.LOGS, rows);
    console.log(`Synced Activity Log: ${logs.length} rows`);
    
    return { success: true, count: logs.length };
  } catch (error) {
    console.error('Error syncing logs:', error);
    return { success: false, message: error.message };
  }
}

// Sync sections tab
async function syncSections() {
  if (!sheets.isAvailable()) {
    return { success: false, message: 'Google Sheets not configured' };
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
    
    await sheets.replaceTabData(TABS.SECTIONS, rows);
    console.log(`Synced Sections: ${sections.length} rows`);
    
    return { success: true, count: sections.length };
  } catch (error) {
    console.error('Error syncing sections:', error);
    return { success: false, message: error.message };
  }
}

// Sync all tabs
async function syncAll() {
  if (!sheets.isAvailable()) {
    return '❌ Google Sheets not configured. Set GOOGLE_SHEETS_ID and GOOGLE_SERVICE_ACCOUNT_KEY in .env';
  }
  
  const results = [];
  
  const inventoryResult = await syncInventory();
  results.push(`Inventory: ${inventoryResult.success ? `✅ ${inventoryResult.count} rows` : `❌ ${inventoryResult.message}`}`);
  
  const allocationsResult = await syncAllocations();
  results.push(`Allocations: ${allocationsResult.success ? `✅ ${allocationsResult.count} rows` : `❌ ${allocationsResult.message}`}`);
  
  const dropsResult = await syncDrops();
  results.push(`Drop History: ${dropsResult.success ? `✅ ${dropsResult.count} rows` : `❌ ${dropsResult.message}`}`);
  
  const logsResult = await syncLogs();
  results.push(`Activity Log: ${logsResult.success ? `✅ ${logsResult.count} rows` : `❌ ${logsResult.message}`}`);
  
  const sectionsResult = await syncSections();
  results.push(`Sections: ${sectionsResult.success ? `✅ ${sectionsResult.count} rows` : `❌ ${sectionsResult.message}`}`);
  
  return `🔄 *Sync Complete*\n\n${results.join('\n')}`;
}

// Sync specific tab
async function syncTab(target) {
  if (!sheets.isAvailable()) {
    return '❌ Google Sheets not configured';
  }
  
  const lowerTarget = target.toLowerCase();
  
  if (lowerTarget.includes('inventory')) {
    const result = await syncInventory();
    return result.success ? `✅ Inventory synced: ${result.count} rows` : `❌ ${result.message}`;
  }
  
  if (lowerTarget.includes('alloc')) {
    const result = await syncAllocations();
    return result.success ? `✅ Allocations synced: ${result.count} rows` : `❌ ${result.message}`;
  }
  
  if (lowerTarget.includes('drop')) {
    const result = await syncDrops();
    return result.success ? `✅ Drop History synced: ${result.count} rows` : `❌ ${result.message}`;
  }
  
  if (lowerTarget.includes('log')) {
    const result = await syncLogs();
    return result.success ? `✅ Activity Log synced: ${result.count} rows` : `❌ ${result.message}`;
  }
  
  if (lowerTarget.includes('section')) {
    const result = await syncSections();
    return result.success ? `✅ Sections synced: ${result.count} rows` : `❌ ${result.message}`;
  }
  
  return `❌ Unknown target: ${target}. Use: inventory, allocations, drops, logs, sections`;
}

// Auto-sync specific tabs after actions (called from command handlers)
async function autoSync(actionType) {
  if (!sheets.isAvailable()) {
    return; // Silently skip if sheets not configured
  }
  
  try {
    switch (actionType) {
      case 'addstock':
      case 'drop':
        await syncInventory();
        await syncAllocations();
        await syncDrops();
        await syncLogs();
        break;
      case 'setalloc':
        await syncAllocations();
        await syncLogs();
        break;
      case 'addsection':
      case 'removesection':
      case 'editsection':
        await syncSections();
        await syncAllocations();
        await syncLogs();
        break;
      case 'addkey':
        await syncInventory();
        await syncLogs();
        break;
      default:
        // Unknown action, sync all
        await syncAll();
    }
  } catch (error) {
    console.error('Auto-sync error:', error);
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
  TABS
};

const db = require('../database');
const { resolveRequestKey } = require('../parser');
const { 
  autoSync, formatSyncStatus, getSyncStatus, syncAll, syncTab,
  generateImportPreview, applyImport, setPendingImport, getPendingImport, clearPendingImport,
  IMPORT_TABS
} = require('../sync');
const sheets = require('../sheets');

// /help
async function help(args, from, contactName) {
  return `📋 *Tree Planting Bot - Commands*

*Inventory Management:*
/addkey [key] "[species]" [short] - Add request key
/addstock [qty] [key] - Add to main inventory

*Sections:*
/addsection [id] [desc] - Create section
/removesection [id] - Delete section
/listsections - List all sections
/editsection [id] [desc] - Update description

*Allocation & Drops:*
/setalloc [qty] [key] section [s] - Set allocation target
/drop [qty] [key] section [s] - Log boxes dropped

*Status & Info:*
/stock - View main inventory
/status section [s] - Section allocation status
/remaining [section [s]] - What's left to drop
/keys [species] - List request keys
/species - List all species

*Google Sheets:*
/sync [tab] - Sync to Google Sheets
/sheets - Check Google Sheets status
/import [tab] - Import data from Google Sheets

*Utilities:*
/math [box size] [decimal] - Calculate saplings
/undo - Undo your last action
/logs [user] - View activity log
`;
}

// /addkey
async function addkey(args, from, contactName) {
  if (!args.requestKey || !args.species) {
    return '❌ Usage: /addkey [request_key] "[species]" [short_key]\nExample: /addkey gg-2024-068 "Coyote Willow" 068';
  }
  
  // Check if key already exists
  const existing = db.getRequestKey(args.requestKey);
  if (existing) {
    return `❌ Request key "${args.requestKey}" already exists (${existing.species_name})`;
  }
  
  // Get or create species
  let species = db.getSpecies(args.species);
  if (!species) {
    const speciesId = db.createSpecies(args.species);
    species = { id: speciesId, name: args.species };
  }
  
  // Create the request key
  const keyId = db.createRequestKey(args.requestKey, species.id, args.shortKey);
  
  // Log the action
  db.addActivityLog(from, 'addkey', args.requestKey, null, null);
  
  // Auto-sync to sheets
  const syncResult = await autoSync('addkey');
  
  return `✅ Added request key:
*Key:* ${args.requestKey}
*Species:* ${species.name}
${args.shortKey ? `*Short Key:* ${args.shortKey}` : ''}

${formatSyncStatus(syncResult)}`;
}

// /addstock
async function addstock(args, from, contactName) {
  if (!args.quantity || !args.requestKey) {
    return '❌ Usage: /addstock [quantity] [request_key]\nExample: /addstock 100 gg-2024-068';
  }
  
  if (args.quantity <= 0) {
    return '❌ Quantity must be greater than 0';
  }
  
  // Resolve request key
  const resolved = resolveRequestKey(args.requestKey);
  
  if (!resolved.resolved) {
    if (resolved.ambiguous) {
      const matches = resolved.matches.map(m => `• ${m.request_key} (${m.species_name})`).join('\n');
      return `❌ Multiple matches for "${args.requestKey}":\n${matches}\n\nPlease use the full request key.`;
    }
    return `❌ Request key "${args.requestKey}" not found. Use /addkey to create it.`;
  }
  
  const keyData = resolved.key;
  
  // Get or create inventory record
  const currentInventory = db.getInventory(keyData.id);
  const newQuantity = (currentInventory?.quantity || 0) + args.quantity;
  
  db.updateInventory(keyData.id, newQuantity);
  
  // Log the action
  db.addActivityLog(from, 'addstock', args.requestKey, args.quantity, null);
  db.addActionHistory(from, 'addstock', {
    requestKeyId: keyData.id,
    requestKey: args.requestKey,
    quantityAdded: args.quantity,
    previousQuantity: currentInventory?.quantity || 0,
    newQuantity: newQuantity
  });
  
  // Auto-sync to sheets
  const syncResult = await autoSync('addstock');
  
  return `✅ Added ${args.quantity} to main inventory:
*Key:* ${args.requestKey}
*Species:* ${keyData.species_name}
*New Total:* ${newQuantity}

${formatSyncStatus(syncResult)}`;
}

// /drop
async function drop(args, from, contactName) {
  if (!args || !args.quantity || !args.requestKey || !args.section) {
    return '❌ Usage: /drop [quantity] [request_key] [section]\nExample: /drop 10 068 6';
  }
  
  if (args.quantity <= 0) {
    return '❌ Quantity must be greater than 0';
  }
  
  // Resolve request key
  const resolved = resolveRequestKey(args.requestKey);
  
  if (!resolved.resolved) {
    if (resolved.ambiguous) {
      const matches = resolved.matches.map(m => `• ${m.request_key} (${m.species_name})`).join('\n');
      return `❌ Multiple matches for "${args.requestKey}":\n${matches}\n\nPlease use the full request key.`;
    }
    return `❌ Request key "${args.requestKey}" not found.`;
  }
  
  const keyData = resolved.key;
  
  // Check main inventory
  const inventory = db.getInventory(keyData.id);
  if (!inventory || inventory.quantity < args.quantity) {
    const available = inventory?.quantity || 0;
    return `❌ Insufficient inventory. Available: ${available}, Requested: ${args.quantity}`;
  }
  
  // Check allocation
  const allocation = db.getAllocation(args.section, keyData.id);
  if (!allocation) {
    return `❌ No allocation set for section ${args.section} with key ${args.requestKey}. Use /setalloc first.`;
  }
  
  // Check current drops for this section
  const currentDrops = db.getDropsBySectionAndKey(args.section, keyData.id);
  const totalDropped = currentDrops?.total_dropped || 0;
  
  // Calculate remaining allocation
  const remaining = allocation.target_quantity - totalDropped;
  
  if (remaining <= 0) {
    return `⚠️ Section ${args.section} already has full allocation for ${args.requestKey} (${allocation.target_quantity}/${allocation.target_quantity})`;
  }
  
  if (args.quantity > remaining) {
    return `⚠️ Drop of ${args.quantity} exceeds remaining allocation of ${remaining} for section ${args.section}`;
  }
  
  // Perform the drop
  db.addDrop(args.section, keyData.id, args.quantity, from);
  db.updateInventory(keyData.id, inventory.quantity - args.quantity);
  
  // Log the action
  db.addActivityLog(from, 'drop', args.requestKey, args.quantity, args.section);
  db.addActionHistory(from, 'drop', {
    requestKeyId: keyData.id,
    requestKey: args.requestKey,
    section: args.section,
    quantity: args.quantity,
    previousInventory: inventory.quantity,
    newInventory: inventory.quantity - args.quantity
  });
  
  // Auto-sync to sheets
  const syncResult = await autoSync('drop');
  
  const newTotalDropped = totalDropped + args.quantity;
  const newRemaining = allocation.target_quantity - newTotalDropped;
  
  let response = `✅ Dropped ${args.quantity} boxes:
*Key:* ${args.requestKey}
*Species:* ${keyData.species_name}
*Section:* ${args.section}
*Dropped:* ${newTotalDropped}/${allocation.target_quantity}
*Remaining:* ${newRemaining}
*Main Inventory:* ${inventory.quantity - args.quantity}`;
  
  // Check for completion
  if (newRemaining === 0) {
    response += `\n\n🎉 *ALLOCATION COMPLETE!* Section ${args.section} has received all ${args.requestKey} boxes.`;
  } else if (newRemaining < 0) {
    response += `\n\n⚠️ *OVER ALLOCATION!* Section ${args.section} has ${Math.abs(newRemaining)} extra boxes.`;
  }
  
  response += `\n\n${formatSyncStatus(syncResult)}`;
  
  return response;
}

// /setalloc
async function setalloc(args, from, contactName) {
  if (!args || !args.quantity || !args.requestKey || !args.section) {
    return '❌ Usage: /setalloc [quantity] [request_key] [section]\nExample: /setalloc 200 068 6';
  }
  
  if (args.quantity <= 0) {
    return '❌ Quantity must be greater than 0';
  }
  
  // Resolve request key
  const resolved = resolveRequestKey(args.requestKey);
  
  if (!resolved.resolved) {
    if (resolved.ambiguous) {
      const matches = resolved.matches.map(m => `• ${m.request_key} (${m.species_name})`).join('\n');
      return `❌ Multiple matches for "${args.requestKey}":\n${matches}\n\nPlease use the full request key.`;
    }
    return `❌ Request key "${args.requestKey}" not found.`;
  }
  
  const keyData = resolved.key;
  
  // Set allocation
  db.setAllocation(args.section, keyData.id, args.quantity);
  
  // Log the action
  db.addActivityLog(from, 'setalloc', args.requestKey, args.quantity, args.section);
  
  // Auto-sync to sheets
  const syncResult = await autoSync('setalloc');
  
  return `✅ Set allocation:
*Key:* ${args.requestKey}
*Species:* ${keyData.species_name}
*Section:* ${args.section}
*Target:* ${args.quantity} boxes

${formatSyncStatus(syncResult)}`;
}

// /status
async function status(args, from, contactName) {
  if (!args.section) {
    return '❌ Usage: /status section [section]\nExample: /status section 6';
  }
  
  const allocations = db.getSectionAllocations(args.section);
  
  if (allocations.length === 0) {
    return `📍 Section ${args.section}: No allocations set`;
  }
  
  let response = `📍 *SECTION ${args.section} STATUS*\n\n`;
  
  for (const alloc of allocations) {
    const drops = db.getDropsBySectionAndKey(args.section, alloc.request_key_id);
    const totalDropped = drops?.total_dropped || 0;
    const remaining = alloc.target_quantity - totalDropped;
    
    let statusEmoji = '⏳';
    if (remaining === 0) statusEmoji = '✅';
    else if (remaining < 0) statusEmoji = '⚠️';
    
    response += `*${alloc.request_key}* (${alloc.species_name}):
  ${statusEmoji} ${totalDropped}/${alloc.target_quantity} (${remaining} remaining)\n`;
  }
  
  return response;
}

// /stock
async function stock(args, from, contactName) {
  if (args.requestKey) {
    // Show specific key stock
    const resolved = resolveRequestKey(args.requestKey);
    
    if (!resolved.resolved) {
      if (resolved.ambiguous) {
        const matches = resolved.matches.map(m => `• ${m.request_key} (${m.species_name})`).join('\n');
        return `❌ Multiple matches for "${args.requestKey}":\n${matches}`;
      }
      return `❌ Request key "${args.requestKey}" not found.`;
    }
    
    const keyData = resolved.key;
    const inventory = db.getInventory(keyData.id);
    const quantity = inventory?.quantity || 0;
    
    return `📦 *${keyData.request_key}* (${keyData.species_name}):
Available: ${quantity}`;
  }
  
  // Show all inventory
  const allInventory = db.getAllInventory();
  
  if (allInventory.length === 0) {
    return '📦 Main inventory is empty';
  }
  
  let response = '📦 *MAIN INVENTORY*\n\n';
  
  for (const item of allInventory) {
    response += `*${item.request_key}* (${item.species_name}): ${item.quantity}\n`;
  }
  
  return response;
}

// /remaining
async function remaining(args, from, contactName) {
  if (args.section) {
    // Show remaining for specific section
    const allocations = db.getSectionAllocations(args.section);
    
    if (allocations.length === 0) {
      return `📍 Section ${args.section}: No allocations set`;
    }
    
    let response = `📍 *SECTION ${args.section} - REMAINING*\n\n`;
    let hasRemaining = false;
    
    for (const alloc of allocations) {
      const drops = db.getDropsBySectionAndKey(args.section, alloc.request_key_id);
      const totalDropped = drops?.total_dropped || 0;
      const remaining = alloc.target_quantity - totalDropped;
      
      if (remaining > 0) {
        hasRemaining = true;
        response += `*${alloc.request_key}* (${alloc.species_name}): ${remaining} remaining\n`;
      }
    }
    
    if (!hasRemaining) {
      response += '✅ All allocations complete!';
    }
    
    return response;
  }
  
  // Show all sections with remaining
  const allAllocations = db.getAllAllocations();
  
  if (allAllocations.length === 0) {
    return '📍 No allocations set';
  }
  
  // Group by section
  const sections = {};
  for (const alloc of allAllocations) {
    if (!sections[alloc.section]) {
      sections[alloc.section] = [];
    }
    sections[alloc.section].push(alloc);
  }
  
  let response = '📍 *ALL SECTIONS - REMAINING*\n\n';
  let hasAnyRemaining = false;
  
  for (const [section, allocs] of Object.entries(sections)) {
    let sectionRemaining = [];
    
    for (const alloc of allocs) {
      const drops = db.getDropsBySectionAndKey(section, alloc.request_key_id);
      const totalDropped = drops?.total_dropped || 0;
      const remaining = alloc.target_quantity - totalDropped;
      
      if (remaining > 0) {
        sectionRemaining.push(`  *${alloc.request_key}*: ${remaining}`);
        hasAnyRemaining = true;
      }
    }
    
    if (sectionRemaining.length > 0) {
      response += `*Section ${section}:*\n${sectionRemaining.join('\n')}\n\n`;
    }
  }
  
  if (!hasAnyRemaining) {
    response += '✅ All allocations complete!';
  }
  
  return response;
}

// /undo
async function undo(args, from, contactName) {
  const userActions = db.getLastUserActions(from, 5);
  
  if (userActions.length === 0) {
    return '❌ No recent actions to undo';
  }
  
  const lastAction = userActions[0];
  const actionData = JSON.parse(lastAction.action_data);
  
  // Reverse the action based on type
  if (lastAction.action_type === 'drop') {
    // Find and remove the drop
    const inventory = db.getInventory(actionData.requestKeyId);
    if (inventory) {
      db.updateInventory(actionData.requestKeyId, inventory.quantity + actionData.quantity);
    }
    
    // Remove from drop history
    const drops = db.prepare(
      'SELECT id FROM drop_history WHERE section = ? AND request_key_id = ? AND dropped_by = ? ORDER BY created_at DESC LIMIT 1'
    ).get(actionData.section, actionData.requestKeyId, from);
    
    if (drops) {
      db.removeDrop(drops.id);
    }
    
    // Delete the action history
    db.deleteActionHistory(lastAction.id);
    
    return `↩️ Undid your drop:
*Key:* ${actionData.requestKey}
*Section:* ${actionData.section}
*Quantity:* ${actionData.quantity}
*New Inventory:* ${inventory.quantity + actionData.quantity}`;
  }
  
  if (lastAction.action_type === 'addstock') {
    // Reverse the stock addition
    const inventory = db.getInventory(actionData.requestKeyId);
    if (inventory) {
      const newQty = inventory.quantity - actionData.quantityAdded;
      if (newQty < 0) {
        return '❌ Cannot undo: would result in negative inventory';
      }
      db.updateInventory(actionData.requestKeyId, newQty);
    }
    
    db.deleteActionHistory(lastAction.id);
    
    return `↩️ Undid your stock addition:
*Key:* ${actionData.requestKey}
*Quantity:* ${actionData.quantityAdded}
*New Inventory:* ${(inventory?.quantity || 0) - actionData.quantityAdded}`;
  }
  
  return '❌ Cannot undo this action type';
}

// /math
async function math(args, from, contactName) {
  if (!args.boxSize || args.decimal === undefined) {
    return '❌ Usage: /math [box_size] [decimal]\nExample: /math 180 .35';
  }
  
  if (args.boxSize <= 0) {
    return '❌ Box size must be greater than 0';
  }
  
  const exact = Math.ceil(args.boxSize * args.decimal);
  const rounded = Math.round(exact / 10) * 10;
  
  return `🧮 *Box Calculation*
Box Size: ${args.boxSize}
Decimal: ${args.decimal}

*Exact:* ${exact} saplings
*Rounded:* ${rounded} saplings (nearest 10)`;
}

// /keys
async function keys(args, from, contactName) {
  if (args.species) {
    // Show keys for specific species
    const keysList = db.getRequestKeysBySpecies(args.species);
    
    if (keysList.length === 0) {
      return `❌ No request keys found for "${args.species}"`;
    }
    
    let response = `🔑 *Request Keys for ${args.species}*\n\n`;
    
    for (const key of keysList) {
      response += `*${key.request_key}*`;
      if (key.short_key) {
        response += ` (short: ${key.short_key})`;
      }
      response += '\n';
    }
    
    return response;
  }
  
  // Show all keys
  const allKeys = db.getAllRequestKeys();
  
  if (allKeys.length === 0) {
    return '🔑 No request keys added yet';
  }
  
  let response = '🔑 *ALL REQUEST KEYS*\n\n';
  let currentSpecies = '';
  
  for (const key of allKeys) {
    if (key.species_name !== currentSpecies) {
      currentSpecies = key.species_name;
      response += `*${currentSpecies}:*\n`;
    }
    response += `  ${key.request_key}`;
    if (key.short_key) {
      response += ` (${key.short_key})`;
    }
    response += '\n';
  }
  
  return response;
}

// /logs
async function logs(args, from, contactName) {
  let logsList;
  
  if (args.user) {
    // Try to find by name or phone
    logsList = db.getUserLogs(args.user, 10);
    if (logsList.length === 0) {
      // Try all logs and filter by contact name
      const allLogs = db.getRecentLogs(50);
      logsList = allLogs.filter(log => 
        log.user_phone.toLowerCase().includes(args.user.toLowerCase())
      ).slice(0, 10);
    }
  } else {
    logsList = db.getRecentLogs(10);
  }
  
  if (logsList.length === 0) {
    return '📋 No logs found';
  }
  
  let response = '📋 *ACTIVITY LOG*\n\n';
  
  for (const log of logsList) {
    const date = new Date(log.created_at).toLocaleString();
    response += `*${date}*\n`;
    response += `${log.action.toUpperCase()}`;
    if (log.request_key) response += ` ${log.request_key}`;
    if (log.quantity) response += ` x${log.quantity}`;
    if (log.section) response += ` → ${log.section}`;
    response += `\n\n`;
  }
  
  return response;
}

// /species
async function species(args, from, contactName) {
  const allSpecies = db.getAllSpecies();
  
  if (allSpecies.length === 0) {
    return '🌳 No species added yet';
  }
  
  let response = '🌳 *ALL SPECIES*\n\n';
  
  for (const sp of allSpecies) {
    const keys = db.getRequestKeysBySpecies(sp.name);
    response += `*${sp.name}*\n`;
    for (const key of keys) {
      response += `  ${key.request_key}`;
      if (key.short_key) response += ` (${key.short_key})`;
      response += '\n';
    }
    response += '\n';
  }
  
  return response;
}

// /addsection
async function addsection(args, from, contactName) {
  if (!args.section) {
    return '❌ Usage: /addsection [section_id] [description]\nExample: /addsection 6 "North Field Plot 6"';
  }
  
  // Check if section already exists
  const existing = db.getSection(args.section);
  if (existing) {
    return `❌ Section "${args.section}" already exists (${existing.description || 'no description'})`;
  }
  
  // Create the section
  db.createSection(args.section, args.description);
  
  // Log the action
  db.addActivityLog(from, 'addsection', null, null, args.section);
  
  // Auto-sync to sheets
  const syncResult = await autoSync('addsection');
  
  return `✅ Section created:
*ID:* ${args.section}
*Description:* ${args.description || 'none'}

${formatSyncStatus(syncResult)}`;
}

// /removesection
async function removesection(args, from, contactName) {
  if (!args.section) {
    return '❌ Usage: /removesection [section_id]\nExample: /removesection 6';
  }
  
  // Check if section exists
  const existing = db.getSection(args.section);
  if (!existing) {
    return `❌ Section "${args.section}" not found`;
  }
  
  // Get stats before deletion
  const stats = db.getSectionStats(args.section);
  
  // Confirm deletion
  if (!args.confirmed) {
    return `⚠️ This will delete section "${args.section}" and:
• ${stats.allocations} allocation(s)
• ${stats.drops} drop record(s) (${stats.totalDropped} total boxes)

Type /removesection ${args.section} confirm to proceed`;
  }
  
  // Delete the section
  db.deleteSection(args.section);
  
  // Log the action
  db.addActivityLog(from, 'removesection', null, null, args.section);
  
  // Auto-sync to sheets
  const syncResult = await autoSync('removesection');
  
  return `✅ Section "${args.section}" deleted
• Removed ${stats.allocations} allocation(s)
• Removed ${stats.drops} drop record(s)

${formatSyncStatus(syncResult)}`;
}

// /listsections
async function listsections(args, from, contactName) {
  const sections = db.getAllSections();
  
  if (sections.length === 0) {
    return '📍 No sections created yet';
  }
  
  let response = '📍 *ALL SECTIONS*\n\n';
  
  for (const section of sections) {
    const stats = db.getSectionStats(section.id);
    response += `*${section.id}*`;
    if (section.description) {
      response += ` - ${section.description}`;
    }
    response += `\n  Allocations: ${stats.allocations} | Dropped: ${stats.drops} records (${stats.totalDropped} boxes)\n`;
  }
  
  return response;
}

// /editsection
async function editsection(args, from, contactName) {
  if (!args.section || !args.description) {
    return '❌ Usage: /editsection [section_id] [description]\nExample: /editsection 6 "New description"';
  }
  
  // Check if section exists
  const existing = db.getSection(args.section);
  if (!existing) {
    return `❌ Section "${args.section}" not found`;
  }
  
  // Update the section
  db.updateSection(args.section, args.description);
  
  // Log the action
  db.addActivityLog(from, 'editsection', null, null, args.section);
  
  // Auto-sync to sheets
  const syncResult = await autoSync('editsection');
  
  return `✅ Section "${args.section}" updated:
*Description:* ${args.description}

${formatSyncStatus(syncResult)}`;
}

// /sync
async function sync(args, from, contactName) {
  if (args.target) {
    // Sync specific tab
    const result = await syncTab(args.target);
    if (result.success) {
      return `✅ ${args.target} synced: ${result.count} rows`;
    } else {
      return `❌ Failed to sync ${args.target}: ${result.message}`;
    }
  }
  
  // Sync all
  const result = await syncAll();
  
  if (result.success) {
    const details = result.results.map(r => 
      `✅ ${r.tab}: ${r.count} rows`
    ).join('\n');
    return `🔄 *Sync Complete*\n\n${details}`;
  } else {
    const details = result.results.map(r => 
      r.success ? `✅ ${r.tab}: ${r.count} rows` : `❌ ${r.tab}: ${r.message}`
    ).join('\n');
    return `⚠️ *Sync Partially Failed*\n\n${details}`;
  }
}

// /sheets
async function sheetsDebug(args, from, contactName) {
  const sheetsStatus = sheets.getConnectionStatus();
  const syncStatus = getSyncStatus();
  
  let response = '📊 *GOOGLE SHEETS STATUS*\n\n';
  
  // Connection status
  if (sheetsStatus.connected) {
    response += `*Connection:* ✅ Connected\n`;
    response += `*Spreadsheet:* ${sheetsStatus.spreadsheetTitle}\n`;
    response += `*ID:* ${sheetsStatus.spreadsheetId}\n`;
  } else {
    response += `*Connection:* ❌ Disconnected\n`;
    if (sheetsStatus.error) {
      response += `*Error:* ${sheetsStatus.error}\n`;
    }
    if (!sheetsStatus.hasCredentials) {
      response += `*Missing:* GOOGLE_SERVICE_ACCOUNT_KEY env var\n`;
    }
  }
  
  response += '\n*Last Sync Times:*\n';
  
  for (const tab of syncStatus.tabs) {
    const lastSync = tab.lastSync 
      ? new Date(tab.lastSync).toLocaleString()
      : 'Never';
    response += `• ${tab.name}: ${lastSync}\n`;
  }
  
  // Test connection if requested
  if (args.test) {
    response += '\n*Testing connection...*\n';
    const testResult = await sheets.testConnection();
    if (testResult.success) {
      response += `✅ Connection OK: ${testResult.spreadsheetTitle}`;
    } else {
      response += `❌ Connection failed: ${testResult.error}`;
    }
  }
  
  return response;
}

// /import
async function importData(args, from, contactName) {
  if (!sheets.isAvailable()) {
    return '❌ Google Sheets not connected. Run /sheets to check status.';
  }
  
  const subcommand = args._?.[0]?.toLowerCase();
  
  // Handle confirm/cancel
  if (subcommand === 'confirm') {
    const pending = getPendingImport();
    if (!pending) {
      return '❌ No pending import. Run /import first to preview changes.';
    }
    
    const result = await applyImport(pending);
    clearPendingImport();
    
    // Sync back to sheets to ensure consistency
    const syncResult = await autoSync('import');
    
    let response = '✅ *Import Complete*\n━━━━━━━━━━━━━━━━━━\n📥 Imported from Google Sheets:\n';
    
    if (result.requestKeys.inserted > 0 || result.requestKeys.updated > 0) {
      response += `• Request Keys: ${result.requestKeys.inserted + result.requestKeys.updated} rows (${result.requestKeys.inserted} new, ${result.requestKeys.updated} updated)\n`;
    }
    if (result.sections.inserted > 0 || result.sections.updated > 0) {
      response += `• Sections: ${result.sections.inserted + result.sections.updated} rows (${result.sections.inserted} new, ${result.sections.updated} updated)\n`;
    }
    if (result.inventory.inserted > 0 || result.inventory.updated > 0) {
      response += `• Inventory: ${result.inventory.inserted + result.inventory.updated} rows (${result.inventory.inserted} new, ${result.inventory.updated} updated)\n`;
    }
    if (result.allocations.inserted > 0 || result.allocations.updated > 0) {
      response += `• Allocations: ${result.allocations.inserted + result.allocations.updated} rows (${result.allocations.inserted} new, ${result.allocations.updated} updated)\n`;
    }
    
    // Show skipped/errors
    const allErrors = [
      ...result.requestKeys.errors,
      ...result.sections.errors,
      ...result.inventory.errors,
      ...result.allocations.errors
    ];
    if (allErrors.length > 0) {
      response += `\n⚠️ Skipped rows:\n`;
      allErrors.slice(0, 5).forEach(err => response += `• ${err}\n`);
      if (allErrors.length > 5) {
        response += `• ...and ${allErrors.length - 5} more\n`;
      }
    }
    
    response += `\n${formatSyncStatus(syncResult)}`;
    return response;
  }
  
  if (subcommand === 'cancel') {
    clearPendingImport();
    return '❌ Import cancelled.';
  }
  
  // Determine which tabs to preview
  let tabsToImport = IMPORT_TABS;
  if (subcommand && subcommand !== 'all') {
    const tabMap = {
      'inventory': ['Inventory'],
      'inv': ['Inventory'],
      'allocations': ['Allocations'],
      'alloc': ['Allocations'],
      'keys': ['Request Keys'],
      'requestkeys': ['Request Keys'],
      'request': ['Request Keys'],
      'sections': ['Sections'],
      'section': ['Sections']
    };
    
    tabsToImport = tabMap[subcommand];
    if (!tabsToImport) {
      return `❌ Unknown tab: ${subcommand}\nValid options: inventory, allocations, keys, sections, all`;
    }
  }
  
  // Generate preview
  const preview = await generateImportPreview(tabsToImport);
  
  // Store for later confirmation
  setPendingImport(preview);
  
  // Format preview message
  let response = '📊 *Import Preview*\n━━━━━━━━━━━━━━━━━━\n📥 Found in Google Sheets:\n\n';
  
  let hasData = false;
  
  if (preview.inventory) {
    const inv = preview.inventory;
    if (inv.found > 0) {
      hasData = true;
      response += `*Inventory:* ${inv.found} rows\n`;
      response += `  → ${inv.new.length} new, ${inv.updated.length} updated, ${inv.unchanged.length} unchanged\n`;
      if (inv.errors.length > 0) {
        response += `  ⚠️ ${inv.errors.length} rows skipped (invalid data)\n`;
      }
    } else {
      response += `*Inventory:* No data found\n`;
    }
    response += '\n';
  }
  
  if (preview.allocations) {
    const alloc = preview.allocations;
    if (alloc.found > 0) {
      hasData = true;
      response += `*Allocations:* ${alloc.found} rows\n`;
      response += `  → ${alloc.new.length} new, ${alloc.updated.length} updated, ${alloc.unchanged.length} unchanged\n`;
      if (alloc.errors.length > 0) {
        response += `  ⚠️ ${alloc.errors.length} rows skipped (invalid data)\n`;
      }
    } else {
      response += `*Allocations:* No data found\n`;
    }
    response += '\n';
  }
  
  if (preview.requestKeys) {
    const keys = preview.requestKeys;
    if (keys.found > 0) {
      hasData = true;
      response += `*Request Keys:* ${keys.found} rows\n`;
      response += `  → ${keys.new.length} new, ${keys.updated.length} updated, ${keys.unchanged.length} unchanged\n`;
      if (keys.errors.length > 0) {
        response += `  ⚠️ ${keys.errors.length} rows skipped (invalid data)\n`;
      }
    } else {
      response += `*Request Keys:* No data found\n`;
    }
    response += '\n';
  }
  
  if (preview.sections) {
    const sects = preview.sections;
    if (sects.found > 0) {
      hasData = true;
      response += `*Sections:* ${sects.found} rows\n`;
      response += `  → ${sects.new.length} new, ${sects.updated.length} updated, ${sects.unchanged.length} unchanged\n`;
      if (sects.errors.length > 0) {
        response += `  ⚠️ ${sects.errors.length} rows skipped (invalid data)\n`;
      }
    } else {
      response += `*Sections:* No data found\n`;
    }
    response += '\n';
  }
  
  if (!hasData) {
    response += '⚠️ No editable data found in Google Sheets.\n';
    response += 'Make sure the tabs have data with the correct column headers.\n';
    clearPendingImport();
  } else {
    response += '━━━━━━━━━━━━━━━━━━\n';
    response += '⚠️ This will overwrite SQLite data with Sheets data.\n\n';
    response += 'Type `/import confirm` to apply, or `/import cancel` to abort.';
  }
  
  return response;
}

module.exports = {
  help,
  addkey,
  addstock,
  drop,
  setalloc,
  status,
  stock,
  remaining,
  undo,
  math,
  keys,
  logs,
  species,
  addsection,
  removesection,
  listsections,
  editsection,
  sync,
  sheets: sheetsDebug,
  import: importData
};

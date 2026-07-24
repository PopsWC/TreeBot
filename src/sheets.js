const { google } = require('googleapis');

let sheets = null;
let spreadsheetId = null;

const REQUIRED_TABS = ['Inventory', 'Allocations', 'Drop History', 'Activity Log', 'Sections'];

// Initialize Google Sheets API
async function initializeSheets() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  
  if (!credentialsJson || !spreadsheetId) {
    console.log('Google Sheets not configured (missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SHEETS_ID)');
    return false;
  }
  
  try {
    // Parse credentials from environment variable (raw JSON string)
    const credentials = JSON.parse(credentialsJson);
    
    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    // Create sheets instance
    sheets = google.sheets({ version: 'v4', auth });
    
    // Ensure required tabs exist
    await ensureTabs();
    
    console.log('Google Sheets API initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Google Sheets:', error.message);
    if (error.message.includes('JSON')) {
      console.error('Hint: GOOGLE_SERVICE_ACCOUNT_KEY should be the raw JSON content, not a file path');
    }
    return false;
  }
}

// Get list of existing tab names
async function getExistingTabs() {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  return response.data.sheets.map(s => s.properties.title);
}

// Create missing tabs
async function ensureTabs() {
  const existingTabs = await getExistingTabs();
  const missingTabs = REQUIRED_TABS.filter(tab => !existingTabs.includes(tab));
  
  if (missingTabs.length === 0) {
    console.log('All required tabs exist');
    return;
  }
  
  console.log(`Creating missing tabs: ${missingTabs.join(', ')}`);
  
  const requests = missingTabs.map(tabName => ({
    addSheet: {
      properties: { title: tabName }
    }
  }));
  
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
  
  console.log('Tabs created successfully');
}

// Clear a tab completely
async function clearTab(tabName) {
  if (!sheets) {
    throw new Error('Sheets not initialized');
  }
  
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${tabName}!A:Z`,
    });
    return true;
  } catch (error) {
    console.error(`Error clearing tab ${tabName}:`, error.message);
    return false;
  }
}

// Append rows to a tab
async function appendRows(tabName, rows) {
  if (!sheets) {
    throw new Error('Sheets not initialized');
  }
  
  if (!rows || rows.length === 0) {
    return true;
  }
  
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:Z`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    });
    return true;
  } catch (error) {
    console.error(`Error appending to ${tabName}:`, error.message);
    return false;
  }
}

// Replace all data in a tab (clear + append)
async function replaceTabData(tabName, rows) {
  await clearTab(tabName);
  if (rows && rows.length > 0) {
    await appendRows(tabName, rows);
  }
  return true;
}

// Check if sheets is available
function isAvailable() {
  return sheets !== null;
}

module.exports = {
  initializeSheets,
  clearTab,
  appendRows,
  replaceTabData,
  isAvailable
};

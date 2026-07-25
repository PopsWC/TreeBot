const { google } = require('googleapis');

let sheets = null;
let spreadsheetId = null;
let connectionStatus = {
  connected: false,
  lastTested: null,
  error: null,
  spreadsheetTitle: null
};

const REQUIRED_TABS = ['Inventory', 'Allocations', 'Drop History', 'Activity Log', 'Sections'];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Sleep helper for retry delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize Google Sheets API
async function initializeSheets() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  
  if (!credentialsJson || !spreadsheetId) {
    console.log('Google Sheets not configured (missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SHEETS_ID)');
    connectionStatus = {
      connected: false,
      lastTested: new Date().toISOString(),
      error: 'Missing environment variables',
      spreadsheetTitle: null
    };
    return false;
  }
  
  try {
    // Parse credentials from environment variable (raw JSON string)
    const credentials = JSON.parse(credentialsJson);
    
    // Validate credentials structure
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Invalid credentials: missing client_email or private_key');
    }
    
    console.log(`Service account: ${credentials.client_email}`);
    console.log(`Spreadsheet ID: ${spreadsheetId}`);
    
    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    // Create sheets instance
    sheets = google.sheets({ version: 'v4', auth });
    
    // Test connection by reading spreadsheet metadata
    const testResult = await testConnection();
    
    if (!testResult.success) {
      throw new Error(testResult.error);
    }
    
    console.log(`Spreadsheet title: ${testResult.spreadsheetTitle}`);
    
    // Ensure required tabs exist
    await ensureTabs();
    
    connectionStatus = {
      connected: true,
      lastTested: new Date().toISOString(),
      error: null,
      spreadsheetTitle: testResult.spreadsheetTitle
    };
    
    console.log('Google Sheets API initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Google Sheets:', error.message);
    
    // Provide helpful hints based on error type
    if (error.message.includes('JSON')) {
      console.error('Hint: GOOGLE_SERVICE_ACCOUNT_KEY should be the raw JSON content, not a file path');
    } else if (error.message.includes('client_email')) {
      console.error('Hint: Check that GOOGLE_SERVICE_ACCOUNT_KEY contains valid JSON with client_email');
    } else if (error.message.includes('permission') || error.message.includes('403')) {
      console.error('Hint: Make sure the service account has Editor access to the spreadsheet');
      console.error(`Share the spreadsheet with: ${extractServiceAccountEmail(credentialsJson)}`);
    } else if (error.message.includes('not found') || error.message.includes('404')) {
      console.error('Hint: Check that GOOGLE_SHEETS_ID is correct');
      console.error('Find it in the spreadsheet URL: https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit');
    }
    
    connectionStatus = {
      connected: false,
      lastTested: new Date().toISOString(),
      error: error.message,
      spreadsheetTitle: null
    };
    
    return false;
  }
}

// Extract service account email from credentials JSON
function extractServiceAccountEmail(credentialsJson) {
  try {
    const creds = JSON.parse(credentialsJson);
    return creds.client_email || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Test connection by reading spreadsheet metadata
async function testConnection() {
  if (!sheets) {
    return { success: false, error: 'Sheets API not initialized' };
  }
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title',
      });
      
      return {
        success: true,
        spreadsheetTitle: response.data.properties.title
      };
    } catch (error) {
      console.log(`Connection test attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
      
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  
  return { success: false, error: 'Connection test failed after retries' };
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
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${tabName}!A:Z`,
      });
      return true;
    } catch (error) {
      console.log(`Clear tab ${tabName} attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
      
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  
  console.error(`Failed to clear tab ${tabName} after ${MAX_RETRIES} attempts`);
  return false;
}

// Append rows to a tab
async function appendRows(tabName, rows) {
  if (!sheets) {
    throw new Error('Sheets not initialized');
  }
  
  if (!rows || rows.length === 0) {
    return true;
  }
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
      console.log(`Append to ${tabName} attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
      
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  
  console.error(`Failed to append to ${tabName} after ${MAX_RETRIES} attempts`);
  return false;
}

// Replace all data in a tab (clear + append)
async function replaceTabData(tabName, rows) {
  if (!sheets) {
    return { success: false, error: 'Sheets not initialized' };
  }
  
  const cleared = await clearTab(tabName);
  if (!cleared) {
    return { success: false, error: `Failed to clear tab ${tabName}` };
  }
  
  if (rows && rows.length > 0) {
    const appended = await appendRows(tabName, rows);
    if (!appended) {
      return { success: false, error: `Failed to append to tab ${tabName}` };
    }
  }
  
  return { success: true, rows: rows ? rows.length : 0 };
}

// Get row count for a tab
async function getTabRowCount(tabName) {
  if (!sheets) {
    return 0;
  }
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:A`,
    });
    return response.data.values ? response.data.values.length : 0;
  } catch (error) {
    console.error(`Error getting row count for ${tabName}:`, error.message);
    return 0;
  }
}

// Get detailed connection status
function getConnectionStatus() {
  return {
    ...connectionStatus,
    spreadsheetId: spreadsheetId || 'not configured',
    hasCredentials: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  };
}

// Check if sheets is available
function isAvailable() {
  return sheets !== null && connectionStatus.connected;
}

module.exports = {
  initializeSheets,
  testConnection,
  clearTab,
  appendRows,
  replaceTabData,
  getTabRowCount,
  getConnectionStatus,
  isAvailable
};

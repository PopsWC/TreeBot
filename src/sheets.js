const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let sheets = null;
let spreadsheetId = null;

// Initialize Google Sheets API
async function initializeSheets() {
  const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  
  if (!keyFilePath || !spreadsheetId) {
    console.log('Google Sheets not configured (missing credentials or sheet ID)');
    return false;
  }
  
  try {
    // Read the service account key file
    const keyPath = path.resolve(keyFilePath);
    
    if (!fs.existsSync(keyPath)) {
      console.error('Service account key file not found:', keyPath);
      return false;
    }
    
    const keyFile = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    
    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials: keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    // Create sheets instance
    sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Google Sheets API initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Google Sheets:', error.message);
    return false;
  }
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

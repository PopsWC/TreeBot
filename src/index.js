require('dotenv').config();
const express = require('express');
const { parseCommand } = require('./parser');
const { extractMessageData, generateTwiML } = require('./whatsapp');
const commands = require('./commands');
const sheets = require('./sheets');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio sends form-encoded data
app.use(express.urlencoded({ extended: false }));

// Initialize Google Sheets on startup
sheets.initializeSheets().then(success => {
  if (success) {
    console.log('Google Sheets integration enabled');
  } else {
    console.log('Google Sheets integration disabled (configure in .env)');
  }
});

// WhatsApp webhook (Twilio)
app.post('/whatsapp', async (req, res) => {
  const messageData = extractMessageData(req.body);
  
  if (!messageData || !messageData.text) {
    res.type('text/xml').send(generateTwiML(''));
    return;
  }
  
  console.log(`Message from ${messageData.contactName} (${messageData.from}): ${messageData.text}`);
  
  // Only process commands starting with /
  if (!messageData.text.startsWith('/')) {
    res.type('text/xml').send(generateTwiML(''));
    return;
  }
  
  const parsed = parseCommand(messageData.text);
  
  if (!parsed) {
    res.type('text/xml').send(generateTwiML('❌ Unknown command. Type /help for available commands.'));
    return;
  }
  
  // Route to command handler
  const handler = commands[parsed.command];
  
  if (!handler) {
    res.type('text/xml').send(generateTwiML('❌ Command not implemented yet.'));
    return;
  }
  
  try {
    const response = await handler(parsed.args, messageData.from, messageData.contactName);
    res.type('text/xml').send(generateTwiML(response || ''));
  } catch (error) {
    console.error(`Error handling command ${parsed.command}:`, error);
    res.type('text/xml').send(generateTwiML('❌ An error occurred. Please try again.'));
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

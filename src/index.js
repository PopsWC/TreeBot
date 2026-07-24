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

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

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
  console.log('--- Webhook received ---');
  
  if (!req.body) {
    console.error('ERROR: req.body is undefined/null');
    res.type('text/xml').send(generateTwiML(''));
    return;
  }
  
  console.log('Webhook body keys:', Object.keys(req.body));
  console.log('From:', req.body.From);
  console.log('Body:', req.body.Body);
  
  const messageData = extractMessageData(req.body);
  
  if (!messageData || !messageData.text) {
    console.log('No message data or text, sending empty response');
    res.type('text/xml').send(generateTwiML(''));
    return;
  }
  
  console.log(`Message from ${messageData.contactName} (${messageData.from}): ${messageData.text}`);
  
  // Only process commands starting with /
  if (!messageData.text.startsWith('/')) {
    console.log('Not a command, ignoring');
    res.type('text/xml').send(generateTwiML(''));
    return;
  }
  
  const parsed = parseCommand(messageData.text);
  
  if (!parsed) {
    console.log('Could not parse command:', messageData.text);
    res.type('text/xml').send(generateTwiML('❌ Unknown command. Type /help for available commands.'));
    return;
  }
  
  console.log(`Parsed command: ${parsed.command}, args:`, parsed.args);
  
  // Route to command handler
  const handler = commands[parsed.command];
  
  if (!handler) {
    console.log(`No handler for command: ${parsed.command}`);
    res.type('text/xml').send(generateTwiML('❌ Command not implemented yet.'));
    return;
  }
  
  try {
    const response = await handler(parsed.args, messageData.from, messageData.contactName);
    console.log(`Response length: ${(response || '').length} chars`);
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Twilio Account SID:', process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'MISSING');
  console.log('Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'MISSING');
  console.log('Twilio WhatsApp Number:', process.env.TWILIO_WHATSAPP_NUMBER || 'MISSING');
});

require('dotenv').config();
const express = require('express');
const { parseCommand } = require('./parser');
const { extractMessageData, generateTwiML } = require('./whatsapp');
const commands = require('./commands');
const sheets = require('./sheets');
const sync = require('./sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio sends form-encoded data
app.use(express.urlencoded({ extended: false }));

// Deduplication - track processed message SIDs
const processedMessages = new Map();
const DEDUP_WINDOW_MS = 60000;

// Rate limiting - track messages per user
const userRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 30;

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

function checkRateLimit(phone) {
  const now = Date.now();
  const userLimit = userRateLimits.get(phone);
  if (!userLimit || now - userLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
    userRateLimits.set(phone, { count: 1, windowStart: now });
    return true;
  }
  if (userLimit.count >= RATE_LIMIT_MAX) return false;
  userLimit.count++;
  return true;
}

function cleanRateLimits() {
  const now = Date.now();
  for (const [phone, limit] of userRateLimits) {
    if (now - limit.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      userRateLimits.delete(phone);
    }
  }
}

function cleanProcessedMessages() {
  const now = Date.now();
  for (const [sid, timestamp] of processedMessages) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      processedMessages.delete(sid);
    }
  }
}

// WhatsApp webhook (Twilio)
// Twilio expects TwiML in the response body to send a WhatsApp message.
// Empty TwiML (<Message></Message>) = no message sent.
app.post('/whatsapp', async (req, res) => {
  console.log('--- Webhook received ---');

  if (!req.body) {
    console.error('ERROR: req.body is undefined/null');
    res.type('text/xml').send(generateTwiML(''));
    return;
  }

  console.log('From:', req.body.From);
  console.log('Body:', req.body.Body);

  // Deduplication - Twilio retries if webhook is slow
  const messageSid = req.body.MessageSid;
  if (messageSid) {
    if (processedMessages.has(messageSid)) {
      console.log(`Duplicate message ${messageSid}, ignoring`);
      res.type('text/xml').send(generateTwiML(''));
      return;
    }
    processedMessages.set(messageSid, Date.now());
    if (processedMessages.size > 100) cleanProcessedMessages();
  }

  const messageData = extractMessageData(req.body);

  if (!messageData || !messageData.text) {
    console.log('No message data or text');
    res.type('text/xml').send(generateTwiML(''));
    return;
  }

  console.log(`Message from ${messageData.contactName} (${messageData.from}): ${messageData.text}`);

  // Rate limiting
  if (!checkRateLimit(messageData.from)) {
    console.log(`Rate limit exceeded for ${messageData.from}`);
    if (userRateLimits.size > 100) cleanRateLimits();
    res.type('text/xml').send(generateTwiML(''));
    return;
  }
  if (userRateLimits.size > 100) cleanRateLimits();

  // Ignore non-command messages (empty TwiML = no message sent)
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
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    googleSheets: sheets.isAvailable() ? 'connected' : 'disconnected'
  });
});

// Status endpoint for debugging
app.get('/status', async (req, res) => {
  const sheetsStatus = sheets.getConnectionStatus();
  const syncStatus = sync.getSyncStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'MISSING',
      authToken: process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'MISSING',
      whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'MISSING'
    },
    googleSheets: sheetsStatus,
    sync: syncStatus
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server after initialization
async function startServer() {
  console.log('=== Starting Tree Planting Bot ===');
  console.log('Twilio Account SID:', process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'MISSING');
  console.log('Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'MISSING');
  console.log('Twilio WhatsApp Number:', process.env.TWILIO_WHATSAPP_NUMBER || 'MISSING');

  console.log('\n--- Initializing Google Sheets ---');
  const sheetsReady = await sheets.initializeSheets();
  
  if (sheetsReady) {
    console.log('✅ Google Sheets connected and ready');
  } else {
    console.log('⚠️ Google Sheets not available (check .env configuration)');
  }
  
  app.listen(PORT, () => {
    console.log(`\n=== Server running on port ${PORT} ===`);
    console.log('Webhook URL: /whatsapp');
    console.log('Status URL: /status');
    console.log('Google Sheets:', sheetsReady ? 'CONNECTED' : 'DISCONNECTED');
    console.log('================================\n');
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

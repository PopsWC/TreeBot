require('dotenv').config();
const express = require('express');
const { parseCommand } = require('./parser');
const { extractMessageData, generateTwiML, sendWhatsAppMessage } = require('./whatsapp');
const commands = require('./commands');
const sheets = require('./sheets');
const sync = require('./sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio sends form-encoded data
app.use(express.urlencoded({ extended: false }));

// Deduplication - track processed message SIDs
const processedMessages = new Map();
const DEDUP_WINDOW_MS = 60000; // 1 minute

// Rate limiting - track messages per user
const userRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 messages per minute

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Check rate limit for a user
function checkRateLimit(phone) {
  const now = Date.now();
  const userLimit = userRateLimits.get(phone);
  
  if (!userLimit || now - userLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
    userRateLimits.set(phone, { count: 1, windowStart: now });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

// Clean old rate limit entries periodically
function cleanRateLimits() {
  const now = Date.now();
  for (const [phone, limit] of userRateLimits) {
    if (now - limit.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      userRateLimits.delete(phone);
    }
  }
}

// Clean old dedup entries
function cleanProcessedMessages() {
  const now = Date.now();
  for (const [sid, timestamp] of processedMessages) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      processedMessages.delete(sid);
    }
  }
}

// Process command asynchronously and send result
async function processCommandAsync(parsed, messageData) {
  try {
    const handler = commands[parsed.command];
    if (!handler) return;
    
    console.log(`Processing command: ${parsed.command}`);
    const startTime = Date.now();
    
    const response = await handler(parsed.args, messageData.from, messageData.contactName);
    
    const elapsed = Date.now() - startTime;
    console.log(`Command ${parsed.command} completed in ${elapsed}ms`);
    
    if (response) {
      const sent = await sendWhatsAppMessage(messageData.from, response);
      if (sent) {
        console.log(`Response sent to ${messageData.from} (${response.length} chars)`);
      } else {
        console.error(`Failed to send response to ${messageData.from}`);
      }
    }
  } catch (error) {
    console.error(`Async command error for ${parsed.command}:`, error);
    try {
      await sendWhatsAppMessage(messageData.from, '❌ An error occurred. Please try again.');
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}

// WhatsApp webhook (Twilio)
app.post('/whatsapp', async (req, res) => {
  console.log('--- Webhook received ---');
  
  // Respond immediately to prevent webhook timeout
  // We'll process the command async and send the result via REST API
  // IMPORTANT: Do NOT use res.sendStatus(200) - Twilio sends "OK" as a WhatsApp message!
  res.status(200).end();
  
  if (!req.body) {
    console.error('ERROR: req.body is undefined/null');
    return;
  }
  
  console.log('Webhook body keys:', Object.keys(req.body));
  console.log('From:', req.body.From);
  console.log('Body:', req.body.Body);
  
  // Check for duplicate messages (Twilio retries)
  const messageSid = req.body.MessageSid;
  if (messageSid) {
    if (processedMessages.has(messageSid)) {
      console.log(`Duplicate message ${messageSid}, ignoring`);
      return;
    }
    processedMessages.set(messageSid, Date.now());
    
    // Clean old entries periodically
    if (processedMessages.size > 100) {
      cleanProcessedMessages();
    }
  }
  
  const messageData = extractMessageData(req.body);
  
  if (!messageData || !messageData.text) {
    console.log('No message data or text, ignoring');
    return;
  }
  
  console.log(`Message from ${messageData.contactName} (${messageData.from}): ${messageData.text}`);
  
  // Check rate limit
  if (!checkRateLimit(messageData.from)) {
    console.log(`Rate limit exceeded for ${messageData.from}`);
    // Clean rate limits periodically
    if (userRateLimits.size > 100) {
      cleanRateLimits();
    }
    return;
  }
  
  // Clean rate limits periodically
  if (userRateLimits.size > 100) {
    cleanRateLimits();
  }
  
  // Only process commands starting with /
  if (!messageData.text.startsWith('/')) {
    console.log('Not a command, ignoring');
    return;
  }
  
  const parsed = parseCommand(messageData.text);
  
  if (!parsed) {
    console.log('Could not parse command:', messageData.text);
    // Send error for unknown commands
    await sendWhatsAppMessage(messageData.from, '❌ Unknown command. Type /help for available commands.');
    return;
  }
  
  console.log(`Parsed command: ${parsed.command}, args:`, parsed.args);
  
  // Route to command handler
  const handler = commands[parsed.command];
  
  if (!handler) {
    console.log(`No handler for command: ${parsed.command}`);
    await sendWhatsAppMessage(messageData.from, '❌ Command not implemented yet.');
    return;
  }
  
  // Process command asynchronously
  processCommandAsync(parsed, messageData);
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
  
  // Log Twilio config
  console.log('Twilio Account SID:', process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'MISSING');
  console.log('Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'MISSING');
  console.log('Twilio WhatsApp Number:', process.env.TWILIO_WHATSAPP_NUMBER || 'MISSING');
  
  // Initialize Google Sheets BEFORE starting server
  console.log('\n--- Initializing Google Sheets ---');
  const sheetsReady = await sheets.initializeSheets();
  
  if (sheetsReady) {
    console.log('✅ Google Sheets connected and ready');
  } else {
    console.log('⚠️ Google Sheets not available (check .env configuration)');
  }
  
  // Start Express server
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

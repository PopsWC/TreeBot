require('dotenv').config();
const express = require('express');
const { parseCommand } = require('./parser');
const { sendWhatsAppMessage, extractMessageData } = require('./whatsapp');
const commands = require('./commands');
const sheets = require('./sheets');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize Google Sheets on startup
sheets.initializeSheets().then(success => {
  if (success) {
    console.log('Google Sheets integration enabled');
  } else {
    console.log('Google Sheets integration disabled (configure in .env)');
  }
});

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook handler
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  
  const messageData = extractMessageData(req.body);
  
  if (!messageData || !messageData.text) {
    return;
  }
  
  console.log(`Message from ${messageData.contactName} (${messageData.from}): ${messageData.text}`);
  
  // Only process commands starting with /
  if (!messageData.text.startsWith('/')) {
    return;
  }
  
  const parsed = parseCommand(messageData.text);
  
  if (!parsed) {
    await sendWhatsAppMessage(messageData.from, '❌ Unknown command. Type /help for available commands.');
    return;
  }
  
  // Route to command handler
  const handler = commands[parsed.command];
  
  if (!handler) {
    await sendWhatsAppMessage(messageData.from, '❌ Command not implemented yet.');
    return;
  }
  
  try {
    const response = await handler(parsed.args, messageData.from, messageData.contactName);
    if (response) {
      await sendWhatsAppMessage(messageData.from, response);
    }
  } catch (error) {
    console.error(`Error handling command ${parsed.command}:`, error);
    await sendWhatsAppMessage(messageData.from, '❌ An error occurred. Please try again.');
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const twilio = require('twilio');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP = process.env.TWILIO_WHATSAPP_NUMBER;

let client = null;

function getClient() {
  if (!client && accountSid && authToken) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

async function sendWhatsAppMessage(to, message) {
  const twilioClient = getClient();
  
  if (!twilioClient) {
    console.error('Twilio client not initialized');
    return false;
  }
  
  try {
    await twilioClient.messages.create({
      body: message,
      from: TWILIO_WHATSAPP,
      to: `whatsapp:${to}`
    });
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.message);
    return false;
  }
}

function extractMessageData(body) {
  try {
    const from = body.From || '';
    const phoneNumber = from.replace('whatsapp:', '');
    const text = body.Body || '';
    const contactName = body.ProfileName || 'Unknown';
    
    return {
      from: phoneNumber,
      text: text,
      contactName: contactName,
      messageId: body.MessageSid,
      timestamp: body.Timestamp
    };
  } catch (error) {
    console.error('Error extracting message data:', error);
    return null;
  }
}

const MAX_MESSAGE_LENGTH = 4000;

function truncateMessage(message) {
  if (!message || message.length <= MAX_MESSAGE_LENGTH) {
    return message;
  }
  return message.substring(0, MAX_MESSAGE_LENGTH - 20) + '\n\n... (truncated)';
}

function generateTwiML(message) {
  const twiml = new MessagingResponse();
  twiml.message(truncateMessage(message));
  return twiml.toString();
}

function generateEmptyTwiML() {
  return new MessagingResponse().toString();
}

module.exports = {
  sendWhatsAppMessage,
  extractMessageData,
  generateTwiML,
  generateEmptyTwiML
};

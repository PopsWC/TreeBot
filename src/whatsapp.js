const fetch = require('node-fetch');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID;

async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
          body: message
        }
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('WhatsApp API error:', data);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return false;
  }
}

function extractMessageData(body) {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    
    if (!value?.messages?.[0]) {
      return null;
    }
    
    const message = value.messages[0];
    const contact = value.contacts?.[0];
    
    return {
      from: message.from,
      messageId: message.id,
      text: message.text?.body,
      contactName: contact?.profile?.name || 'Unknown',
      timestamp: message.timestamp
    };
  } catch (error) {
    console.error('Error extracting message data:', error);
    return null;
  }
}

module.exports = {
  sendWhatsAppMessage,
  extractMessageData
};

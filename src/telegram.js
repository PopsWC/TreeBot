// Telegram integration — reuses the same parser + command handlers as WhatsApp.
// Long polling: no webhook/public URL needed. Bot starts only when TELEGRAM_BOT_TOKEN is set.
const { TelegramBot } = require('node-telegram-bot-api');
const { parseCommand } = require('./parser');
const commands = require('./commands');

const MAX_MESSAGE_LENGTH = 4000; // Telegram limit is 4096

let bot = null;

function truncate(message) {
  if (!message || message.length <= MAX_MESSAGE_LENGTH) return message;
  return message.substring(0, MAX_MESSAGE_LENGTH - 20) + '\n\n... (truncated)';
}

function userFrom(msg) {
  return {
    from: `telegram:${msg.from.id}`,
    name: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ')
      || msg.from.username
      || 'Unknown'
  };
}

// Attach inline Confirm/Cancel keyboard for two-step flows
function confirmKeyboard(prefix, payload) {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Confirm', callback_data: `${prefix}:confirm:${payload}` },
        { text: '❌ Cancel', callback_data: `${prefix}:cancel:${payload}` }
      ]]
    }
  };
}

async function handleCommand(msg) {
  const chatId = msg.chat.id;
  let text = (msg.text || '').trim();

  // Strip @botname suffix (group chats): /drop@TreeBot -> /drop
  text = text.replace(/^(\/\w+)@\w+/, '$1');

  if (!text.startsWith('/')) {
    return; // ignore chatter silently (groups stay quiet)
  }

  const parsed = parseCommand(text);
  if (!parsed) {
    await bot.sendMessage(chatId, '❌ Unknown command. Type /help for available commands.');
    return;
  }

  const handler = commands[parsed.command];
  if (!handler) {
    await bot.sendMessage(chatId, '❌ Command not implemented yet.');
    return;
  }

  const { from, name } = userFrom(msg);

  try {
    const response = await handler(parsed.args, from, name);

    // Two-step flows get inline buttons instead of "type confirm"
    if (parsed.command === 'removesection' && typeof response === 'string' && response.includes('confirm to proceed')) {
      await bot.sendMessage(chatId, truncate(response), confirmKeyboard('removesection', parsed.args.section));
      return;
    }
    if (parsed.command === 'import' && typeof response === 'string' && response.includes('/import confirm')) {
      await bot.sendMessage(chatId, truncate(response), confirmKeyboard('import', ''));
      return;
    }

    await bot.sendMessage(chatId, truncate(response));
  } catch (error) {
    console.error(`Telegram: error handling ${parsed.command}:`, error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const { from, name } = userFrom(query);
  const [prefix, action, payload] = (query.data || '').split(':');

  try {
    await bot.answerCallbackQuery(query.id);

    if (prefix === 'removesection') {
      if (action === 'confirm') {
        const response = await commands.removesection({ section: payload, confirmed: true }, from, name);
        await bot.sendMessage(chatId, truncate(response));
      } else {
        await bot.sendMessage(chatId, 'Cancelled — section not deleted.');
      }
      return;
    }

    if (prefix === 'import') {
      if (action === 'confirm') {
        const response = await commands.import({ _: ['confirm'] }, from, name);
        await bot.sendMessage(chatId, truncate(response));
      } else {
        const response = await commands.import({ _: ['cancel'] }, from, name);
        await bot.sendMessage(chatId, truncate(response));
      }
      return;
    }
  } catch (error) {
    console.error('Telegram: callback error:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
}

async function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('Telegram: not configured (TELEGRAM_BOT_TOKEN not set)');
    return false;
  }

  bot = new TelegramBot(token, { polling: true });

  bot.on('message', (msg) => {
    handleCommand(msg).catch(err => console.error('Telegram: message handler error:', err));
  });
  bot.on('callback_query', (query) => {
    handleCallback(query).catch(err => console.error('Telegram: callback handler error:', err));
  });
  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message);
  });

  try {
    const me = await bot.getMe();
    console.log(`Telegram: connected as @${me.username}`);
    return true;
  } catch (err) {
    console.error('Telegram: failed to connect —', err.message);
    return false;
  }
}

module.exports = { startBot };

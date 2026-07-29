# TreeBot Telegram Integration Plan

> **Status:** plan only, no changes made yet.

**Goal:** Full command parity with WhatsApp via a Telegram bot, reusing the same command handlers, parser, undo system, and Sheets sync.

**Architecture:** Long-polling via `node-telegram-bot-api` (no webhook/public URL needed — Railway already runs a server but polling removes all webhook config burden and works even if the domain changes). Reuse `parseCommand` + `commands` directly. Telegram user id → `from` attribution (per-user undo), first name → logs.

**Tech Stack:** `node-telegram-bot-api` (mature, polling built-in). One new npm dependency.

---

## Why polling over webhooks

| | Polling (chosen) | Webhook |
|---|---|---|
| Setup | just a bot token | public URL + setWebhook call |
| Railway fit | perfect — outbound only | needs stable domain |
| Conflict risk | none | must manage webhook lifecycle |
| Latency | ~1s | instant |

Crew-size traffic makes the ~1s polling latency irrelevant.

---

## Design decisions

1. **Same command surface:** `/drop`, `/addstock`, … identical syntax to WhatsApp. Telegram auto-lowercases nothing; parser already handles case.
2. **Attribution:** `from = telegram:<user_id>`, `contactName = Telegram first_name (+ username)`. Undo is per-Telegram-user, matching WhatsApp behavior.
3. **No dedup needed:** Telegram delivers each update once with an offset cursor (library handles it). No rate limiting needed beyond the library's queue — but keep the same 2s/user limit for consistency? **Decision: skip rate limiting** (Telegram has no webhook-retry storm; commands are idempotent-guarded by validation anyway). Simple.
4. **Inline buttons for confirms:** `/removesection 6` and `/import` get Telegram inline-keyboard Confirm/Cancel buttons instead of "type confirm" — better UX, minimal code (callback_query handler). Falls back to typed `confirm` too.
5. **Long messages:** Telegram limit is 4096 chars — reuse `truncateMessage`-style logic with 4000.
6. **Graceful coexistence:** bot only starts if `TELEGRAM_BOT_TOKEN` is set; otherwise logs "Telegram: not configured" and everything else is untouched. Zero risk to WhatsApp/web.

---

## Files

- Create: `src/telegram.js` — bot setup, message routing, inline keyboards, truncation
- Modify: `src/index.js` — `require('./telegram').startBot()` in `startServer()` after sheets init
- Modify: `package.json` — add `node-telegram-bot-api`
- Modify: `README.md` — Telegram setup section

No changes to parser, commands, database, sync, api, or frontend. That's the payoff of the existing architecture.

---

## Tasks

### Task 1: dependency + bot skeleton
- `npm install node-telegram-bot-api`
- `src/telegram.js`:
  - `startBot()`: no-op if `!process.env.TELEGRAM_BOT_TOKEN`
  - `new TelegramBot(token, { polling: true })`
  - `bot.on('message', ...)`: ignore non-text and non-`/` messages with a friendly reply
  - Log bot username at startup (`bot.getMe()`)

### Task 2: command routing
- In message handler:
  ```js
  const parsed = parseCommand(text);
  if (!parsed) return bot.sendMessage(chatId, '❌ Unknown command. /help for list.');
  const handler = commands[parsed.command];
  const from = `telegram:${msg.from.id}`;
  const name = msg.from.first_name || msg.from.username || 'Unknown';
  const response = await handler(parsed.args, from, name);
  bot.sendMessage(chatId, truncate(response, 4000), { parse_mode: 'Markdown' });
  ```
- Errors → same `❌ An error occurred` behavior as WhatsApp.
- Note: WhatsApp's `*bold*` markdown works as-is in Telegram's legacy Markdown mode — the handlers' existing formatting renders correctly. 

### Task 3: inline-keyboard confirms
- `/removesection`: handler returns the ⚠️ prompt; telegram.js detects the "Type /removesection X confirm" pattern and attaches an inline keyboard `[✅ Confirm] [❌ Cancel]`.
- `callback_query` handler: on confirm, calls `commands.removesection({section, confirmed:true}, from, name)`; on cancel, sends "Cancelled."
- Same pattern for `/import` → `[Apply Import] [Cancel]` wired to importConfirm/importCancel handlers.
- Typed `confirm` still works (parser already supports it).

### Task 4: integration into startup + docs
- `src/index.js`: after sheets init, `require('./telegram').startBot();`
- Startup log line: `Telegram: @botusername` or `Telegram: not configured`
- README: how to create the bot with @BotFather, set `TELEGRAM_BOT_TOKEN`, command list, note that undo/logs are per-Telegram-user.

### Task 5: verification
- Local: create a test bot via @BotFather, run locally with token, run through: /help, /addkey, /addstock, /setalloc, /drop, /undo, /removesection with button confirm, /import buttons.
- Confirm attribution: activity log shows `telegram:<id>`.
- Confirm WhatsApp + web still work simultaneously.
- Deploy: set `TELEGRAM_BOT_TOKEN` on Railway via API, verify in prod.

---

## Env vars

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Bot only starts when set. |

## Risks / notes

- **Polling on Railway**: fine — single instance, no duplicate consumers. If you ever scale to 2 replicas, polling breaks (duplicate updates); you'd switch to webhook mode then. Documented in README.
- **Group chats**: crews may add the bot to a group. Plan: respond in groups too (commands are `/`-prefixed so noise is low); privacy mode in BotFather must be disabled for group messages, or crew uses commands with `/cmd@botname` — handle by stripping `@botname` suffix in the router.
- **Message length**: truncate at 4000 (Telegram 4096 limit).
- No changes to Sheets schema, DB schema, or existing channels.

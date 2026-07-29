# WhatsApp Tree Planting Bot

A WhatsApp bot for tracking tree planting box drops and allocations. Designed for tree planting crews to manage inventory, track section allocations, and log box drops in real-time.

## Features

- **Inventory Management** - Track main stock by request key
- **Section Allocations** - Set targets for each section
- **Box Drop Tracking** - Log drops and monitor progress
- **Real-time Alerts** - Completion and over-allocation warnings
- **Undo Support** - Undo last 5 actions (per user)
- **Google Sheets Sync** - Auto-sync data to spreadsheet
- **Activity Logging** - Full audit trail of all actions
- **Web UI** - Button-driven web interface (no typing commands)

## Web UI

The bot serves a mobile-friendly web interface at `/` (the root URL of your deployment). Everything is buttons, dropdowns, and steppers — no command typing:

- **Home** - inventory totals + per-section progress bars
- **Drop** - pick section → key → quantity, log the drop
- **Stock** - inventory table + add stock
- **Alloc** - set per-section targets
- **Keys** - manage request keys
- **Sections** - add/edit/delete sections (with confirm dialog)
- **Activity** - audit log + undo button
- **Sheets** - connection status, sync now, import preview/apply

Web actions go through the same logic as WhatsApp commands — undo history, activity logs, and Sheets auto-sync work identically.

### User identity

The web UI asks for your name once (stored in the browser, no accounts or passwords). Actions are attributed to that name in the activity log, and **Undo only affects your own actions** — same as WhatsApp. Tap the name badge in the header to switch names.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `WEB_UI_URL` | Public URL of the deployment (e.g. `https://treebot.up.railway.app`). When set, `/help` in WhatsApp replies with the web link. |
| `WEB_UI_TOKEN` | Optional. If set, the web UI requires this bearer token (entered once in the browser) before any data loads. Recommended on public deployments. |
| `TWILIO_SKIP_VALIDATION` | Local dev only. Webhook signature validation is **on by default**; set to `true` to disable when testing locally without Twilio signatures. Never set in production. |

## Commands

### Inventory Management
| Command | Format | Example |
|---------|--------|---------|
| `/addkey` | `/addkey [key] "[species]" [short]` | `/addkey gg-2024-068 "Coyote Willow" 068` |
| `/addstock` | `/addstock [qty] [key]` | `/addstock 3000 gg-2024-068` |
| `/stock` | `/stock` or `/stock [key]` | `/stock 068` |
| `/keys` | `/keys` or `/keys "[species]"` | `/keys "Coyote Willow"` |
| `/species` | `/species` | `/species` |

### Section Management
| Command | Format | Example |
|---------|--------|---------|
| `/addsection` | `/addsection [id] "[description]"` | `/addsection 6 "North Field Plot"` |
| `/removesection` | `/removesection [id]` | `/removesection 6` |
| `/listsections` | `/listsections` | `/listsections` |
| `/editsection` | `/editsection [id] "[desc]"` | `/editsection 6 "New description"` |

### Allocation & Drops
| Command | Format | Example |
|---------|--------|---------|
| `/setalloc` | `/setalloc [qty] [key] section [s]` | `/setalloc 200 068 section 6` |
| `/drop` | `/drop [qty] [key] section [s]` | `/drop 100 068 section 6` |
| `/status` | `/status section [s]` | `/status section 6` |
| `/remaining` | `/remaining` or `/remaining section [s]` | `/remaining section 6` |

### Utilities
| Command | Format | Example |
|---------|--------|---------|
| `/sync` | `/sync` or `/sync [tab]` | `/sync inventory` |
| `/math` | `/math [box_size] [decimal]` | `/math 180 .35` |
| `/undo` | `/undo` | `/undo` |
| `/logs` | `/logs` or `/logs [user]` | `/logs John` |
| `/help` | `/help` | `/help` |

---

## Deployment Guide

### Prerequisites

- Node.js 18+ installed (for local development)
- GitHub account
- Twilio account with WhatsApp-enabled number
- Railway account (for hosting)

---

## Environment Variables

The bot needs these environment variables to run. You'll set them in **two different places** depending on how you run the bot:

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Your Twilio Account SID (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | Yes | Your Twilio Auth Token |
| `TWILIO_WHATSAPP_NUMBER` | Yes | Your Twilio WhatsApp number (e.g. `whatsapp:+14155238886`) |
| `GOOGLE_SHEETS_ID` | No | Google Sheets spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | No | Raw JSON content of your Google service account credentials |
| `PORT` | No | Server port (defaults to 3000) |

### Where to Set Variables

**For local development:** Create a `.env` file in the project root (see Part 3 below)

**For Railway deployment:** Add variables in the Railway dashboard (see Part 5 below)

> **Important:** The `.env` file is listed in `.gitignore`, so it is **never uploaded to GitHub**. Your secrets stay on your computer. On Railway, you enter the same values through their web dashboard instead.

---

## Part 1: Twilio WhatsApp Setup

### Step 1: Create Twilio Account

1. Go to https://console.twilio.com
2. Sign up for a free account
3. Verify your email and phone number

### Step 2: Get Credentials

1. In the Twilio Console Dashboard, find:
   - **Account SID** (starts with `AC`)
   - **Auth Token** (click to reveal)
2. Copy and save both values

### Step 3: Get WhatsApp Number

1. Go to **Messaging** → **WhatsApp Senders**
2. Click **"Buy a Number"** or use an existing number
3. Ensure the number is WhatsApp-enabled
4. Note the number in E.164 format: `+14155238886`

### Step 4: Configure Webhook (After Deployment)

1. Go to **Messaging** → **WhatsApp Senders**
2. Click on your WhatsApp number
3. Under **"Webhook Configuration"**, set:
   - **When a message comes in**: `https://your-app.up.railway.app/whatsapp`
   - Method: **HTTP POST**
4. Click **Save**

---

## Part 2: Google Sheets Setup (Optional)

### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click **"Select a Project"** → **"New Project"**
3. Name: `"Tree Bot Sheets"`
4. Click **"Create"**

### Step 2: Enable APIs

1. In your project, go to **APIs & Services** → **Library**
2. Search and enable:
   - **Google Sheets API**
   - **Google Drive API**

### Step 3: Create Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **"Create Credentials"** → **Service Account**
3. Enter details:
   - Name: `"tree-bot-sheets"`
   - Description: `"Tree Bot Sheets Access"`
4. Click **"Create and Continue"**
5. Skip role assignment, click **"Done"**

### Step 4: Create Service Account Key

1. Click on the created service account
2. Go to **"Keys"** tab
3. Click **"Add Key"** → **"Create new key"**
4. Select **JSON**
5. Click **"Create"** - JSON file downloads

### Step 5: Get Credentials JSON

1. Open the downloaded JSON file in a text editor
2. Select **all** the content (Cmd+A on Mac, Ctrl+A on Windows)
3. Copy it — you'll paste this entire JSON content into Railway as an environment variable

> **Important:** The JSON content includes newlines in the `private_key` field. Make sure you copy the entire file content exactly as-is, including all newlines and special characters.

### Step 6: Create Spreadsheet

1. Go to https://sheets.google.com
2. Create new spreadsheet: `"Tree Bot Data"`
3. Create these tabs (sheets):
   - `Inventory`
   - `Allocations`
   - `Drop History`
   - `Activity Log`
   - `Sections`
4. Copy the **Spreadsheet ID** from URL:
   ```
   https://docs.google.com/spreadsheets/d/[THIS_IS_THE_ID]/edit
   ```

### Step 7: Share Spreadsheet

1. In Google Sheets, click **"Share"**
2. Enter the service account email (from the JSON file, field `client_email`)
   - Looks like: `tree-bot-sheets@your-project.iam.gserviceaccount.com`
3. Give **"Editor"** access
4. Click **"Send"**

---

## Part 3: Environment Variables for Local Development

If you want to run the bot on your computer (for testing/development), create a `.env` file in the project root.

### Step 1: Create `.env` File

Create a file called `.env` in the project root (same folder as `package.json`):

```env
# Twilio WhatsApp (Required)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Google Sheets (Optional)
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY={"type": "service_account", "project_id": "your-project", "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n", "client_email": "your-service-account@your-project.iam.gserviceaccount.com", ...}

# Server
PORT=3000
```

> **Tip:** For the `GOOGLE_SERVICE_ACCOUNT_KEY`, paste the entire JSON content on a single line. The newlines in the private key will be escaped as `\n` in the JSON string.

### Step 2: Replace Placeholder Values

Replace each `your_xxx_here` with your actual values from:
- **TWILIO_ACCOUNT_SID**: From Twilio Console dashboard
- **TWILIO_AUTH_TOKEN**: From Twilio Console dashboard
- **TWILIO_WHATSAPP_NUMBER**: Your Twilio WhatsApp number with `whatsapp:` prefix
- **GOOGLE_SHEETS_ID**: From your Google Sheets URL (optional)

### Step 3: Run Locally

```bash
npm install
npm run dev
```

> **Note:** The `.env` file is in `.gitignore` and will **never be uploaded to GitHub**. This keeps your secrets safe.

---

## Part 4: Deploy to GitHub

### Step 1: Initialize Git

```bash
cd whatsapp-tree-bot
git init
git add .
git commit -m "Initial commit"
```

### Step 2: Create GitHub Repository

1. Go to https://github.com
2. Click **"+"** → **"New repository"**
3. Name: `whatsapp-tree-bot`
4. Keep it **Private** (recommended)
5. Don't initialize with README

### Step 3: Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-tree-bot.git
git branch -M main
git push -u origin main
```

---

## Part 5: Deploy to Railway

### Step 1: Create Railway Account

1. Go to https://railway.app
2. Sign up with GitHub

### Step 2: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Authorize Railway access
4. Select your `whatsapp-tree-bot` repository

### Step 3: Add Environment Variables in Railway

> **This is how Railway gets your secrets** — instead of reading from a `.env` file (which wasn't uploaded to GitHub), you enter the values directly in Railway's dashboard.

1. In Railway dashboard, click on your project
2. Go to the **"Variables"** tab
3. Click **"New Variable"** and add each one:

| Variable | Value | Example |
|----------|-------|---------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | `AC1234567890abcdef...` |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | `auth_token_here` |
| `TWILIO_WHATSAPP_NUMBER` | Your WhatsApp number with prefix | `whatsapp:+14155238886` |
| `GOOGLE_SHEETS_ID` | Your spreadsheet ID (optional) | `1abc123...` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Entire JSON content from service account file (optional) | `{"type": "service_account", ...}` |

4. Click **"Deploy"** or wait for auto-deploy

> **Important:** For `GOOGLE_SERVICE_ACCOUNT_KEY`, paste the **entire JSON content** from your service account key file. This is a long string that includes all fields like `type`, `project_id`, `private_key`, `client_email`, etc. Make sure to copy the complete JSON content including the opening `{` and closing `}`.

### Step 4: Get Your Webhook URL

1. In Railway, go to **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Copy the URL — it looks like: `https://your-app-name.up.railway.app`

Your full webhook URL will be:
```
https://your-app-name.up.railway.app/whatsapp
```

---

## Part 6: Configure Twilio Webhook

Now connect Twilio to your deployed bot:

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Messaging** → **WhatsApp Senders**
3. Click on your WhatsApp number
4. Under **"Webhook Configuration"**:
   - **When a message comes in**: Enter your Railway webhook URL
     ```
     https://your-app-name.up.railway.app/whatsapp
     ```
   - Method: **HTTP POST**
5. Click **Save**

---

## Part 7: Test the Bot

### Step 1: Send Test Message

1. Send a WhatsApp message to your Twilio WhatsApp number
2. Message: `/help`
3. Bot should respond with the command list

### Step 2: Test Basic Workflow

```
/addsection 6 "Test Section"
/addkey gg-2024-068 "Coyote Willow" 068
/addstock 1000 gg-2024-068
/setalloc 200 068 section 6
/drop 100 068 section 6
/remaining section 6
/stock
```

### Step 3: Verify Google Sheets (if configured)

1. Open your spreadsheet
2. Data should appear in respective tabs after each action

---

## Troubleshooting

### Bot Not Responding

1. Check Railway logs for errors (Railway Dashboard → Deployments → View Logs)
2. Verify webhook URL is correct (ends with `/whatsapp`)
3. Ensure Twilio credentials are correct in Railway Variables
4. Check that your WhatsApp number is active in Twilio

### Twilio Errors

- **"Authentication Error"**: Check Account SID and Auth Token in Railway Variables
- **"Invalid number"**: Ensure number format is `whatsapp:+14155238886` (with country code)
- **"Unverified number"**: For sandbox, users must join first

### Google Sheets Not Syncing

1. Verify `GOOGLE_SERVICE_ACCOUNT_KEY` contains the entire JSON content (not a file path)
2. Check spreadsheet is shared with service account email (field `client_email` in the JSON)
3. Ensure Sheet ID is correct in Railway Variables
4. Check Railway logs for API errors
5. Ensure all 5 tabs exist: `Inventory`, `Allocations`, `Drop History`, `Activity Log`, `Sections`

### Database Issues

SQLite database is stored in `data/inventory.db`
- Created automatically on first run
- Back up this file regularly if running locally
- On Railway, database resets on each deploy (data is ephemeral)

---

## Development (Local)

```bash
# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Run in production mode
npm start
```

> **Note:** For local development, you need a `.env` file (see Part 3). For production on Railway, variables are set in the dashboard (see Part 5).

---

## Project Structure

```
whatsapp-tree-bot/
├── src/
│   ├── index.js          # Express server, webhook handler
│   ├── whatsapp.js       # Twilio WhatsApp client
│   ├── parser.js         # Command parsing
│   ├── database.js       # SQLite operations
│   ├── sheets.js         # Google Sheets API
│   ├── sync.js           # Sync logic
│   └── commands/
│       └── index.js      # All command handlers
├── data/
│   └── inventory.db      # Created automatically
├── .env                  # Local only - NOT uploaded to GitHub
├── .gitignore
├── package.json
└── README.md
```

---

## License

ISC

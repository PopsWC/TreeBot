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

- Node.js 18+ installed
- GitHub account
- Twilio account with WhatsApp-enabled number
- Railway account (for hosting)

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

### Step 5: Setup Credentials File

1. Create folder: `credentials/` in project
2. Rename downloaded file to: `google-sheets.json`
3. Move to: `credentials/google-sheets.json`

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
2. Enter the service account email (from JSON file)
   - Looks like: `tree-bot-sheets@your-project.iam.gserviceaccount.com`
3. Give **"Editor"** access
4. Click **"Send"**

---

## Part 3: Environment Variables

### Create `.env` File

```env
# Twilio WhatsApp (Required)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Google Sheets (Optional)
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY=credentials/google-sheets.json

# Server
PORT=3000
```

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

### Step 3: Add Environment Variables

1. In Railway dashboard, go to **"Variables"** tab
2. Add each variable from your `.env`:
   ```
   TWILIO_ACCOUNT_SID = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN = your_auth_token
   TWILIO_WHATSAPP_NUMBER = whatsapp:+14155238886
   GOOGLE_SHEETS_ID = your_sheet_id (if using sheets)
   ```

### Step 4: Deploy

1. Railway auto-deploys on push
2. Wait for deployment to complete
3. Click **"Settings"** → **"Networking"**
4. Click **"Generate Domain"** to get your URL

### Step 5: Note Your Webhook URL

Your webhook URL will be:
```
https://your-app-name.up.railway.app/whatsapp
```

---

## Part 6: Configure Twilio Webhook

### Step 1: Set Webhook URL

1. Go to Twilio Console
2. Navigate to **Messaging** → **WhatsApp Senders**
3. Click on your WhatsApp number
4. Under **"Webhook Configuration"**:
   - **When a message comes in**: `https://your-app.up.railway.app/whatsapp`
   - Method: **HTTP POST**
5. Click **Save**

---

## Part 7: Test the Bot

### Step 1: Send Test Message

1. Send WhatsApp message to your Twilio WhatsApp number
2. Message: `/help`
3. Bot should respond with command list

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
2. Data should appear in respective tabs

---

## Troubleshooting

### Bot Not Responding

1. Check Railway logs for errors
2. Verify webhook URL is correct (ends with `/whatsapp`)
3. Ensure Twilio credentials are correct
4. Check that your WhatsApp number is verified in Twilio

### Twilio Errors

- **"Authentication Error"**: Check Account SID and Auth Token
- **"Invalid number"**: Ensure number is in `whatsapp:+14155238886` format
- **"Unverified number"**: For sandbox, users must join first

### Google Sheets Not Syncing

1. Verify service account JSON is in place
2. Check spreadsheet is shared with service account
3. Ensure Sheet ID is correct in `.env`
4. Check Railway logs for API errors

### Database Issues

SQLite database is stored in `data/inventory.db`
- Back up this file regularly
- It's created automatically on first run

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Run in production mode
npm start
```

---

## Project Structure

```
whatsapp-tree-bot/
├── src/
│   ├── index.js          # Express server, webhook
│   ├── whatsapp.js       # Twilio WhatsApp client
│   ├── parser.js         # Command parsing
│   ├── database.js       # SQLite operations
│   ├── sheets.js         # Google Sheets API
│   ├── sync.js           # Sync logic
│   └── commands/
│       └── index.js      # All command handlers
├── credentials/
│   └── google-sheets.json
├── data/
│   └── inventory.db
├── .env
├── .gitignore
├── package.json
└── README.md
```

---

## License

ISC

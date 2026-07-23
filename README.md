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
- Meta (Facebook) Developer account
- Railway account (for hosting)

---

## Part 1: WhatsApp Business API Setup

### Step 1: Create Meta Developer Account

1. Go to https://developers.facebook.com
2. Click **"Get Started"** and login with Facebook
3. Complete developer account setup

### Step 2: Create App

1. Go to **My Apps** → **Create App**
2. Select **"Business"** type
3. Enter app name: `"Tree Planting Bot"`
4. Create app

### Step 3: Add WhatsApp Product

1. In your app dashboard, click **"Add Product"**
2. Find **WhatsApp** and click **"Set Up"**
3. Select or create a Meta Business account

### Step 4: Get API Credentials

1. Go to **WhatsApp** → **Configuration**
2. Note down:
   - **Phone Number ID** (found in WhatsApp accounts)
   - **Temporary Access Token** (click "Generate Token")

> **Note:** The temporary token expires after 24 hours. For production, you'll need to create a System User and get a permanent token.

### Step 5: Create Permanent Token (Recommended)

1. Go to **Business Settings** → **System Users**
2. Click **"Add"** to create a system user
3. Add assets: Select your app → WhatsApp accounts
4. Generate token with `whatsapp_business_messaging` permission
5. Copy and save this token permanently

### Step 6: Add Test Phone Number

1. In WhatsApp Configuration, scroll to **"Phone Numbers"**
2. Click **"Add Phone Number"**
3. Follow the verification steps
4. Note the phone number ID

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
# WhatsApp API (Required)
WHATSAPP_TOKEN=your_permanent_token_here
WHATSAPP_PHONE_ID=your_phone_number_id_here
VERIFY_TOKEN=any_random_string_here

# Google Sheets (Optional)
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY=credentials/google-sheets.json

# Server
PORT=3000
```

### Generate Verify Token

Run this in terminal to generate a random token:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
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
   WHATSAPP_TOKEN = your_token
   WHATSAPP_PHONE_ID = your_phone_id
   VERIFY_TOKEN = your_verify_token
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
https://your-app-name.up.railway.app/webhook
```

---

## Part 6: Configure WhatsApp Webhook

### Step 1: Set Webhook URL

1. Go to Meta Developer Dashboard
2. Navigate to **WhatsApp** → **Configuration**
3. Under **"Webhook"**, click **"Edit"**
4. Enter:
   - **Callback URL:** `https://your-app.up.railway.app/webhook`
   - **Verify Token:** (same as in your `.env`)
5. Click **"Verify and Save"**

### Step 2: Subscribe to Messages

1. Still in WhatsApp Configuration
2. Under **"Webhook"** → **"Subscribe"**
3. Select: **`messages`**
4. Click **"Subscribe"**

---

## Part 7: Test the Bot

### Step 1: Send Test Message

1. Send WhatsApp message to your test number
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
2. Verify webhook URL is correct
3. Ensure verify token matches
4. Check WhatsApp API token is valid

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
│   ├── whatsapp.js       # WhatsApp API client
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

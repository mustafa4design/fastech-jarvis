# JARVIS Manager Bot — Railway Deploy Guide

## What This Bot Does
The Manager bot lives in Slack. Mustafa and Hafsa can @mention it or DM it to:
- Get a post written on demand
- Ask for pipeline status
- Request content revisions
- Ask what to post today

It uses `claude-sonnet-4-6` — full intelligence, always. No downgrading.

---

## Step 1 — Slack App Setup

Go to api.slack.com/apps → Your Manager app → Settings.

### Required Bot Token Scopes (OAuth & Permissions → Bot Token Scopes)
```
app_mentions:read       — detect @Manager mentions
channels:history        — read public channel messages
chat:write              — post messages
groups:history          — read private channel messages
im:history              — read DMs
im:read                 — list DMs
im:write                — send DMs
mpim:history            — read group DMs
reactions:write         — add/remove thinking_face reaction
users:read              — look up user info
```

### Enable Socket Mode
1. Go to Settings → Socket Mode → Enable
2. Generate App-Level Token with scope: `connections:write`
3. Name it anything (e.g., "socket-token")
4. Save the token — this is your `SLACK_APP_TOKEN` (starts with `xapp-`)

### Event Subscriptions
1. Go to Event Subscriptions → Enable Events
2. Subscribe to Bot Events:
   - `app_mention`
   - `message.im`

### Reinstall App
After adding scopes, click "Reinstall to Workspace" at the top of OAuth & Permissions.
Your `SLACK_BOT_TOKEN` (starts with `xoxb-`) is shown there.

---

## Step 2 — Get Railway

1. Go to railway.app → Sign up / Log in
2. New Project → Deploy from GitHub Repo
3. Select `mustafa4design/fastech-jarvis`
4. Set **Root Directory**: `slack-bot`
5. Railway auto-detects Node.js from `package.json`

---

## Step 3 — Set Environment Variables in Railway

Go to your Railway project → Variables tab → Add these:

| Variable | Where to get it |
|---|---|
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information → App Credentials → Signing Secret |
| `SLACK_APP_TOKEN` | Slack app → Basic Information → App-Level Tokens |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `PORT` | Set to `3000` |

---

## Step 4 — Deploy

Railway deploys automatically on every `git push origin main`.

Check logs in Railway → Deployments → View Logs.
You should see:
```
JARVIS Manager bot running on port 3000 | Model: claude-sonnet-4-6
```

If you see errors, check that all 5 environment variables are set correctly.

---

## Step 5 — Invite Bot to All 7 Slack Channels

In each channel, type and send:
```
/invite @Manager
```

Do this in every channel:
- `#jarvis-hq`
- `#research`
- `#scripts`
- `#design`
- `#analytics`
- `#publishing`
- `#general`

---

## How Mustafa Uses It

### In any channel:
```
@Manager write me a post about how I replaced my entire content team with AI
@Manager what's the plan this week?
@Manager what performed best last week?
@Manager revise post 2 — make the hook punchier
```

### Direct message (no @mention needed):
Open a DM with Manager → type anything → get a response.

### Voice (Claude Code local):
"Hey Jarvis..." works in Claude Code voice mode locally — separate from this bot.

---

## How Hafsa Uses It

### Checking content:
```
@Manager what posts are ready for Buffer this week?
@Manager show me the Wednesday batch
```

### Requesting edits:
```
@Manager post 3 hook is too long — shorten it to under 12 words
```

### Status:
```
@Manager has everything been delivered to Slack this week?
```

---

## Troubleshooting

**Bot not responding to @mentions:**
- Make sure it's invited to the channel (`/invite @Manager`)
- Check Railway logs for errors
- Verify `SLACK_APP_TOKEN` is set and Socket Mode is enabled

**Bot responding to DMs only:**
- Check `app_mention` is subscribed in Event Subscriptions
- Reinstall the Slack app after adding scopes

**Claude API errors:**
- Check `ANTHROPIC_API_KEY` is set in Railway Variables
- Check your Anthropic account has credits at console.anthropic.com

**Bot goes offline:**
- Railway free tier sleeps after inactivity — upgrade to Hobby plan ($5/month) for always-on
- Or use Railway's always-on setting in project settings

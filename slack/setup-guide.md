# Slack Workspace Setup Guide — JARVIS HQ
*Complete this setup to connect Slack to the JARVIS content system.*

---

## STEP 1 — CREATE THE SLACK WORKSPACE

1. Go to slack.com → click "Create a new workspace"
2. Sign in with your Gmail (mustafaghauri218@gmail.com)
3. Workspace name: **JARVIS** (or "FASTECH AI HQ")
4. Add Hafsa (hafsasohail@[her email]) as a member during setup
5. Skip the "add teammates" step for now — you'll add agents as apps

---

## STEP 2 — CREATE THESE CHANNELS (in order)

In Slack: click "+" next to Channels → Create channel

| Channel | Purpose | Who posts here |
|---|---|---|
| #jarvis-hq | Main command center | Mustafa, Hafsa, Manager agent |
| #research | Weekly trend findings | Researcher agent |
| #scripts | Draft posts for review | Script Writer agent |
| #design | Design briefs | Designer agent |
| #analytics | Weekly performance reports | Analyst agent |
| #publishing | Buffer approval requests | Publisher agent |
| #general | Mustafa + Hafsa daily comms | Both humans |

**Make all channels private** (except #general) — only Mustafa, Hafsa, and the specific agent bot have access.

---

## STEP 3 — CREATE SLACK APPS FOR EACH AGENT

Go to api.slack.com/apps → "Create New App" → "From scratch"

Create one app per agent:

### App 1 — RESEARCHER
- App name: `Researcher`
- Emoji icon: paste a blue circle emoji 🔵
- Color: `#3b82f6`
- Bot token scope: `chat:write`, `channels:join`, `files:write`
- Channel access: #research, #jarvis-hq

### App 2 — HOOK WRITER
- App name: `Hook Writer`
- Emoji icon: 🟠
- Color: `#f97316`
- Bot token scope: `chat:write`, `channels:join`
- Channel access: #scripts, #jarvis-hq

### App 3 — SCRIPT WRITER
- App name: `Script Writer`
- Emoji icon: 🟡
- Color: `#eab308`
- Bot token scope: `chat:write`, `channels:join`, `files:write`
- Channel access: #scripts, #jarvis-hq

### App 4 — DESIGNER
- App name: `Designer`
- Emoji icon: 🟣
- Color: `#8b5cf6`
- Bot token scope: `chat:write`, `channels:join`
- Channel access: #design, #jarvis-hq

### App 5 — ANALYST
- App name: `Analyst`
- Emoji icon: 🟢
- Color: `#10b981`
- Bot token scope: `chat:write`, `channels:join`, `files:write`
- Channel access: #analytics, #jarvis-hq

### App 6 — MANAGER
- App name: `Manager`
- Emoji icon: 🔴
- Color: `#ef4444`
- Bot token scope: `chat:write`, `channels:join`, `channels:read`, `files:write`
- Channel access: ALL channels

### App 7 — PUBLISHER
- App name: `Publisher`
- Emoji icon: 🩵
- Color: `#00e5ff`
- Bot token scope: `chat:write`, `channels:join`
- Channel access: #publishing, #jarvis-hq

---

## STEP 4 — GET THE BOT TOKEN

For each app:
1. Go to api.slack.com/apps → click the app
2. "OAuth & Permissions" → "Install to Workspace"
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
4. Save each token — you'll need them for the MCP config

---

## STEP 5 — CONNECT SLACK MCP TO CLAUDE CODE

1. Open Claude Code (in your terminal or desktop app)
2. Run: `/mcp` to open MCP settings
3. Add the Slack MCP server with this config:

```json
{
  "slack": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-slack"],
    "env": {
      "SLACK_BOT_TOKEN": "xoxb-YOUR-TOKEN-HERE",
      "SLACK_TEAM_ID": "YOUR-WORKSPACE-ID"
    }
  }
}
```

4. Get your Team ID: In Slack → click workspace name → Settings → scroll to find Team ID (starts with T)
5. Use the **Manager agent's** bot token as the primary token (it has access to all channels)

---

## STEP 6 — VERIFY CONNECTION

In Claude Code, say: "Jarvis, post a test message to #jarvis-hq"

If it works, you'll see the message appear in Slack.

---

## ACCESS CONTROL

| Person | Channels | Permissions |
|---|---|---|
| Mustafa | All channels | Full admin |
| Hafsa | All channels | Member (read + post) |
| Agent bots | Their assigned channels only | Post only |

---

## DAILY WORKFLOW IN SLACK

- **#jarvis-hq** — start here. Mustafa gives commands, Manager reports status.
- **#publishing** — Hafsa approves posts here before they go live in Buffer.
- **#research** — auto-updated Monday morning by Researcher.
- **#analytics** — auto-updated Sunday evening by Analyst.
- **#scripts** — review draft posts from Script Writer.
- **#design** — check design briefs from Designer.

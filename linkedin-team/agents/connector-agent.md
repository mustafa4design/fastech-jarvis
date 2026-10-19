# CONNECTOR AGENT
## LinkedIn Outreach Team — FASTECH.PAK

---

## ONE JOB
Send connection requests from the approved queue. Never stop the pipeline.

---

## LIMITS (LinkedIn Free Plan)

| Type | Daily | Weekly |
|------|-------|--------|
| WITH note | 2 | 15 (+ monthly quota) |
| WITHOUT note | 10 | 70 |

---

## ⚠️ NOTE LIMIT RULE — READ THIS FIRST

**If the 2/day WITH-note limit is already hit, OR LinkedIn says "You're out of free custom notes":**

→ **DO NOT STOP**
→ **Send ALL remaining connections WITHOUT note immediately**
→ Never block or pause the pipeline because notes aren't available

**This is permanent. Every time. No exceptions.**

The personalized DM sent after acceptance is more powerful than any connection note anyway. Connections still go out. Pipeline keeps moving.

**Flow:**
1. Check daily count — how many WITH-note already sent today?
2. If < 2 → send up to 2 WITH note
3. If ≥ 2 OR LinkedIn blocks notes → send ALL remaining WITHOUT note
4. Log every send in `memory/linkedin-log.md`

---

## HOW TO SEND

### WITH note
1. Open profile URL
2. Click Connect
3. Click "Add a note"
4. Paste personalized note (under 300 chars)
5. Click Send
6. Log as `sent_with_note`

### WITHOUT note
1. Open profile URL
2. Click Connect
3. Click "Send without a note"
4. Log as `sent_without_note`

### Creator mode profiles (shows "Follow" instead of "Connect")
1. Click the "..." menu
2. Select "Connect"
3. Continue with normal flow

---

## CONNECTION NOTE TEMPLATE (when allowed)
```
Hey [Name], love what you're building at [Company]. I work with DTC brands on video/content — would love to connect and share notes.
— Mustafa
```
Keep under 300 characters.

---

## QUEUE FILE
Read from: `leads/YYYY-MM-DD/connection-log.json`

Expected format per lead:
```json
{
  "name": "First Last",
  "role": "CMO at Brand",
  "linkedin_url": "https://linkedin.com/in/...",
  "note": "Personalized note text",
  "status": "approved"
}
```

Update status to:
- `sent_with_note` — sent with note
- `sent_without_note` — sent without note
- `pending` — not yet sent
- `failed` — blocked or error

---

## AFTER EVERY RUN

1. Update `connection-log.json` with final statuses
2. Append to `memory/linkedin-log.md`:
```
[YYYY-MM-DD HH:MM PKT] | Connector | Sent X/Y connections | Z with note, W without note | Weekly: X/70 no-note, Y/15 with-note
```
3. Post daily report to Slack #outreach-daily (if connected)

---

## ERROR HANDLING

- **"You've reached the weekly invitation limit"** → Stop. Log. Report to Mustafa.
- **"You're out of free custom notes"** → Switch ALL remaining to without note. Keep sending.
- **"2nd degree but no Connect button"** → Check "..." menu. If still no Connect, skip and log as `failed`.
- **Auto-mode blocked** → Report to Mustafa to enable approve mode in Claude Code settings.

---

*Part of JARVIS LinkedIn Team · Last updated: 2026-10-19*

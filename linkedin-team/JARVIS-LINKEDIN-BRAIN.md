# JARVIS LINKEDIN BRAIN
## FASTECH.PAK LinkedIn Outreach HQ

---

## MISSION
Send targeted LinkedIn connection requests to DTC/ecommerce founders, CMOs, and marketing leaders. Build relationships. Convert to clients.

---

## ICP (Ideal Connection Profile)
- **Role:** Founder, CMO, VP Marketing, Growth Lead, DTC Brand Owner
- **Industry:** DTC, ecommerce, consumer brands, agencies serving DTC
- **Company size:** 1–50 employees (bootstrapped) or funded up to Series B
- **Location:** US, UK, Canada, Australia
- **Signal:** Running paid ads, has a product, growing brand

---

## DAILY LIMITS (LinkedIn Free Plan)

| Type | Daily | Weekly |
|------|-------|--------|
| WITH note | 2 | 15 (monthly quota also applies) |
| WITHOUT note | 10 | 70 |

---

## ⚠️ CRITICAL RULE — NOTE LIMIT HANDLING

**If the daily WITH-note limit (2/day) is already hit, OR if LinkedIn says "You're out of free custom notes" → DO NOT STOP.**

**Immediately switch ALL remaining connections to WITHOUT note and send them.**

Never pause the pipeline because notes aren't available. The connection still goes out. The personalized DM sent AFTER they accept is more powerful than any connection note anyway.

**Rule in plain terms:**
1. Try with note (up to 2/day)
2. If limit hit → skip note, send connection anyway
3. Never stop the pipeline over note limits
4. After acceptance → Messenger Agent sends personalized DM

---

## PIPELINE FLOW

```
Scout Agent → Manager Agent → Connector Agent → (wait for accept) → Messenger Agent
```

### Step 1: Scout Agent
- Searches LinkedIn Sales Nav / Google / Apollo for ICP leads
- Saves to `leads/YYYY-MM-DD/connection-log.json`
- Target: 15–20 leads per run

### Step 2: Manager Agent
- Reviews Scout's leads
- Approves/rejects based on ICP fit
- Adds personalized note drafts for top 2
- Approves 10–12 for sending

### Step 3: Connector Agent
- Reads the approved queue
- Sends WITH note to first 2 (if daily limit not hit)
- Sends WITHOUT note to all others
- **If note limit already hit → sends ALL without note**
- Updates log with sent/pending/failed status

### Step 4: Messenger Agent (triggered after acceptance)
- Monitors connection accepts
- Sends personalized DM within 24h of accept
- DM references their brand, recent content, or specific pain point
- Goal: book a call or start a conversation

---

## CONNECTION NOTE TEMPLATE (when allowed)
```
Hey [Name], love what you're building at [Company]. I work with DTC brands on video/content — would love to connect and share notes.
— Mustafa
```
Keep under 300 characters.

---

## OUTREACH SEQUENCE — FULL PATTERN

Same logic as email outreach. Every lead goes through all steps:

```
Step 1 → Connection sent (with note if quota allows, without note if limit hit)
Step 2 → They accept → DM fires within 3 hours (automated)
Step 3 → They reply → Mustafa follows up manually to book call
```

Never skip steps. Never send a generic blast.

## MESSENGER DM TEMPLATE (after accept)

Pull name, role, company from lead queue JSON.
Reference website: https://fastechads.netlify.app/ (portfolio + free creative fatigue calculator)

```
Hey [First Name]! Thanks for connecting.

Noticed you're [role] at [Company] — [one specific observation about their brand/niche].

Built something you might find useful: a free Creative Fatigue Calculator that tells you when your Meta ads are burning out before CPAs spike — fastechads.netlify.app

We also help DTC brands produce scroll-stopping video ads overnight through our Overnight Engine. Brief in at night, finished ad by morning.

Happy to chat if you're ever looking to move faster on creative.

— Mustafa
```

---

## WEEKLY RESET
- With-note limit resets weekly (Sunday midnight)
- Monthly custom note quota resets monthly
- Track in `memory/linkedin-log.md`

---

## FILES
- `leads/YYYY-MM-DD/connection-log.json` — daily lead queue
- `memory/linkedin-log.md` — run history and weekly counts
- `agents/scout-agent.md` — Scout instructions
- `agents/manager-agent.md` — Manager instructions
- `agents/connector-agent.md` — Connector instructions
- `agents/messenger-agent.md` — Messenger instructions

---

*Last updated: 2026-10-19*

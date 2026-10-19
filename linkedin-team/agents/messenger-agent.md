# MESSENGER AGENT
## LinkedIn Outreach Team — FASTECH.PAK

---

## ONE JOB
Monitor for new connection accepts. When someone accepts → send personalized DM within 24h. Fully automatic. Never wait for Mustafa to tell you.

---

## HOW ACCEPTANCE DETECTION WORKS

LinkedIn has no webhook. So this agent polls on a schedule.

**Polling flow (runs every 3 hours):**
1. Open LinkedIn → My Network → Manage → Sent invitations (Accepted tab)
   URL: linkedin.com/mynetwork/invitation-manager/?filter=accepted
2. Read the current accepted list (all names visible)
3. Compare to `memory/accepted-log.json` (all known accepts logged so far)
4. Any name NOT in the log = NEW accept → trigger DM immediately
5. For each new accept → look up their data in `leads/YYYY-MM-DD/connection-log.json`
6. Generate personalized DM using their role + company
7. Send the DM via LinkedIn messaging
8. Log to `memory/linkedin-log.md` and `memory/accepted-log.json`

---

## TRIGGER
Runs **every 3 hours** via scheduled task (e.g. 12AM, 3AM, 6AM, 9AM, 12PM, 3PM, 6PM, 9PM PKT).
Goal: DM fires within 3 hours of acceptance — not next morning.
Also run on demand: *"Jarvis, check LinkedIn accepts"*

---

## DM TEMPLATE

This is Step 2 of the outreach sequence:
- Step 1: Connection sent (with personalized note if quota allows, without note if limit hit)
- Step 2: They accept → THIS DM fires within 3 hours

Pull their name, role, and company from `leads/YYYY-MM-DD/connection-log.json`.
Also reference the website: https://fastechads.netlify.app/ — has portfolio + free creative fatigue calculator.

**Template:**
```
Hey [First Name]! Thanks for connecting.

Noticed you're [their role] at [Company] — [one specific observation about their brand/niche/scale].

Built something you might find useful: a free Creative Fatigue Calculator that tells you when your Meta ads are burning out before CPAs spike — fastechads.netlify.app

We also help DTC brands produce scroll-stopping video ads overnight through our Overnight Engine. Brief in at night, finished ad by morning.

Happy to chat if you're ever looking to move faster on creative.

— Mustafa
```

**Personalization rules:**
- First name only
- Pull role + company from lead queue JSON — never generic
- One specific observation: supplement brand → "competitive space for paid creative," fashion DTC → "creative volume is everything at your stage," CMO → "you're probably testing 10+ creatives a week"
- Lead with the free tool — value first, pitch second
- Keep under 300 characters per message block (LinkedIn DM limit awareness)
- Never sound templated

**Example — CMO at supplement brand:**
```
Hey Gytis! Thanks for connecting.

Noticed Bioma Health is scaling hard — supplement DTC is one of the most creative-heavy spaces on Meta right now.

Built something useful: a free Creative Fatigue Calculator that flags when your ads are burning out before CPAs spike — fastechads.netlify.app

We help brands like yours produce high-converting video ads overnight. Brief in at night, finished ad by morning.

Worth a quick chat?

— Mustafa
```

---

## ACCEPTED LOG FILE

Location: `memory/accepted-log.json`

Format:
```json
[
  {
    "name": "Gytis Vainilavicius",
    "linkedin_url": "https://linkedin.com/in/gytis-vainilavicius/",
    "accepted_date": "2026-10-20",
    "dm_sent": false,
    "dm_date": null,
    "dm_text": null
  }
]
```

Update `dm_sent: true` and `dm_date` after DM is sent.

---

## LOGGING

After every run, append to `memory/linkedin-log.md`:
```
[YYYY-MM-DD HH:MM PKT] | Messenger | Checked accepts | X new accepts found | DMs sent: [names] | Pending DMs: [names]
```

---

## ERROR HANDLING

- **No new accepts** → Log "0 new accepts" and exit. Normal.
- **DM send fails** → Mark `dm_sent: false`, flag in log, retry next day
- **Can't find lead data** → Use generic DM template with just their name + role
- **LinkedIn rate limits DM** → Stop, log, retry next day

---

*Part of JARVIS LinkedIn Team · Last updated: 2026-10-19*

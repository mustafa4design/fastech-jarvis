# MESSENGER AGENT
## LinkedIn Outreach Team — FASTECH.PAK

---

## ONE JOB
Monitor for new connection accepts. When someone accepts → send personalized DM within 24h. Fully automatic. Never wait for Mustafa to tell you.

---

## HOW ACCEPTANCE DETECTION WORKS

LinkedIn has no webhook. So this agent polls on a schedule.

**Daily flow:**
1. Open LinkedIn → My Network → Manage → Sent invitations (Accepted tab)
2. Read the current accepted list
3. Compare to `memory/accepted-log.json` (yesterday's known accepts)
4. Any NEW name in the accepted list = they just accepted
5. For each new accept → look up their data in `leads/YYYY-MM-DD/connection-log.json`
6. Generate personalized DM using their role + company
7. Send the DM via LinkedIn messaging
8. Log to `memory/linkedin-log.md` and `memory/accepted-log.json`

---

## TRIGGER
Run daily at **10:00 AM PKT** via scheduled task.
Also run on demand: *"Jarvis, check LinkedIn accepts"*

---

## DM TEMPLATE

Personalize based on their role and company from the lead queue file.

```
Hey [First Name]! Thanks for connecting.

I noticed [specific thing — their brand/recent post/product/niche].

We help DTC brands like [similar brand or just "yours"] turn their products into scroll-stopping video content that converts — through our Overnight Engine system.

Would it make sense to hop on a quick 15-min call this week?

— Mustafa
```

**Personalization rules:**
- Use their first name only
- Reference something SPECIFIC — their company, product category, or a recent post if visible
- Keep under 300 words
- Never sound like a template (even though it is one)
- Don't pitch immediately — open a conversation first

**Example for CMO at a supplement brand:**
```
Hey Gytis! Thanks for connecting.

Noticed Bioma Health is scaling hard — supplement DTC brands are one of the most competitive spaces for paid creative right now.

We help brands like yours turn product demos and testimonials into high-converting Meta ads overnight — literally. Brief in at night, finished ad by morning.

Worth a quick 15-min call to see if it's a fit?

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

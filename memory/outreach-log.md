# Outreach Worker — Permanent Memory
*Appended after every pipeline run. Never overwritten.*

---

[2026-10-06 08:23 PKT] | Worker | Phase 1-6 complete | 25 leads scraped (C1: 13 after filter, C2: 36 after filter, C3: 51 after filter -> 9+6+2=17 passed full Phase 2-3 enrichment) | 3 emails drafted (1 GREEN, 2 YELLOW) via Firecrawl | 0 emails sent (sending disabled this phase per instructions) | 14 skipped (RED - no email/no name found) | 2 errors (C1 LinkedIn Jobs source blocked - needs Apify console approval; C4 pre-scrape file missing for today) | Files: Outreach Team/leads/2026-10-06/filtered-leads.json, Outreach Team/leads/2026-10-06/final-leads.json

NOTES:
- Apify account was already at $3.97/$5.00 (79%) of its monthly usage cap BEFORE this run started, leaving only ~$1.03 of headroom for the entire C1+C2+C3 scrape. Flagged to #outreach-errors before scraping. C1 itself used only ~$0.03 of its $1.00 cap (LinkedIn Jobs source blocked, Indeed-only); total Apify spend this run ~$0.33, well within the shared headroom.
- C1 LinkedIn Jobs (harvestapi/linkedin-job-search) blocked with HTTP 403 full-permission-actor-not-approved. Continued with Indeed only per spec. Needs manual approval at https://console.apify.com/actors/zn01OAlzP853oqn4Z?approvePermissions=true
- C4 Google Maps pre-scrape file missing for 2026-10-06 (Mustafa's PC/Docker likely off). Skipped C4 entirely, continued with C1-C3.
- C2 LinkedIn profile search (Short mode) returns no personal website field at all, so every LinkedIn-sourced C2 lead failed the universal "no website" filter. All 6 kept C2 leads came from Instagram instead.
- Phase 3a (vulnv/linkedin-email-finder) run for the 2 RED C3 leads with /in/ profile URLs (Arun Kirupa, Rob Marston) - found no emails for either.
- GREEN row (Johnny Davis) verified to have non-empty column S before finishing, per the mandatory pre-finish check.

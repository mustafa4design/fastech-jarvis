# Campaign 1 (Hiring Signal) — 2026-10-07 Run Summary

## Source status
- LinkedIn Jobs (harvestapi/linkedin-job-search): BLOCKED — HTTP 403 full-permission-actor-not-approved. Needs approval at https://console.apify.com/actors/zn01OAlzP853oqn4Z?approvePermissions=true
- Indeed (valig/indeed-jobs-scraper): OK — 8 calls (video editor / content manager / social media manager / YouTube editor × US/UK), 1 call failed (content manager UK, transient Apify error)

## Pipeline counts
- Raw Indeed items scraped: 161
- Passed title/location/size filters: 22 (dropped: 127 title mismatch, 4 too-big-employer, 8 dupes)
- Had a named employer (website resolvable): 14
- Confirmed real company website (non-competitor, ≤200 employees): 7
- Dropped at this stage: Council on Foreign Relations (too big), Kepler Interactive (too big, multi-studio), trollco inc (unverifiable identity), NRG Digital (unverifiable identity), Idea2result (competitor — video production co.), vdyo (competitor — video production co.), COLAB (no verifiable website)

## Final 7 leads enriched via Firecrawl
| Company | Website | Status | Notes |
|---|---|---|---|
| BlueTuskr | bluetuskr.com | RED | Only info@ found, no decision-maker name — skipped per no-name rule |
| Lifeblood Consultancy Limited | wearelifeblood.com | RED | No email found on site |
| Reform UK | reformparty.uk | RED | No email found on site |
| HT Physio | ht-physio.co.uk | RED | No email found on site |
| Kisaco Research | kisacoresearch.com | RED | No email found on site |
| Curate Group | curategroup.co.uk | RED | Only hello@ found, no decision-maker name — skipped per no-name rule |
| 650NED & Super Owners Society | 650ned.co.uk | RED | No email found on site |

**Result: 0 GREEN, 0 YELLOW, 7 RED. No emails drafted or sent today.**

## Campaigns 2 & 3 — SKIPPED
Apify monthly budget was at $4.29/$5.00 (FREE plan) before this run started. C2 (Personal Brand)
and C3 (DTC Ads) actors have no hard per-call cost cap in their config, so running them risked
exhausting the account's entire monthly quota and blocking C1-C4 for the rest of the cycle
(resets 2026-10-29). Flagged to #outreach-errors; skipped both campaigns this run.

## Campaign 4 — SKIPPED
Pre-scrape file missing for 2026-10-07 (Mustafa's PC/Docker likely off at 7:30 AM PKT). Flagged to #outreach-errors.

## Apify spend this run
~$0.01 total (8 Indeed calls, each capped at $0.05 max). Monthly usage after run: ~$4.30/$5.00.

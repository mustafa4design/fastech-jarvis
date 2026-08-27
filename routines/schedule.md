# Claude Routines — JARVIS Automation Schedule
*Set these up in Claude Code to run the content pipeline automatically.*

---

## HOW TO CREATE A CLAUDE ROUTINE

In Claude Code terminal, use the `/schedule` skill or run:
```
/schedule
```

Or tell Jarvis: "Set up the 4 JARVIS routines from routines/schedule.md"

---

## ROUTINE 01 — WEEKLY RESEARCH

**Name:** `jarvis-weekly-research`
**Schedule:** Every Monday at 1:00 AM UTC (= 6:00 AM PKT)
**Cron:** `0 1 * * 1`

**Prompt to run:**
```
You are the Researcher agent for Mustafa Ghauri's JARVIS content system. 

Run a full research cycle:
1. Read brand/mustafa-brand-voice.md for context
2. Search the web for trending content in: AI tools, agency/founder content, video editing, personal branding (last 7 days)
3. Find top 5 viral trends, 10 competitor hooks, 3 content gaps
4. Write findings to research/weekly-trends.md, research/competitor-hooks.md, research/opportunity-list.md
5. Use the format defined in .claude/agents/researcher.md

After completing, post summary to Slack #research channel (if connected).
```

---

## ROUTINE 02 — WEEKLY PLANNING

**Name:** `jarvis-weekly-planning`
**Schedule:** Every Monday at 2:00 AM UTC (= 7:00 AM PKT)
**Cron:** `0 2 * * 1`

**Prompt to run:**
```
You are the Manager agent for Mustafa Ghauri's JARVIS content system.

Create the weekly content plan:
1. Read analytics/weekly-report.md (last week's performance)
2. Read research/weekly-trends.md, research/opportunity-list.md (just populated by Researcher)
3. Plan 6-7 posts for the week across Instagram and LinkedIn
4. Follow the sequencing rules in .claude/agents/manager.md
5. Write the plan to plan/weekly-content-plan.md
6. Brief the Hook Writer with topic assignments

Post weekly plan summary to Slack #jarvis-hq (if connected).
```

---

## ROUTINE 03 — DAILY CONTENT PRODUCTION

**Name:** `jarvis-daily-content`
**Schedule:** Mon–Sat at 3:00 AM UTC (= 8:00 AM PKT)
**Cron:** `0 3 * * 1-6`

**Prompt to run:**
```
You are the JARVIS content pipeline coordinator for Mustafa Ghauri.

Run today's content production:
1. Read plan/weekly-content-plan.md to find today's assigned posts
2. Check scripts/hooks-this-week.md — if today's hooks are missing, run Hook Writer first
3. Hook Writer: write 10 hooks per topic → filter to 3 → pick 1 final (save to scripts/hooks-this-week.md)
4. Script Writer: write full post copy using final hooks → save to scripts/posts-ready/
5. Designer: write design briefs for today's posts → save to design/briefs/
6. Publisher: format and stage today's posts in Buffer → notify #publishing for approval

Stop after staging. Do not publish. Human approval required.
Report completion to Slack #jarvis-hq.
```

---

## ROUTINE 04 — WEEKLY ANALYTICS

**Name:** `jarvis-weekly-analytics`
**Schedule:** Every Sunday at 3:00 PM UTC (= 8:00 PM PKT)
**Cron:** `0 15 * * 0`

**Prompt to run:**
```
You are the Analyst agent for Mustafa Ghauri's JARVIS content system.

Run the weekly analytics report:
1. Pull this week's performance data from Buffer (via Buffer MCP if connected)
2. Read the previous analytics/weekly-report.md for comparison
3. Calculate engagement rates, saves, reposts, and follower changes
4. Identify winning hook format and content pillar
5. Write the full report to analytics/weekly-report.md using format in .claude/agents/analyst.md
6. Append recommendations to research/opportunity-list.md

Post report summary to Slack #analytics channel (if connected).
```

---

## HOW TO SET UP WITH /schedule SKILL

Tell Jarvis:
> "Set up these 4 Claude Routines: jarvis-weekly-research (Monday 6AM PKT), jarvis-weekly-planning (Monday 7AM PKT), jarvis-daily-content (Mon-Sat 8AM PKT), jarvis-weekly-analytics (Sunday 8PM PKT). Use the prompts in routines/schedule.md."

Or use `/schedule` in Claude Code and configure each routine manually.

---

## TIMEZONE REFERENCE

PKT (Pakistan Standard Time) = UTC+5

| PKT Time | UTC Time |
|---|---|
| 6:00 AM PKT | 1:00 AM UTC |
| 7:00 AM PKT | 2:00 AM UTC |
| 8:00 AM PKT | 3:00 AM UTC |
| 8:00 PM PKT | 3:00 PM UTC |

All routines use UTC in cron format. The times above are already converted.

---

## MANUAL OVERRIDE COMMANDS

At any time, Mustafa can say:
- "Jarvis, run research" → triggers Routine 01 immediately
- "Jarvis, write me a post about [topic]" → triggers production pipeline for one post
- "Jarvis, pull analytics" → triggers Routine 04 immediately
- "Jarvis, what's the plan today?" → Manager reads the weekly plan and reports status

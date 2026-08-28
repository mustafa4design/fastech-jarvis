require("dotenv").config();
const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");

// Catch all unhandled errors — surface them in Railway logs instead of silent crash
process.on("uncaughtException", (error) => {
  console.error("[JARVIS] Uncaught exception:", error.message);
  console.error(error.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[JARVIS] Unhandled rejection:", reason);
  process.exit(1);
});

// Validate required env vars before doing anything else
const REQUIRED_ENV = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "ANTHROPIC_API_KEY"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[JARVIS] Missing required env vars: ${missing.join(", ")}`);
  console.error("Set these in Railway → Variables tab and redeploy.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ─── GitHub raw file fetcher ───────────────────────────────────────────────
const REPO_RAW = "https://raw.githubusercontent.com/mustafa4design/fastech-jarvis/main";

function fetchRaw(path) {
  return new Promise((resolve) => {
    const url = `${REPO_RAW}/${path}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          resolve(`[unavailable — ${res.statusCode}]`);
        }
      });
    }).on("error", () => resolve("[fetch error]"));
  });
}

// Fetch all 5 live files and build the dynamic system prompt
async function buildSystemPrompt() {
  const [weeklyPlan, brandVoice, claudeMd, jarvisLog, sharedContext] = await Promise.all([
    fetchRaw("plan/weekly-content-plan.md"),
    fetchRaw("brand/mustafa-brand-voice.md"),
    fetchRaw("CLAUDE.md"),
    fetchRaw("memory/jarvis-log.md"),
    fetchRaw(".claude/agents/shared-context.md"),
  ]);

  return `You are the JARVIS Manager bot — the real-time Slack interface for Mustafa Ghauri's personal brand content system at FASTECH.PAK.

You have been given the LIVE state of the entire system. Every file below was fetched fresh from GitHub seconds ago. Use this — not memory — when answering.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHO YOU SERVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Mustafa Ghauri — Founder & CEO of FASTECH.PAK. CS student IoBM. Building Multiplayer AI. ADHD — SHORT responses. One idea per line. No filler.
- Hafsa Sohail — Social Media Manager. Reviews and stages content in Buffer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROUTINE SCHEDULE — WHAT RUNS AUTOMATICALLY (all times PKT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Monday 6AM    → Researcher scans trends → posts to #research
Monday 7AM    → Manager agent plans week → posts plan to #jarvis-hq
Mon + Tue 8AM → Hook Writer + Script Writer + Designer write all content → posts to #scripts + #design
Wednesday 7AM → Publisher delivers full week batch to Slack #scripts in one message
Thu–Fri       → Hafsa stages all posts in Buffer
Sat 8PM       → Analyst reviews performance → posts report to #analytics

CRITICAL ROUTINE RULE:
Never duplicate work the routines do automatically.
If someone asks you to do something a routine will handle — tell them clearly:
"[Agent] runs automatically at [time] PKT. I'll let the routine handle it. Check [#channel] [when]. Say URGENT if you need it now."
Only bypass routines and do it immediately if the user says "URGENT".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PIPELINE STATUS — ALWAYS REPORT THIS WHEN ASKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When anyone asks about status, pipeline, or "what's happening" — answer using the live data below:
- What has been completed (check shared-context.md + jarvis-log.md)
- What is running now or next (check the routine schedule above + current day/time)
- When the next milestone lands (e.g., "Publisher delivers Wednesday 7AM PKT")
Be specific. Use data from the live files. Don't guess.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URGENT CHANGE PROTOCOL — after Wednesday batch is already delivered
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If Mustafa or Hafsa requests URGENT changes to a post that was already delivered:
1. Acknowledge: "Urgent change received. Running pipeline now."
2. Read the current plan (from the live plan below)
3. Run Hook Writer: write 10 hooks for the revised topic → pick 1 winner
4. Run Script Writer: write full revised post using the winning hook in Mustafa's voice
5. Run Designer: write updated visual brief + GPT image prompt
6. Post the revised post to #scripts with header: "🔴 URGENT REVISION — [Post title] — [Day/Date]"
7. Post update to #publishing: "Revised version ready. Please restage in Buffer."
Never shortcut this process. Every urgent revision goes through the full pipeline.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO RESPOND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Content request → produce it immediately using correct format from brand voice below
"What should I post today?" → check day of week against current plan below → write that post
Status request → give pipeline status using live data (shared-context + log + routine schedule)
Revision request (no URGENT) → check if routine will handle it → if yes, defer to routine with time
Revision request (URGENT) → follow the URGENT CHANGE PROTOCOL above
Plan question → answer from the live weekly plan below

Be concise. No filler. No repeating yourself. Output only what is needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE: WEEKLY CONTENT PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${weeklyPlan}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE: MUSTAFA'S BRAND VOICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${brandVoice}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE: SHARED AGENT CONTEXT (what each agent has done this week)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${sharedContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE: JARVIS LOG (last 50 entries — most recent activity)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${jarvisLog.split("\n").slice(-50).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE: SYSTEM RULES (CLAUDE.md — key sections)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${claudeMd.slice(0, 3000)}`;
}

// ─── Conversation history ──────────────────────────────────────────────────
const conversations = new Map();

// ─── Core handler — builds fresh system prompt, then calls Claude ──────────
async function handleMessage({ userMessage, historyKey, replyFn }) {
  if (!conversations.has(historyKey)) conversations.set(historyKey, []);
  const history = conversations.get(historyKey);
  history.push({ role: "user", content: userMessage });

  // Always fetch live context before responding
  let systemPrompt;
  try {
    systemPrompt = await buildSystemPrompt();
  } catch (err) {
    console.error("[JARVIS] Failed to fetch live context:", err.message);
    systemPrompt = "You are JARVIS Manager. Live context fetch failed — answer from memory only.";
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: systemPrompt,
    messages: history.slice(-10),
  });

  const reply = response.content[0].text;
  history.push({ role: "assistant", content: reply });
  await replyFn(reply);
}

// ─── @Manager mention in any channel ──────────────────────────────────────
app.event("app_mention", async ({ event, client, say }) => {
  const threadTs = event.thread_ts || event.ts;
  const channelId = event.channel;
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!userMessage) {
    await say({ text: "What do you need?", thread_ts: threadTs });
    return;
  }

  try {
    await client.reactions.add({ channel: channelId, timestamp: event.ts, name: "thinking_face" });
  } catch (_) {}

  try {
    await handleMessage({
      userMessage,
      historyKey: `${channelId}:${threadTs}`,
      replyFn: (text) => say({ text, thread_ts: threadTs }),
    });
  } catch (error) {
    console.error("[JARVIS] app_mention error:", error.message);
    try {
      await say({ text: `Error: ${error.message}`, thread_ts: threadTs });
    } catch (_) {}
  } finally {
    try {
      await client.reactions.remove({ channel: channelId, timestamp: event.ts, name: "thinking_face" });
    } catch (_) {}
  }
});

// ─── Direct messages — no @mention needed ─────────────────────────────────
app.message(async ({ message, say }) => {
  if (!message.channel || !message.channel.startsWith("D")) return;
  if (message.subtype) return;
  const userMessage = message.text?.trim();
  if (!userMessage) return;

  try {
    await handleMessage({
      userMessage,
      historyKey: `dm:${message.channel}`,
      replyFn: (text) => say(text),
    });
  } catch (error) {
    console.error("[JARVIS] DM error:", error.message);
    try {
      await say(`Error: ${error.message}`);
    } catch (_) {}
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    const port = process.env.PORT || 3000;
    await app.start(port);
    console.log(`[JARVIS] Manager bot running on port ${port} | Model: claude-sonnet-4-6 | Live context: ON`);
  } catch (error) {
    console.error("[JARVIS] Failed to start:", error.message);
    if (error.message.includes("token")) {
      console.error("→ Check SLACK_BOT_TOKEN and SLACK_APP_TOKEN in Railway Variables.");
    }
    process.exit(1);
  }
})();

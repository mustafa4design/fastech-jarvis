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

// ─── GitHub fetchers ───────────────────────────────────────────────────────
const REPO_RAW = "https://raw.githubusercontent.com/mustafa4design/fastech-jarvis/main";
const REPO_API = "https://api.github.com/repos/mustafa4design/fastech-jarvis/contents";

// Fetch a URL, following redirects, returning text or parsed JSON.
// Never throws — always resolves with a fallback on any error.
function fetchUrl(url, isJson, _redirectCount = 0) {
  return new Promise((resolve) => {
    if (_redirectCount > 5) {
      resolve(isJson ? null : "[too many redirects]");
      return;
    }
    const opts = { headers: { "User-Agent": "jarvis-manager-bot", "Accept": "application/vnd.github+json" } };
    https.get(url, opts, (res) => {
      // Follow redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume(); // drain the response
        resolve(fetchUrl(res.headers.location, isJson, _redirectCount + 1));
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          if (isJson) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              console.error(`[JARVIS] JSON parse error for ${url}:`, e.message, "| raw:", data.slice(0, 200));
              resolve(null);
            }
          } else {
            resolve(data);
          }
        } else {
          console.error(`[JARVIS] fetchUrl ${res.statusCode} for ${url} | body: ${data.slice(0, 200)}`);
          resolve(isJson ? null : `[unavailable — ${res.statusCode}]`);
        }
      });
      res.on("error", (e) => {
        console.error(`[JARVIS] response error for ${url}:`, e.message);
        resolve(isJson ? null : "[response error]");
      });
    }).on("error", (e) => {
      console.error(`[JARVIS] request error for ${url}:`, e.message);
      resolve(isJson ? null : "[fetch error]");
    });
  });
}

function fetchRaw(path) {
  return fetchUrl(`${REPO_RAW}/${path}`, false);
}

// List files in a repo folder via GitHub API and fetch each one's content.
// Pass exts (e.g. [".md"]) to restrict by extension; omit for all files.
async function fetchFolder(folderPath, exts) {
  const apiUrl = `${REPO_API}/${folderPath}`;
  const files = await fetchUrl(apiUrl, true);
  if (!Array.isArray(files)) {
    console.error(`[JARVIS] fetchFolder(${folderPath}): API did not return array, got:`, JSON.stringify(files)?.slice(0, 200));
    return "[folder listing failed — check Railway logs]";
  }
  if (files.length === 0) return "[folder is empty]";
  const filtered = files.filter((f) => {
    if (f.type !== "file") return false;
    if (exts && !exts.some((ext) => f.name.endsWith(ext))) return false;
    return true;
  });
  if (filtered.length === 0) return "[no matching files]";
  console.log(`[JARVIS] fetchFolder(${folderPath}): fetching ${filtered.length} file(s):`, filtered.map((f) => f.name).join(", "));
  const contents = await Promise.all(
    filtered.map((f) => fetchUrl(f.download_url, false).then((text) => `### ${f.name}\n${text}`))
  );
  return contents.join("\n\n---\n\n");
}

// Fetch all live context files and build the dynamic system prompt
async function buildSystemPrompt() {
  const [weeklyPlan, brandVoice, claudeMd, jarvisLog, sharedContext, postsReady, designBriefs, knowledgeDocs] = await Promise.all([
    fetchRaw("plan/weekly-content-plan.md"),
    fetchRaw("brand/mustafa-brand-voice.md"),
    fetchRaw("CLAUDE.md"),
    fetchRaw("memory/jarvis-log.md"),
    fetchRaw(".claude/agents/shared-context.md"),
    fetchFolder("scripts/posts-ready"),
    fetchFolder("design/briefs"),
    fetchFolder("knowledge", [".md"]),
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
LIVE: READY POSTS (scripts/posts-ready/)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${postsReady}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE: DESIGN BRIEFS (design/briefs/)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${designBriefs}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE: KNOWLEDGE BASE (knowledge/ — .md files only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${knowledgeDocs}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE: SYSTEM RULES (CLAUDE.md — key sections)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${claudeMd.slice(0, 3000)}`;
}

// ─── Slack channel IDs ────────────────────────────────────────────────────
const CHANNELS = {
  publishing:  "C0BSK7L8HEK",
  design:      "C0BT48UMWAY",
  scripts:     "C0BT48UPS0L",
  research:    "C0BSYL7QBAA",
  analytics:   "C0BSUB8R0GK",
  "jarvis-hq": "C0BT0HT1S74",
  general:     "C0BT0HUMAPL",
};

// ─── Tool definition — post_to_channel ───────────────────────────────────
const TOOLS = [
  {
    name: "post_to_channel",
    description:
      "Post a message to a specific JARVIS Slack channel. Use this when you need to notify a channel, deliver content to #scripts, flag something in #publishing, or route any message to the correct team channel.",
    input_schema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: Object.keys(CHANNELS),
          description: "The channel name to post to (e.g. 'scripts', 'publishing', 'design')",
        },
        message: {
          type: "string",
          description: "The full message text to post in that channel",
        },
      },
      required: ["channel", "message"],
    },
  },
];

// ─── Conversation history ─────────────────────────────────────────────────
const conversations = new Map();

// ─── Execute a tool call and return the result string ─────────────────────
async function executeTool(toolName, toolInput, slackClient) {
  if (toolName === "post_to_channel") {
    const { channel, message } = toolInput;
    const channelId = CHANNELS[channel];
    if (!channelId) return `Error: unknown channel "${channel}"`;
    try {
      await slackClient.chat.postMessage({ channel: channelId, text: message });
      console.log(`[JARVIS] Posted to #${channel} (${channelId})`);
      return `Posted successfully to #${channel}`;
    } catch (err) {
      console.error(`[JARVIS] post_to_channel error:`, err.message);
      return `Error posting to #${channel}: ${err.message}`;
    }
  }
  return `Error: unknown tool "${toolName}"`;
}

// ─── Core handler — agentic loop with tool use ───────────────────────────
async function handleMessage({ userMessage, historyKey, replyFn, slackClient }) {
  if (!conversations.has(historyKey)) conversations.set(historyKey, []);
  const history = conversations.get(historyKey);
  history.push({ role: "user", content: userMessage });

  let systemPrompt;
  try {
    systemPrompt = await buildSystemPrompt();
  } catch (err) {
    console.error("[JARVIS] Failed to fetch live context:", err.message);
    systemPrompt = "You are JARVIS Manager. Live context fetch failed — answer from memory only.";
  }

  // Agentic loop — keep going until Claude stops calling tools
  let finalReply = null;
  const loopMessages = [...history.slice(-10)];

  for (let turn = 0; turn < 5; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: systemPrompt,
      tools: TOOLS,
      messages: loopMessages,
    });

    // Collect any text blocks for the final reply
    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolBlocks = response.content.filter((b) => b.type === "tool_use");

    if (toolBlocks.length === 0) {
      // No tool calls — we're done
      finalReply = textBlocks.map((b) => b.text).join("\n").trim();
      break;
    }

    // Execute all tool calls in parallel
    loopMessages.push({ role: "assistant", content: response.content });
    const toolResults = await Promise.all(
      toolBlocks.map(async (block) => {
        const result = await executeTool(block.name, block.input, slackClient);
        return { type: "tool_result", tool_use_id: block.id, content: result };
      })
    );
    loopMessages.push({ role: "user", content: toolResults });

    // If there was text alongside the tool calls, capture it as a partial reply
    if (textBlocks.length > 0) {
      finalReply = textBlocks.map((b) => b.text).join("\n").trim();
    }

    if (response.stop_reason === "end_turn") break;
  }

  if (!finalReply) finalReply = "Done.";
  history.push({ role: "assistant", content: finalReply });
  await replyFn(finalReply);
}

// ─── @Manager mention in any channel ─────────────────────────────────────
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
      slackClient: client,
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

// ─── Direct messages — no @mention needed ────────────────────────────────
app.message(async ({ message, say, client }) => {
  if (!message.channel || !message.channel.startsWith("D")) return;
  if (message.subtype) return;
  const userMessage = message.text?.trim();
  if (!userMessage) return;

  try {
    await handleMessage({
      userMessage,
      historyKey: `dm:${message.channel}`,
      replyFn: (text) => say(text),
      slackClient: client,
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

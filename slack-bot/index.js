require("dotenv").config();
const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");
const { google } = require("googleapis");

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
TOOLS YOU CAN USE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
create_drive_doc — creates one Google Doc per post inside:
  Drive → FASTECH-JARVIS → Weekly-Content → Week-of-[label]
  Call once per post. Returns the Drive URL.

post_to_channel — posts a message to any JARVIS Slack channel by name.

WEEKLY BATCH DELIVERY WORKFLOW (Wednesday 7AM PKT):
1. For every post in the week's plan, call create_drive_doc with:
   - week_label: e.g. "Sep-01-2026"
   - doc_title: "[Date] · [Platform] · [Post-NN] · [Topic]"
   - post_caption: full caption from scripts/posts-ready/
   - design_brief: full brief from design/briefs/
   - gpt_image_prompt: ready-to-paste image generation prompt
   - buffer_instructions: platform + scheduled time PKT
2. Collect ALL Drive URLs returned from each create_drive_doc call.
3. Call post_to_channel(channel: "publishing") with ONE clean summary:
   📦 WEEK OF [dates] — CONTENT BATCH READY
   ━━━━━━━━━━━━━━━━━━━
   Mon Sep 01 · LinkedIn · Post-01
   [Drive URL]
   Wed Sep 03 · Instagram · Post-02
   [Drive URL]
   ...
   ━━━━━━━━━━━━━━━━━━━
   All posts staged and ready for Buffer. Tag @Hafsa to begin staging.
4. Reply in the original thread: "Batch delivered. [N] docs created in Drive. Summary posted to #publishing."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO RESPOND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Content request → produce it immediately using correct format from brand voice below
"What should I post today?" → check day of week against current plan below → write that post
Status request → give pipeline status using live data (shared-context + log + routine schedule)
Revision request (no URGENT) → check if routine will handle it → if yes, defer to routine with time
Revision request (URGENT) → follow the URGENT CHANGE PROTOCOL above
Plan question → answer from the live weekly plan below
"Deliver batch" / "post to Drive" → follow WEEKLY BATCH DELIVERY WORKFLOW above

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

// ─── Google auth (shared by Drive + Docs clients) ────────────────────────
function getGoogleAuth() {
  const hasSA    = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const hasOAuth = !!(process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  console.log(`[DRIVE] getGoogleAuth: service_account=${hasSA}, oauth=${hasOAuth}`);

  const SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
  ];

  if (hasSA) {
    let creds;
    try {
      creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      console.log(`[DRIVE] SA parsed — client_email: ${creds.client_email || "(missing)"}`);
    } catch (e) {
      console.error(`[DRIVE] SA JSON parse FAILED: ${e.message}`);
      return null;
    }
    return new google.auth.GoogleAuth({ credentials: creds, scopes: SCOPES });
  }

  if (hasOAuth) {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return auth;
  }

  console.error("[DRIVE] No credentials. Add GOOGLE_SERVICE_ACCOUNT_JSON to Railway Variables.");
  return null;
}

// Root folder owned by Mustafa's Google account — service account has Editor access.
// Files created inside this folder use Mustafa's storage quota, not the service account's.
const FASTECH_JARVIS_FOLDER_ID = "1QgQXhE3t6RGLOp30jbAvN5StNh2FqE8x";

// Find a subfolder by name inside a known parent, or create it there.
// Always scopes the search to parentId so nothing lands in the service account's own Drive.
async function findOrCreateFolder(drive, name, parentId) {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;

  console.log(`[DRIVE] findOrCreateFolder: searching for "${name}" inside ${parentId}`);
  let listRes;
  try {
    listRes = await drive.files.list({
      q,
      fields: "files(id, name)",
      spaces: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
  } catch (e) {
    const apiErr = e.response?.data || e.message;
    console.error(`[DRIVE] files.list FAILED for "${name}":`, JSON.stringify(apiErr));
    throw new Error(`Drive list error for "${name}": ${JSON.stringify(apiErr)}`);
  }

  if (listRes.data.files.length > 0) {
    const id = listRes.data.files[0].id;
    console.log(`[DRIVE] Found existing folder "${name}" → ${id}`);
    return id;
  }

  console.log(`[DRIVE] Creating folder "${name}" inside ${parentId}`);
  let createRes;
  try {
    createRes = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
      fields: "id",
      supportsAllDrives: true,
    });
  } catch (e) {
    const apiErr = e.response?.data || e.message;
    console.error(`[DRIVE] folder create FAILED for "${name}":`, JSON.stringify(apiErr));
    throw new Error(`Drive create error for "${name}": ${JSON.stringify(apiErr)}`);
  }
  console.log(`[DRIVE] Created folder "${name}" → ${createRes.data.id}`);
  return createRes.data.id;
}

// Build doc body as plain text for Docs API insertText.
function buildDocText({ postCaption, designBrief, gptImagePrompt, bufferInstructions }) {
  const section = (title, body) => `=== ${title} ===\n\n${body || "(none)"}\n\n`;
  return [
    section("POST CAPTION", postCaption),
    section("DESIGN BRIEF", designBrief),
    section("GPT IMAGE PROMPT", gptImagePrompt),
    section("BUFFER INSTRUCTIONS", bufferInstructions),
  ].join("---\n\n");
}

// Auto-generate a week label like "Sep-01-2026" from today's date.
function currentWeekLabel() {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  return `${months[now.getMonth()]}-${String(now.getDate()).padStart(2,"0")}-${now.getFullYear()}`;
}

// Create subfolders inside Mustafa's shared FASTECH-JARVIS folder, then write the doc via
// the Docs API (no file upload — avoids the Buffer/stream media-body error).
async function createDriveDoc({ weekLabel, docTitle, postCaption, designBrief, gptImagePrompt, bufferInstructions }) {
  const resolvedLabel = (weekLabel && weekLabel !== "undefined") ? weekLabel : currentWeekLabel();
  console.log(`[DRIVE] createDriveDoc START — "${docTitle}" | week: ${resolvedLabel}`);
  console.log(`[DRIVE] Root folder (Mustafa's): ${FASTECH_JARVIS_FOLDER_ID}`);

  const auth = getGoogleAuth();
  if (!auth) throw new Error("Google Drive not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON to Railway Variables.");

  const drive = google.drive({ version: "v3", auth });
  const docs  = google.docs({ version: "v1", auth });

  // Build folder hierarchy inside Mustafa's Drive.
  const weeklyId = await findOrCreateFolder(drive, "Weekly-Content", FASTECH_JARVIS_FOLDER_ID);
  const weekId   = await findOrCreateFolder(drive, `Week-of-${resolvedLabel}`, weeklyId);

  // Step 1 — create an empty Google Doc (lands in service account root by default).
  let docId;
  try {
    const createRes = await docs.documents.create({ requestBody: { title: docTitle } });
    docId = createRes.data.documentId;
    console.log(`[DRIVE] Doc created — id: ${docId}`);
  } catch (e) {
    const apiErr = e.response?.data || e.message;
    console.error(`[DRIVE] docs.create FAILED:`, JSON.stringify(apiErr));
    throw new Error(`Docs create error: ${JSON.stringify(apiErr)}`);
  }

  // Step 2 — move the doc into the correct week folder in Mustafa's Drive.
  try {
    const meta = await drive.files.get({ fileId: docId, fields: "parents" });
    const prevParents = (meta.data.parents || []).join(",");
    await drive.files.update({
      fileId: docId,
      addParents: weekId,
      removeParents: prevParents,
      supportsAllDrives: true,
      fields: "id, parents",
    });
    console.log(`[DRIVE] Doc moved to week folder: ${weekId}`);
  } catch (e) {
    const apiErr = e.response?.data || e.message;
    console.error(`[DRIVE] files.update (move) FAILED:`, JSON.stringify(apiErr));
    throw new Error(`Drive move error: ${JSON.stringify(apiErr)}`);
  }

  // Step 3 — insert content using Docs API (no media upload needed).
  const text = buildDocText({ postCaption, designBrief, gptImagePrompt, bufferInstructions });
  try {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text } }],
      },
    });
    console.log(`[DRIVE] Content inserted (${text.length} chars)`);
  } catch (e) {
    const apiErr = e.response?.data || e.message;
    console.error(`[DRIVE] batchUpdate FAILED:`, JSON.stringify(apiErr));
    throw new Error(`Docs batchUpdate error: ${JSON.stringify(apiErr)}`);
  }

  const url = `https://docs.google.com/document/d/${docId}/edit`;
  console.log(`[DRIVE] Doc ready — ${url}`);
  return url;
}

// ─── Tool definition — post_to_channel ───────────────────────────────────
const TOOLS = [
  {
    name: "create_drive_doc",
    description:
      "Create a Google Doc in Drive for a single post. Call once per post. Returns the Drive URL. After all docs are created, call post_to_channel to post the summary to #publishing.",
    input_schema: {
      type: "object",
      properties: {
        week_label: {
          type: "string",
          description: "Week label used for the folder name, e.g. 'Sep-01-2026'",
        },
        doc_title: {
          type: "string",
          description: "Exact doc name: '[Date] · [Platform] · [Post-NN] · [Topic]', e.g. 'Sep-01 · LinkedIn · Post-01 · AI Agency System'",
        },
        post_caption: {
          type: "string",
          description: "Full post caption / copy",
        },
        design_brief: {
          type: "string",
          description: "Full visual direction brief from the Designer agent",
        },
        gpt_image_prompt: {
          type: "string",
          description: "Ready-to-paste ChatGPT/Midjourney image generation prompt",
        },
        buffer_instructions: {
          type: "string",
          description: "Platform, scheduled date/time PKT, and any Buffer staging notes",
        },
      },
      required: ["week_label", "doc_title", "post_caption", "design_brief", "buffer_instructions"],
    },
  },
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
  if (toolName === "create_drive_doc") {
    const { week_label, doc_title, post_caption, design_brief, gpt_image_prompt, buffer_instructions } = toolInput;
    try {
      const url = await createDriveDoc({
        weekLabel: week_label,
        docTitle: doc_title,
        postCaption: post_caption,
        designBrief: design_brief,
        gptImagePrompt: gpt_image_prompt,
        bufferInstructions: buffer_instructions,
      });
      console.log(`[JARVIS] Drive doc created: ${doc_title} → ${url}`);
      return `Created: ${doc_title}\nURL: ${url}`;
    } catch (err) {
      console.error(`[JARVIS] create_drive_doc error:`, err.message);
      return `Error creating Drive doc "${doc_title}": ${err.message}`;
    }
  }

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

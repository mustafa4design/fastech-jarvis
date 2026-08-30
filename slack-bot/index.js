require("dotenv").config();
const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");
const { Readable } = require("stream");
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
    const headers = { "User-Agent": "jarvis-manager-bot", "Accept": "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    const opts = { headers };
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

// Known fallback files per folder — used when the GitHub API listing fails
// (rate-limit, auth error, or intermittent 403/404).
const FOLDER_FALLBACKS = {
  "scripts/posts-ready": [
    `${REPO_RAW}/scripts/posts-ready/post-01-linkedin.md`,
    `${REPO_RAW}/scripts/posts-ready/post-01-ig.md`,
  ],
};

// List files in a repo folder via GitHub API and fetch each one's content.
// Falls back to FOLDER_FALLBACKS direct URLs if the API listing fails.
// Pass exts (e.g. [".md"]) to restrict by extension; omit for all files.
async function fetchFolder(folderPath, exts) {
  const apiUrl = `${REPO_API}/${folderPath}`;
  console.log(`[JARVIS] fetchFolder: listing ${apiUrl}`);
  const files = await fetchUrl(apiUrl, true);

  // If the API listing worked, fetch each file normally.
  if (Array.isArray(files) && files.length > 0) {
    const filtered = files.filter((f) => {
      if (f.type !== "file") return false;
      if (exts && !exts.some((ext) => f.name.endsWith(ext))) return false;
      return true;
    });
    if (filtered.length === 0) {
      console.log(`[JARVIS] fetchFolder(${folderPath}): no matching files after extension filter`);
      return "[no matching files]";
    }
    console.log(`[JARVIS] fetchFolder(${folderPath}): fetching ${filtered.length} file(s):`, filtered.map((f) => f.name).join(", "));
    const contents = await Promise.all(
      filtered.map(async (f) => {
        const text = await fetchUrl(f.download_url, false);
        console.log(`[JARVIS]   ${f.name}: ${text.length} chars fetched`);
        return `### ${f.name}\n${text}`;
      })
    );
    const result = contents.join("\n\n---\n\n");
    console.log(`[JARVIS] fetchFolder(${folderPath}): total content ${result.length} chars`);
    return result;
  }

  // API listing failed — log why and try fallback URLs.
  console.error(`[JARVIS] fetchFolder(${folderPath}): API listing failed (got ${JSON.stringify(files)?.slice(0, 200)})`);
  const fallbackUrls = FOLDER_FALLBACKS[folderPath];
  if (!fallbackUrls) {
    console.error(`[JARVIS] fetchFolder(${folderPath}): no fallback URLs configured`);
    return "[folder listing failed — no fallback configured]";
  }

  console.log(`[JARVIS] fetchFolder(${folderPath}): trying ${fallbackUrls.length} fallback URL(s)`);
  const fallbackContents = await Promise.all(
    fallbackUrls.map(async (url) => {
      const filename = url.split("/").pop();
      const text = await fetchUrl(url, false);
      console.log(`[JARVIS]   fallback ${filename}: ${text.length} chars`);
      if (text.startsWith("[") && text.endsWith("]")) return null; // error sentinel
      return `### ${filename}\n${text}`;
    })
  );
  const valid = fallbackContents.filter(Boolean);
  if (valid.length === 0) {
    console.error(`[JARVIS] fetchFolder(${folderPath}): all fallback fetches failed`);
    return "[folder listing failed — fallback also failed]";
  }
  const result = valid.join("\n\n---\n\n");
  console.log(`[JARVIS] fetchFolder(${folderPath}): fallback OK — ${result.length} chars from ${valid.length} file(s)`);
  return result;
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
    "https://www.googleapis.com/auth/drive.file",
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

// Create subfolders inside Mustafa's shared FASTECH-JARVIS folder and upload the doc
// using Drive API only (no Docs API — avoids PERMISSION_DENIED on service accounts).
// Plain text is uploaded as media; Drive auto-converts it to Google Docs format.
async function createDriveDoc({ weekLabel, docTitle, postCaption, designBrief, gptImagePrompt, bufferInstructions }) {
  const resolvedLabel = (weekLabel && weekLabel !== "undefined") ? weekLabel : currentWeekLabel();
  console.log(`[DRIVE] createDriveDoc START — "${docTitle}" | week: ${resolvedLabel}`);
  console.log(`[DRIVE] Root folder (Mustafa's): ${FASTECH_JARVIS_FOLDER_ID}`);

  const auth = getGoogleAuth();
  if (!auth) throw new Error("Google Drive not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON to Railway Variables.");

  const drive = google.drive({ version: "v3", auth });

  // Build folder hierarchy inside Mustafa's Drive.
  const weeklyId = await findOrCreateFolder(drive, "Weekly-Content", FASTECH_JARVIS_FOLDER_ID);
  const weekId   = await findOrCreateFolder(drive, `Week-of-${resolvedLabel}`, weeklyId);

  const text = buildDocText({ postCaption, designBrief, gptImagePrompt, bufferInstructions });
  console.log(`[DRIVE] Content ready (${text.length} chars). Creating doc in folder: ${weekId}`);

  let file;
  try {
    file = await drive.files.create({
      requestBody: {
        name: docTitle,
        mimeType: "application/vnd.google-apps.document",
        parents: [weekId],
      },
      media: {
        mimeType: "text/plain",
        body: Readable.from([text]),   // Readable stream — .pipe() exists, no Buffer error
      },
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });
  } catch (e) {
    const apiErr = e.response?.data || e.message;
    console.error(`[DRIVE] files.create FAILED — parent folder was: ${weekId}`);
    console.error(`[DRIVE] Google API error:`, JSON.stringify(apiErr));
    throw new Error(`Drive doc create error: ${JSON.stringify(apiErr)}`);
  }

  const url = file.data.webViewLink;
  console.log(`[DRIVE] Doc created OK — id: ${file.data.id} | url: ${url}`);
  return url;
}

// ─── Auto-build the #publishing message from GitHub content ──────────────
// Called when post_to_channel(channel:"publishing") fires — the bot fetches
// and formats the content itself so Claude never has to pass it as a parameter.
async function buildPublishingMessage(driveLinks = [], note = "") {
  console.log("[JARVIS] buildPublishingMessage: fetching posts-ready + design/briefs from GitHub");

  const [postsReady, designBriefs] = await Promise.all([
    fetchFolder("scripts/posts-ready"),
    fetchFolder("design/briefs"),
  ]);

  console.log(`[JARVIS] buildPublishingMessage: postsReady=${postsReady.length} chars, designBriefs=${designBriefs.length} chars`);

  const now = new Date();
  const weekLabel = currentWeekLabel();

  let msg = `📦 *WEEK OF ${weekLabel} — CONTENT BATCH READY*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (note) msg += `📝 ${note}\n\n`;

  if (driveLinks.length > 0) {
    msg += `*🗂 GOOGLE DRIVE DOCS*\n`;
    driveLinks.forEach(({ title, url }) => {
      msg += `• <${url}|${title}>\n`;
    });
    msg += `\n`;
  }

  msg += `*📄 SCRIPTS (scripts/posts-ready/)*\n`;
  if (!postsReady.startsWith("[")) {
    msg += `\`\`\`${postsReady.slice(0, 2800)}\`\`\`\n\n`;
  } else {
    msg += `_(${postsReady})_\n\n`;
  }

  msg += `*🎨 DESIGN BRIEFS (design/briefs/)*\n`;
  if (!designBriefs.startsWith("[")) {
    msg += `\`\`\`${designBriefs.slice(0, 2800)}\`\`\`\n\n`;
  } else {
    msg += `_(${designBriefs})_\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✅ *Awaiting Mustafa / Hafsa approval before anything goes live.*`;

  console.log(`[JARVIS] buildPublishingMessage: final message ${msg.length} chars`);
  return msg;
}

// ─── Tool definitions ─────────────────────────────────────────────────────
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
      "Post a message to a JARVIS Slack channel. For channel='publishing': the bot automatically fetches scripts/posts-ready/ and design/briefs/ from GitHub and formats the full batch delivery message — do NOT pass a message parameter, just pass the channel name and any drive_links collected from create_drive_doc calls. For all other channels: pass the message text you want to send.",
    input_schema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: Object.keys(CHANNELS),
          description: "The channel name to post to",
        },
        message: {
          type: "string",
          description: "Message text — required for non-publishing channels. Omit for channel='publishing' (content is auto-fetched from GitHub).",
        },
        drive_links: {
          type: "array",
          description: "For channel='publishing' only: array of Drive docs created this session. Each item: { title: string, url: string }.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
            },
            required: ["title", "url"],
          },
        },
        note: {
          type: "string",
          description: "For channel='publishing' only: optional short note to prepend to the batch message.",
        },
      },
      required: ["channel"],
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
    const { channel, message, drive_links, note } = toolInput;
    console.log(`[JARVIS] post_to_channel called — channel: "${channel}", has message: ${!!message}, drive_links: ${(drive_links || []).length}`);
    const channelId = CHANNELS[channel];
    if (!channelId) return `Error: unknown channel "${channel}"`;

    let text;
    if (channel === "publishing") {
      // Auto-build the full batch delivery message from GitHub — never rely on Claude passing text.
      console.log("[JARVIS] post_to_channel: publishing channel — auto-building message from GitHub");
      text = await buildPublishingMessage(drive_links || [], note || "");
    } else {
      text = message;
      console.log(`[JARVIS] post_to_channel message preview: "${String(text || "").slice(0, 200)}"`);
      if (!text) {
        console.error(`[JARVIS] post_to_channel: no message provided for #${channel}`);
        return `Error: message is required for #${channel}`;
      }
    }

    try {
      await slackClient.chat.postMessage({ channel: channelId, text });
      console.log(`[JARVIS] Posted to #${channel} (${channelId}) — ${text.length} chars`);
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

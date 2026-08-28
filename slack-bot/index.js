require("dotenv").config();
const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");

// API key loaded from environment variable — never hardcode
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const JARVIS_SYSTEM_PROMPT = `You are the JARVIS Manager — the operations brain of Mustafa Ghauri's personal brand content system at FASTECH.PAK.

WHO YOU SERVE:
- Mustafa Ghauri — Founder & CEO of FASTECH.PAK (video editing agency, Karachi, Pakistan). CS student at IoBM. Building Multiplayer AI. ADHD — keep ALL responses SHORT. One idea per line. No filler.
- Hafsa Sohail — Social Media Manager. Reviews and stages content in Buffer.

PLATFORM: LinkedIn ONLY right now. Instagram is NOT in scope. Do not plan or produce IG content.

YOUR 7 AGENTS:
🔵 Researcher — scans trends every Monday 6AM PKT → posts in #research
🟠 Hook Writer — writes 10 hooks per post, picks 1 winner → posts in #scripts
🟡 Script Writer — writes full LinkedIn posts → posts in #scripts
🟣 Designer — writes design briefs + GPT image prompts → posts in #design
🟢 Analyst — reviews performance every Saturday 8PM PKT → posts in #analytics
🔴 Manager — plans week, coordinates all agents, monitors pipeline
🩵 Publisher — delivers full week batch to Slack every Wednesday 7AM PKT

WEEKLY SCHEDULE (all times PKT):
- Monday 6AM: Researcher scans
- Monday 7AM: Manager plans 5 LinkedIn posts
- Mon–Tue 8AM: Hook Writer + Script Writer + Designer produce all content
- Wednesday 7AM: Publisher delivers all 5 posts to Slack in one batch
- Thursday–Friday: Hafsa stages in Buffer
- Mon–Fri following week: posts go live from Buffer (after approval)
- Saturday 8PM: Analyst reviews performance

CONTENT PILLARS:
1. AI/editing tactics
2. Agency/systems thinking
3. Brand strategy frameworks
4. Build-in-public (Multiplayer AI, FASTECH wins/failures)

LINKEDIN POST FORMAT:
Hook (bold opener) → Scene (real moment) → Realization (turning point) → Reframe (the lesson) → Question (engage audience)
150–300 words. No hashtags. No links in body. White space between every paragraph.

VOICE RULES:
- Never say: genuinely, honestly, straightforward, game-changer, revolutionary
- English only. Short sentences. One idea per line.
- Confident. Direct. 20-year-old founder energy.

WHAT PERFORMS BEST:
- Personal story posts → highest LinkedIn engagement
- Before/after proof → highest reposts
- Bold Monday opinion → re-activates after any gap
- Hook format: Number + result → outperforms everything else

RESPONDING TO REQUESTS:
- Content requests: produce it immediately using correct LinkedIn format
- Status requests: give pipeline status clearly — which agent ran last, what's next
- Revision requests: show the revised version immediately
- "What should I post today?": check day of week, pick the right content type, produce it

Be concise. No filler. No repeating yourself. Output only what is needed.`;

// Track conversations per thread — max 10 messages each
const conversations = new Map();

// Handle @Manager mentions in any channel
app.event("app_mention", async ({ event, client, say }) => {
  const threadTs = event.thread_ts || event.ts;
  const channelId = event.channel;

  // Strip bot mention from message
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!userMessage) {
    await say({
      text: "What do you need? Give me a topic, ask for a status update, or request a post.",
      thread_ts: threadTs,
    });
    return;
  }

  // Thinking indicator
  try {
    await client.reactions.add({ channel: channelId, timestamp: event.ts, name: "thinking_face" });
  } catch (_) {}

  const historyKey = `${channelId}:${threadTs}`;
  if (!conversations.has(historyKey)) conversations.set(historyKey, []);
  const history = conversations.get(historyKey);
  history.push({ role: "user", content: userMessage });

  // Keep last 10 messages
  const trimmedHistory = history.slice(-10);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: JARVIS_SYSTEM_PROMPT,
      messages: trimmedHistory,
    });

    const reply = response.content[0].text;
    history.push({ role: "assistant", content: reply });

    await say({ text: reply, thread_ts: threadTs });

    try {
      await client.reactions.remove({ channel: channelId, timestamp: event.ts, name: "thinking_face" });
    } catch (_) {}
  } catch (error) {
    console.error("Claude API error:", error.message);
    await say({
      text: `Error: ${error.message}. Check ANTHROPIC_API_KEY in Railway env vars.`,
      thread_ts: threadTs,
    });
  }
});

// Handle direct messages — no @mention needed
app.message(async ({ message, say }) => {
  if (!message.channel.startsWith("D")) return;
  if (message.subtype) return;

  const userMessage = message.text?.trim();
  if (!userMessage) return;

  const historyKey = `dm:${message.channel}`;
  if (!conversations.has(historyKey)) conversations.set(historyKey, []);
  const history = conversations.get(historyKey);
  history.push({ role: "user", content: userMessage });

  const trimmedHistory = history.slice(-10);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: JARVIS_SYSTEM_PROMPT,
      messages: trimmedHistory,
    });

    const reply = response.content[0].text;
    history.push({ role: "assistant", content: reply });

    await say(reply);
  } catch (error) {
    console.error("Claude API error:", error.message);
    await say(`Error: ${error.message}. Check ANTHROPIC_API_KEY.`);
  }
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`JARVIS Manager bot running on port ${port} | Model: claude-sonnet-4-6`);
})();

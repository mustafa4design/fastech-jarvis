require("dotenv").config();
const { App } = require("@slack/bolt");
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const JARVIS_SYSTEM_PROMPT = `You are the JARVIS Manager — the operations brain of Mustafa Ghauri's personal brand content system at FASTECH.PAK. You run a team of 6 specialized AI subagents. You plan, delegate, and synthesize. You are the brain. The subagents are the hands.

WHO YOU SERVE:
- Primary Owner: Mustafa Ghauri — Founder & CEO of FASTECH.PAK (video editing & content production agency, Karachi, Pakistan). CS student at IoBM. Personal brand: @mustafaghauri._ on Instagram and LinkedIn. ADHD — keep all responses SHORT, punchy, one idea per beat.
- Secondary Access: Hafsa Sohail (Social Media Manager) — reviews and approves content.

CONTENT PILLARS (Mustafa's):
1. AI/editing tactics (how I use AI in my workflow)
2. Agency/systems thinking (how I run FASTECH)
3. Brand strategy frameworks (what I learned building brands)
4. Build-in-public (Multiplayer AI, FASTECH growth, wins + failures)

YOUR 6 SUBAGENTS:
- 🔵 Researcher — scans viral trends weekly, saves to research/
- 🟠 Hook Writer — writes 10 hooks per topic, picks 1 winner
- 🟡 Script Writer — writes full IG captions and LinkedIn posts
- 🟣 Designer — creates design briefs for Mustafa's personal brand IG posts ONLY
- 🟢 Analyst — tracks what performed, feeds insights back to team
- 🩵 Publisher — stages posts in Buffer queue (human approval always required)

PLATFORM RULES:
- Instagram: hook + value + CTA + 5-8 hashtags, short punchy lines
- LinkedIn: hook + scene + realization + reframe + question, no hashtags
- Posting times PKT: IG 6-9 PM, LinkedIn 8-10 AM
- Buffer is connected to Mustafa's PERSONAL accounts ONLY — NOT FASTECH company page
- NOTHING auto-publishes. Human approval required before every post goes live.

WEEKLY CONTENT RHYTHM:
- Instagram: 3-4 posts/week (1-2 carousels + 2 singles)
- LinkedIn: 2-3 posts/week (long-form narrative)
- Monday: Bold opinion or system post
- Wed/Thu: Value or proof post
- Fri/Sat: Personal story or build-in-public

VOICE RULES:
- Never say: "genuinely", "honestly", "straightforward", corporate speak, buzzwords
- English only
- Short sentences. One idea per line.
- Talk like a 20-year-old founder who figured something out.
- Confident. Direct. Raw.

WHAT PERFORMS BEST (from analytics history):
- Personal story posts → highest engagement
- Before/after proof posts → highest saves
- Bold opinion Monday posts → re-activate after gaps
- Hook format: Number + result → outperforms all others

When Mustafa or Hafsa asks you something, respond as the Manager. Brief. Decisive. No fluff. If they ask you to produce content, run the pipeline mentally and give them the output. If they ask for a status update, give it clearly. If they ask what to post today, check the weekly rhythm and give a recommendation.`;

// Track conversations per thread to maintain context
const conversations = new Map();

app.event("app_mention", async ({ event, client, say }) => {
  const threadTs = event.thread_ts || event.ts;
  const channelId = event.channel;

  // Strip the bot mention from the message text
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!userMessage) {
    await say({
      text: "What do you need? Tell me the topic, the platform, or ask for a status update.",
      thread_ts: threadTs,
    });
    return;
  }

  // Show typing indicator
  try {
    await client.reactions.add({ channel: channelId, timestamp: event.ts, name: "thinking_face" });
  } catch (_) {}

  // Build conversation history for this thread
  const historyKey = `${channelId}:${threadTs}`;
  if (!conversations.has(historyKey)) {
    conversations.set(historyKey, []);
  }
  const history = conversations.get(historyKey);
  history.push({ role: "user", content: userMessage });

  // Keep last 10 messages to avoid token bloat
  const trimmedHistory = history.slice(-10);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: JARVIS_SYSTEM_PROMPT,
      messages: trimmedHistory,
    });

    const reply = response.content[0].text;

    // Save assistant reply to history
    history.push({ role: "assistant", content: reply });

    await say({ text: reply, thread_ts: threadTs });

    // Remove thinking reaction
    try {
      await client.reactions.remove({ channel: channelId, timestamp: event.ts, name: "thinking_face" });
    } catch (_) {}
  } catch (error) {
    console.error("Claude API error:", error);
    await say({
      text: "Error reaching Claude API. Check ANTHROPIC_API_KEY and try again.",
      thread_ts: threadTs,
    });
  }
});

// Also respond to direct messages
app.message(async ({ message, say }) => {
  // Only handle DMs (channel starts with D)
  if (!message.channel.startsWith("D")) return;
  if (message.subtype) return; // skip bot messages, edits, etc.

  const userMessage = message.text?.trim();
  if (!userMessage) return;

  const historyKey = `dm:${message.channel}`;
  if (!conversations.has(historyKey)) {
    conversations.set(historyKey, []);
  }
  const history = conversations.get(historyKey);
  history.push({ role: "user", content: userMessage });

  const trimmedHistory = history.slice(-10);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: JARVIS_SYSTEM_PROMPT,
      messages: trimmedHistory,
    });

    const reply = response.content[0].text;
    history.push({ role: "assistant", content: reply });

    await say(reply);
  } catch (error) {
    console.error("Claude API error:", error);
    await say("Error reaching Claude API. Check ANTHROPIC_API_KEY.");
  }
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`JARVIS Manager bot running on port ${port}`);
})();

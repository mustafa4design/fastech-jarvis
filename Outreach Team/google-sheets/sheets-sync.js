/**
 * JARVIS Outreach Team — Google Sheets Sync
 *
 * AUTH: Uses Google Drive MCP (mcp__f1cfc621-749c-4208-83ff-0b99b978c2eb)
 * connected on claude.ai — no service account keyfile needed.
 *
 * Cloud routines call Drive MCP tools directly:
 *   read_file_content(file_id: SPREADSHEET_ID) — read sheet content
 *   update_file(file_id: SPREADSHEET_ID, content: CSV) — write/append rows
 *
 * Spreadsheet ID: 107hqHj-Q-8e1oph76wf0kew5xzs_gbnGMaOBcHLGCyE
 */

const SPREADSHEET_ID = "107hqHj-Q-8e1oph76wf0kew5xzs_gbnGMaOBcHLGCyE";

// 18-column schema — one row per lead
const COLUMNS = [
  "Lead ID",           // A
  "Business / Person Name", // B
  "Email Address",     // C
  "Website URL",       // D
  "Location",          // E
  "Timezone",          // F
  "Niche / What They Do", // G
  "Campaign",          // H — "1-Hiring" / "2-PersonalBrand" / "3-DTCAds"
  "Email Framework Used", // I
  "Email Sent?",       // J — Yes / No
  "Send Time (Local)", // K
  "Send Time (PKT)",   // L
  "Follow-up 1 Sent?", // M
  "Follow-up 2 Sent?", // N
  "Follow-up 3 Sent?", // O
  "Reply Received?",   // P
  "Status",            // Q — GREEN / RED / YELLOW / BLUE
  "Notes",             // R
];

// Status legend
// GREEN  = email sent successfully
// RED    = skipped (reason in Notes)
// YELLOW = Firecrawl failed, email sent with partial data
// BLUE   = lead replied

/**
 * Returns today's tab name — format "22-Sep-2026"
 */
function getTodayTabName(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Generates a lead ID — format "20260922-001"
 */
function generateLeadId(index, date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `${dateStr}-${String(index).padStart(3, "0")}`;
}

/**
 * Converts a lead object to an 18-element array for sheet row insertion.
 * Cloud agent uses this as a reference when calling Drive MCP update_file.
 */
function leadToRow(lead) {
  return [
    lead.lead_id || "",
    lead.name || "",
    lead.email || "",
    lead.website || "",
    lead.location || "",
    lead.timezone || "",
    lead.niche || "",
    lead.campaign || "",
    lead.email_framework || "",
    lead.email_sent ? "Yes" : "No",
    lead.send_time_local || "",
    lead.send_time_pkt || "",
    lead.followup1_sent ? "Yes" : "No",
    lead.followup2_sent ? "Yes" : "No",
    lead.followup3_sent ? "Yes" : "No",
    lead.reply_received ? "Yes" : "No",
    lead.status || "YELLOW",
    lead.notes || "",
  ];
}

module.exports = { SPREADSHEET_ID, COLUMNS, getTodayTabName, generateLeadId, leadToRow };

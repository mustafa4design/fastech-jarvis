/**
 * JARVIS Outreach Team — Google Sheets Sync
 * Logs every lead and email event to Google Sheets.
 * One tab per day, named by date (e.g. "20-Sep-2026").
 *
 * Requires: GOOGLE_SHEETS_SPREADSHEET_ID in environment
 * Auth: Google Service Account or OAuth2 via Drive MCP
 */

const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

// ─── Config ───────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

const COLUMNS = [
  "Lead ID",
  "Business / Person Name",
  "Email Address",
  "Website URL",
  "Location",
  "Timezone",
  "Niche / What They Do",
  "Campaign",
  "Email Framework Used",
  "Email Sent?",
  "Send Time (Local)",
  "Send Time (PKT)",
  "Follow-up 1 Sent?",
  "Follow-up 2 Sent?",
  "Follow-up 3 Sent?",
  "Reply Received?",
  "Status",
  "Notes",
];

const STATUS_COLORS = {
  GREEN: { red: 0.2, green: 0.8, blue: 0.2 },
  RED: { red: 0.9, green: 0.2, blue: 0.2 },
  YELLOW: { red: 1.0, green: 0.85, blue: 0.0 },
  BLUE: { red: 0.2, green: 0.4, blue: 0.9 },
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getAuth() {
  const keyFile = path.join(__dirname, "..", "..", "knowledge", "ai-agent-448422-12df43c44d67.json");

  if (fs.existsSync(keyFile)) {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    });
    return auth;
  }

  // Fallback: Application Default Credentials
  const auth = new google.auth.GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  return auth;
}

// ─── Sheet Tab Management ─────────────────────────────────────────────────────

/**
 * Get today's tab name in format "20-Sep-2026"
 */
function getTodayTabName(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Create today's tab if it doesn't exist, return its sheetId
 */
async function getOrCreateTodayTab(sheets, tabName) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  const existing = spreadsheet.data.sheets.find(
    (s) => s.properties.title === tabName
  );

  if (existing) {
    return existing.properties.sheetId;
  }

  // Create new tab
  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: { rowCount: 1000, columnCount: 18 },
            },
          },
        },
      ],
    },
  });

  const sheetId =
    response.data.replies[0].addSheet.properties.sheetId;

  // Write header row
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tabName}'!A1:R1`,
    valueInputOption: "RAW",
    resource: { values: [COLUMNS] },
  });

  // Bold header row
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 18,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
      ],
    },
  });

  return sheetId;
}

// ─── Lead Logging ─────────────────────────────────────────────────────────────

/**
 * Log a single lead row to today's sheet tab
 * @param {Object} lead - Lead object from enriched-leads.json
 */
async function logLead(lead) {
  if (!SPREADSHEET_ID) {
    console.error("[sheets-sync] ERROR: GOOGLE_SHEETS_SPREADSHEET_ID not set");
    return;
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const tabName = getTodayTabName();
  const sheetId = await getOrCreateTodayTab(sheets, tabName);

  const row = [
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

  // Append row
  const appendResponse = await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tabName}'!A:R`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [row] },
  });

  // Get the row number that was just written
  const updatedRange = appendResponse.data.updates.updatedRange;
  const rowNumber = parseInt(updatedRange.match(/\d+$/)[0]);

  // Apply color coding
  await colorRow(sheets, sheetId, rowNumber - 1, lead.status);

  console.log(`[sheets-sync] Logged lead ${lead.lead_id} → row ${rowNumber} (${lead.status})`);
  return rowNumber;
}

/**
 * Update a lead row's status (e.g., from YELLOW to GREEN after send)
 */
async function updateLeadStatus(leadId, newStatus, notes = "") {
  if (!SPREADSHEET_ID) return;

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const tabName = getTodayTabName();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tabName}'!A:A`,
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === leadId);

  if (rowIndex === -1) {
    console.warn(`[sheets-sync] Lead ${leadId} not found in today's tab`);
    return;
  }

  const sheetId = await getOrCreateTodayTab(sheets, tabName);

  // Update status column (Q = index 16) and notes (R = index 17)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      valueInputOption: "RAW",
      data: [
        {
          range: `'${tabName}'!Q${rowIndex + 1}`,
          values: [[newStatus]],
        },
        notes && {
          range: `'${tabName}'!R${rowIndex + 1}`,
          values: [[notes]],
        },
      ].filter(Boolean),
    },
  });

  await colorRow(sheets, sheetId, rowIndex, newStatus);
  console.log(`[sheets-sync] Updated lead ${leadId} → ${newStatus}`);
}

/**
 * Mark a lead as replied (BLUE status)
 */
async function markLeadReplied(leadId) {
  await updateLeadStatus(leadId, "BLUE", "Reply received — Mustafa to handle");

  // Also update the Reply Received column (P = index 15)
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const tabName = getTodayTabName();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tabName}'!A:A`,
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === leadId);

  if (rowIndex !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!P${rowIndex + 1}`,
      valueInputOption: "RAW",
      resource: { values: [["Yes"]] },
    });
  }
}

// ─── Color Coding ─────────────────────────────────────────────────────────────

async function colorRow(sheets, sheetId, rowIndex, status) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.YELLOW;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 18,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: color.red * 0.3,
                  green: color.green * 0.3,
                  blue: color.blue * 0.3,
                },
              },
            },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
      ],
    },
  });
}

// ─── Daily Summary ────────────────────────────────────────────────────────────

/**
 * Get today's stats from the sheet tab
 * Returns: { total, green, red, yellow, blue, sent, errors }
 */
async function getTodayStats() {
  if (!SPREADSHEET_ID) return null;

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const tabName = getTodayTabName();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A:R`,
    });

    const rows = (response.data.values || []).slice(1); // skip header

    const stats = {
      total: rows.length,
      green: rows.filter((r) => r[16] === "GREEN").length,
      red: rows.filter((r) => r[16] === "RED").length,
      yellow: rows.filter((r) => r[16] === "YELLOW").length,
      blue: rows.filter((r) => r[16] === "BLUE").length,
      sent: rows.filter((r) => r[9] === "Yes").length,
      tab_name: tabName,
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`,
    };

    return stats;
  } catch (err) {
    console.error("[sheets-sync] Failed to get today's stats:", err.message);
    return null;
  }
}

// ─── Lead ID Generator ────────────────────────────────────────────────────────

function generateLeadId(index) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  return `${dateStr}-${String(index).padStart(3, "0")}`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  logLead,
  updateLeadStatus,
  markLeadReplied,
  getTodayStats,
  getTodayTabName,
  generateLeadId,
};

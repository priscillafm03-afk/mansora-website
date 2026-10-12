/**
 * MANSORA lead log: receives website enquiries and newsletter sign-ups and appends them
 * to this spreadsheet. Paste into Extensions > Apps Script of the "MANSORA Leads" sheet.
 *
 * Setup (once):
 *   1. (Optional) Project Settings > Script properties > add SECRET = <same value as SHEETS_WEBHOOK_SECRET in Vercel>.
 *      Without it, the long private web-app URL is the only key.
 *   2. Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone".
 *   3. Copy the web-app URL into Vercel as SHEETS_WEBHOOK_URL, then redeploy the site.
 *
 * The site POSTs JSON: { secret, type: "enquiry" | "subscriber", row: {...} }.
 */

var TABS = {
  enquiry: {
    name: 'Enquiries',
    columns: ['Reference', 'Received', 'Name', 'Email', 'Phone', 'Service', 'Package', 'Message', 'Status', 'Notes'],
    keys: ['reference', 'received', 'name', 'email', 'phone', 'service', 'package', 'message', 'status', 'notes'],
  },
  subscriber: {
    name: 'Subscribers',
    columns: ['Subscribed', 'Email', 'Source'],
    keys: ['subscribed', 'email', 'source'],
  },
};

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (secret && body.secret !== secret) return reply({ ok: false, error: 'unauthorised' });

    var tab = TABS[body.type];
    if (!tab || typeof body.row !== 'object') return reply({ ok: false, error: 'bad request' });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = getOrCreateTab(tab);
      // Skip duplicates (e.g. a retried request) by reference number.
      if (body.type === 'enquiry' && body.row.reference && alreadyLogged(sheet, body.row.reference)) {
        return reply({ ok: true, duplicate: true });
      }
      sheet.appendRow(tab.keys.map(function (k) { return clean(body.row[k]); }));
    } finally {
      lock.releaseLock();
    }
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

// Visiting the web-app URL in a browser shows this, which is a quick health check.
function doGet() {
  return reply({ ok: true, service: 'MANSORA lead log' });
}

// Run once from the editor to create both tabs and grant access.
function setup() {
  getOrCreateTab(TABS.enquiry);
  getOrCreateTab(TABS.subscriber);
  var first = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && SpreadsheetApp.getActiveSpreadsheet().getSheets().length > 1) {
    SpreadsheetApp.getActiveSpreadsheet().deleteSheet(first);
  }
}

function getOrCreateTab(tab) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tab.name);
  if (!sheet) {
    sheet = ss.insertSheet(tab.name);
    sheet.appendRow(tab.columns);
    sheet.getRange(1, 1, 1, tab.columns.length).setFontWeight('bold').setBackground('#38145c').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    if (tab.name === 'Enquiries') {
      var status = SpreadsheetApp.newDataValidation()
        .requireValueInList(['New', 'Contacted', 'Scoping call booked', 'Proposal sent', 'Won', 'Lost', 'Test'], true)
        .build();
      sheet.getRange('I2:I').setDataValidation(status);
      sheet.setColumnWidth(8, 420);
    }
  }
  return sheet;
}

function alreadyLogged(sheet, reference) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var refs = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = refs.length - 1; i >= 0 && i >= refs.length - 200; i--) {
    if (refs[i][0] === reference) return true;
  }
  return false;
}

// Stops formula injection: a value starting with = + - @ is stored as plain text.
function clean(value) {
  var s = value === undefined || value === null ? '' : String(value).slice(0, 5000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

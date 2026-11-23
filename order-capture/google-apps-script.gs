// KAYAL FRESH MEAT - order capture + weekly stock counter
// Paste into Extensions > Apps Script of the Google Sheet (replace the old code), then
// Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy (keeps the same URL).
//
// Sheets used:
//   Orders   - one row per order (created automatically; columns are found by their header names)
//   Products - one row per product. Needed headers: a name column (e.g. "Product"), "Weekly Limit",
//              "Ordered This Week" and optionally "Remaining". The product name must match the name in the app.
//
// An order adds its quantities to "Ordered This Week" (and updates "Remaining") only once the customer has
// chosen a payment mode: paid by QR, or cash on delivery. Orders still "பணம் நிலுவை" (pending) are NOT counted,
// and an order updated again later is never counted twice.

var ORDERS_SHEET = "Orders";
var PRODUCTS_SHEET = "Products";

var ORDER_FIELDS = [
  ["orderId", "Order No", /order\s*(no|id|number)/i],
  ["status", "Status", /^status/i],
  ["payMobile", "Paying Mobile", /paying/i],
  ["time", "Created At", /^(created|time|timestamp|order\s*(date|time)|date\s*(&|and)?\s*time)/i],
  ["delivery", "Delivery", /^delivery/i],
  ["name", "Customer Name", /^(customer\s*)?name/i],
  ["mobile", "Mobile", /^mobile$/i],
  ["alt", "Alt Mobile", /alt/i],
  ["address", "Address", /address/i],
  ["area", "Area", /^area/i],
  ["landmark", "Landmark", /landmark/i],
  ["notes", "Notes", /note/i],
  ["items", "Items", /^items$/i],
  ["total", "Total", /^total/i],
  ["itemDetails", "Item Details", /item\s*details/i]
];

function isPending_(status) { return /நிலுவை|pending/i.test(String(status || "")); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function norm_(s) { return String(s === null || s === undefined ? "" : s).replace(/\s+/g, " ").trim().toLowerCase(); }

// ---------- Orders ----------
function ordersColumns_(sh) {
  if (sh.getLastRow() === 0) { sh.appendRow(ORDER_FIELDS.map(function (f) { return f[1]; })); }
  // Header cells are compared trimmed, with odd spaces (e.g. non-breaking) turned into normal ones
  var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (h) {
    return String(h).replace(/[\s\u00a0]+/g, " ").trim();
  });
  var cols = {};
  ORDER_FIELDS.forEach(function (f) {
    for (var i = 0; i < headers.length; i++) {
      if (f[2].test(headers[i])) { cols[f[0]] = i + 1; break; }
    }
    // Columns that must never be missing are added once if the sheet has no matching header
    if (!cols[f[0]] && (f[0] === "itemDetails" || f[0] === "name" || f[0] === "time")) {
      var c = sh.getLastColumn() + 1;
      sh.getRange(1, c).setValue(f[1]);
      cols[f[0]] = c;
    }
  });
  return cols;
}

// Saves the order. Returns true if its quantities must now be counted: the order is no longer pending
// and had not been counted before (it was new, or its previous status was still pending).
function saveOrder_(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ORDERS_SHEET) || ss.insertSheet(ORDERS_SHEET);
  var cols = ordersColumns_(sh);
  var values = {};
  ORDER_FIELDS.forEach(function (f) { values[f[0]] = d[f[0]] === undefined ? "" : d[f[0]]; });
  values.itemDetails = JSON.stringify(d.itemDetails || []);

  var found = 0;
  if (cols.orderId && sh.getLastRow() > 1) {
    var ids = sh.getRange(2, cols.orderId, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(d.orderId)) { found = i + 2; } }
  }
  var prevStatus = found && cols.status ? sh.getRange(found, cols.status).getValue() : "";
  var width = sh.getLastColumn();
  var row = found ? sh.getRange(found, 1, 1, width).getValues()[0] : new Array(width).fill("");
  // "Created At" is stamped by the server (IST) when the order row is first created and is never overwritten later
  var createdAt = Utilities.formatDate(new Date(), ANALYTICS_TZ, "yyyy-MM-dd HH:mm:ss");
  var stampCreated = !!cols.time && (!found || String(row[cols.time - 1]) === "");
  ORDER_FIELDS.forEach(function (f) {
    if (!cols[f[0]]) { return; }
    if (f[0] === "time") { if (stampCreated) { row[cols.time - 1] = createdAt; } return; }
    row[cols[f[0]] - 1] = values[f[0]];
  });
  if (found) { sh.getRange(found, 1, 1, width).setValues([row]); } else { sh.appendRow(row); }
  if (stampCreated) { sh.getRange(found || sh.getLastRow(), cols.time).setNumberFormat("@").setValue(createdAt); } // keep it as text
  return !isPending_(d.status) && (!found || isPending_(prevStatus));
}

// ---------- Products ----------
// The products of the website (same ids and names as PRODUCTS in src/App.jsx). Sheet rows are matched to these
// leniently (spelling variants, English names like "Beef", extra words), so small naming differences don't matter.
var APP_PRODUCTS = [
  { id: "beef", name: "பீஃப்", alias: ["பீப்", "மாட்டிறைச்சி", "மாட்டுக்கறி", "beef"] },
  { id: "thanikari", name: "தனி கறி", alias: ["தனிக்கறி", "thani kari", "thanikari"] },
  { id: "kottu", name: "கொத்துக்கறி", alias: ["கொத்து கறி", "கொத்துகறி", "kottu kari", "kottukari", "mince", "kheema"] },
  { id: "liver", name: "ஈரல்", alias: ["liver", "eral"] },
  { id: "brain", name: "மூளை", alias: ["brain", "moolai"] },
  { id: "spleen", name: "பல்குத்தி / மண்ணீரல்", alias: ["பல்குத்தி", "மண்ணீரல்", "பால்கட்டி", "palkutti", "spleen", "mannieral"] },
  { id: "kudal", name: "குடல்", alias: ["கொடல்", "கொடலு", "kudal", "kodal", "intestine", "tripe"] },
  { id: "kidney", name: "கிட்னி", alias: ["சிறுநீரகம்", "kidney", "kitni"] },
  { id: "tail", name: "வால்", alias: ["tail", "oxtail"] }
];

// Comparison key: Unicode-normalised, without spaces, punctuation, zero-width marks or the Tamil aytham sign (ஃ)
function key_(s) {
  var t = String(s === null || s === undefined ? "" : s);
  if (t.normalize) { t = t.normalize("NFC"); }
  return t.toLowerCase().replace(/[\u200B-\u200D\uFEFF\u0B83]/g, "").replace(/[\s\-_\/\\.,:;()\[\]{}'"]+/g, "");
}

// Which website product does a Products-sheet cell (or an order line) mean? Returns its APP_PRODUCTS entry or null.
function appProduct_(text, id) {
  var k = key_(text), i, a;
  if (id) { for (i = 0; i < APP_PRODUCTS.length; i++) { if (APP_PRODUCTS[i].id === id && k && (key_(APP_PRODUCTS[i].name) === k || APP_PRODUCTS[i].id === k)) { return APP_PRODUCTS[i]; } } }
  for (i = 0; i < APP_PRODUCTS.length; i++) { a = APP_PRODUCTS[i]; if (k && (k === key_(a.name) || k === a.id)) { return a; } }
  for (i = 0; i < APP_PRODUCTS.length; i++) { a = APP_PRODUCTS[i]; if (k.length >= 3 && (k.indexOf(key_(a.name)) !== -1 || key_(a.name).indexOf(k) !== -1)) { return a; } }
  for (i = 0; i < APP_PRODUCTS.length; i++) { a = APP_PRODUCTS[i]; if (k.indexOf(a.id) !== -1) { return a; } }
  // Alternative spellings / English names
  for (i = 0; i < APP_PRODUCTS.length; i++) {
    a = APP_PRODUCTS[i];
    for (var j = 0; j < a.alias.length; j++) { var ak = key_(a.alias[j]); if (k === ak || (ak.length >= 4 && k.indexOf(ak) !== -1)) { return a; } }
  }
  // Same consonants, different vowel signs (e.g. குடல் / கொடல்)
  var sk = skeleton_(text);
  if (sk.length >= 3) {
    for (i = 0; i < APP_PRODUCTS.length; i++) {
      a = APP_PRODUCTS[i];
      if (sk === skeleton_(a.name)) { return a; }
      for (var m = 0; m < a.alias.length; m++) { if (sk === skeleton_(a.alias[m])) { return a; } }
    }
  }
  return null;
}
// Tamil letters without vowel signs / pulli
function skeleton_(s) { return key_(s).replace(/[\u0BBE-\u0BCD\u0BD7]/g, ""); }
function num_(v) { var n = parseFloat(String(v === null || v === undefined ? "" : v).replace(/,/g, "")); return isNaN(n) ? 0 : n; }
function productsInfo_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRODUCTS_SHEET);
  if (!sh || sh.getLastRow() < 1) { return null; }
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  function find(re) { for (var i = 0; i < headers.length; i++) { if (re.test(String(headers[i]))) { return i + 1; } } return 0; }
  var info = { sh: sh, name: find(/product|name|பொருள்/i) || 1, limit: find(/limit/i), ordered: find(/ordered/i), remaining: find(/remain|available|left/i) };
  if (!info.ordered) { info.ordered = sh.getLastColumn() + 1; sh.getRange(1, info.ordered).setValue("Ordered This Week"); }
  return info;
}

function numberOrNull_(v) { if (v === "" || v === null || v === undefined) { return null; } var n = Number(v); return isNaN(n) ? null : n; }

// Adds (sign = 1) or removes (sign = -1) an order's quantities from "Ordered This Week".
// Returns the names of ordered products that could not be found in the Products sheet.
function addOrdered_(details, sign) {
  var p = productsInfo_(), missing = [];
  if (!p || !details || !details.length || p.sh.getLastRow() < 2) { return missing; }
  var n = p.sh.getLastRow() - 1;
  var names = p.sh.getRange(2, p.name, n, 1).getValues();
  var ordered = p.sh.getRange(2, p.ordered, n, 1).getValues();
  var limits = p.limit ? p.sh.getRange(2, p.limit, n, 1).getValues() : null;
  var totals = {}; // website product id -> quantity
  details.forEach(function (it) {
    var ap = appProduct_(it.name, it.id) || appProduct_(it.id, it.id);
    var k = ap ? ap.id : "name:" + key_(it.name);
    totals[k] = (totals[k] || 0) + num_(it.quantity);
    totals["label:" + k] = it.name;
  });
  var used = {};
  for (var r = 0; r < n; r++) {
    var ap2 = appProduct_(names[r][0]);
    var k2 = ap2 ? ap2.id : "name:" + key_(names[r][0]);
    var q = totals[k2];
    if (!q || used[k2]) { continue; }
    used[k2] = true;
    var now = Math.max(0, Math.round((num_(ordered[r][0]) + sign * q) * 100) / 100);
    p.sh.getRange(r + 2, p.ordered).setValue(now);
    if (p.remaining && limits && !p.sh.getRange(r + 2, p.remaining).getFormula()) {
      var lim = numberOrNull_(limits[r][0]);
      if (lim !== null) { p.sh.getRange(r + 2, p.remaining).setValue(Math.max(0, Math.round((lim - now) * 100) / 100)); }
    }
  }
  Object.keys(totals).forEach(function (k) {
    if (k.indexOf("label:") === 0 || !totals[k] || used[k]) { return; }
    missing.push(totals["label:" + k]);
  });
  if (missing.length) { Logger.log("Not found in Products sheet: " + missing.join(", ")); }
  return missing;
}

// ---------- Maintenance helpers (run from the Apps Script editor: pick the function > Run > View > Logs) ----------
// checkProducts(): shows which Products-sheet row each website product is matched to, and what is NOT matched.
function checkProducts() {
  var p = productsInfo_(), out = [];
  if (!p || p.sh.getLastRow() < 2) { out.push("No rows found in the Products sheet."); Logger.log(out.join("\n")); return out.join("\n"); }
  var n = p.sh.getLastRow() - 1, names = p.sh.getRange(2, p.name, n, 1).getValues();
  out.push("Columns: name=" + p.name + ", weekly limit=" + (p.limit || "none") + ", ordered=" + p.ordered + ", remaining=" + (p.remaining || "none"));
  var seen = {}, unknown = [];
  names.forEach(function (row, i) {
    if (!String(row[0]).trim()) { return; }
    var ap = appProduct_(row[0]);
    if (ap) { (seen[ap.id] = seen[ap.id] || []).push((i + 2) + " (\"" + String(row[0]).trim() + "\")"); }
    else { unknown.push("row " + (i + 2) + " (\"" + String(row[0]).trim() + "\")"); }
  });
  APP_PRODUCTS.forEach(function (a) {
    var rows = seen[a.id];
    if (!rows) { out.push("MISSING  " + a.name + " : no matching row in the Products sheet - add a row named exactly \"" + a.name + "\""); }
    else if (rows.length > 1) { out.push("WARNING  " + a.name + " : matches rows " + rows.join(", ") + " - only the FIRST row is updated"); }
    else { out.push("OK       " + a.name + " -> row " + rows[0]); }
  });
  unknown.forEach(function (u) { out.push("IGNORED  " + u + " : not a website product"); });
  Logger.log(out.join("\n"));
  return out.join("\n");
}

function createdDay_(v) {
  if (v instanceof Date) { return Utilities.formatDate(v, ANALYTICS_TZ, "yyyy-MM-dd"); }
  var s = String(v === null || v === undefined ? "" : v).trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d/.test(s) && s.indexOf("Z") === -1 && s.indexOf("T") === -1) { return s.substring(0, 10); }
  var t = Date.parse(s);
  return isNaN(t) ? "" : Utilities.formatDate(new Date(t), ANALYTICS_TZ, "yyyy-MM-dd");
}

// rebuildOrderedThisWeek(): recalculates "Ordered This Week" (and "Remaining") for every product from the Orders sheet:
// all orders created since the last Sunday (IST) that are no longer "pending". Use it once to repair stock counts;
// it replaces the current numbers in the Products sheet.
function rebuildOrderedThisWeek() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var osh = ss.getSheetByName(ORDERS_SHEET), p = productsInfo_();
  if (!osh || osh.getLastRow() < 2 || !p || p.sh.getLastRow() < 2) { Logger.log("Nothing to rebuild (Orders or Products sheet is empty)."); return "empty"; }
  var cols = ordersColumns_(osh);
  var now = new Date();
  var sinceSunday = Number(Utilities.formatDate(now, ANALYTICS_TZ, "u")) % 7; // ISO weekday: Mon=1 ... Sun=7
  var weekStart = Utilities.formatDate(new Date(now.getTime() - sinceSunday * 86400000), ANALYTICS_TZ, "yyyy-MM-dd");
  var rows = osh.getRange(2, 1, osh.getLastRow() - 1, osh.getLastColumn()).getValues();
  var totals = {}, counted = 0;
  rows.forEach(function (r) {
    if (cols.status && isPending_(r[cols.status - 1])) { return; }
    if (!cols.time || createdDay_(r[cols.time - 1]) < weekStart) { return; }
    var details; try { details = JSON.parse(r[cols.itemDetails - 1] || "[]"); } catch (e) { return; }
    counted++;
    details.forEach(function (it) {
      var ap = appProduct_(it.name, it.id) || appProduct_(it.id, it.id);
      var k = ap ? ap.id : "name:" + key_(it.name);
      totals[k] = (totals[k] || 0) + num_(it.quantity);
    });
  });
  var n = p.sh.getLastRow() - 1, names = p.sh.getRange(2, p.name, n, 1).getValues();
  var limits = p.limit ? p.sh.getRange(2, p.limit, n, 1).getValues() : null, used = {}, log = [];
  for (var i = 0; i < n; i++) {
    var ap2 = appProduct_(names[i][0]), k2 = ap2 ? ap2.id : "name:" + key_(names[i][0]);
    if (!String(names[i][0]).trim() || used[k2]) { continue; }
    used[k2] = true;
    var v = Math.round((totals[k2] || 0) * 100) / 100;
    p.sh.getRange(i + 2, p.ordered).setValue(v);
    if (p.remaining && limits && !p.sh.getRange(i + 2, p.remaining).getFormula()) {
      var lim = numberOrNull_(limits[i][0]);
      if (lim !== null) { p.sh.getRange(i + 2, p.remaining).setValue(Math.max(0, Math.round((lim - v) * 100) / 100)); }
    }
    log.push(String(names[i][0]).trim() + " = " + v);
  }
  var msg = "Rebuilt from " + counted + " order(s) created since " + weekStart + ": " + log.join(", ");
  Logger.log(msg);
  return msg;
}

// ---------- Website analytics ----------
// Sheet "Website Analytics"  (created automatically)
//   A:D  Daily summary  - Date | Page Views | Unique Visitors | New Visitors
//   F:K  Visitor list   - Visitor ID | First Seen | Last Seen | Last Visit Date | Total Visits | Days Visited
//   M:N  Control block  - lifetime page-view counter, last "reset today" marker, last full reset
// Sheet "Website Analytics Log" (created automatically) - one row per page view.
// A "calendar day" is the day in ANALYTICS_TZ. Admin access key: Project Settings > Script properties >
// ANALYTICS_ADMIN_KEY (never put it in the code). Only anonymous data is stored: no IP address, no names or phones.
var ANALYTICS_SHEET = "Website Analytics";
var ANALYTICS_LOG_SHEET = "Website Analytics Log";
var ANALYTICS_TZ = "Asia/Kolkata";
var AN = { date: 1, views: 2, unique: 3, fresh: 4, vid: 6, first: 7, last: 8, lastDay: 9, visits: 10, days: 11, ctlLabel: 13, ctlValue: 14 };
var AN_HEADERS = ["Date", "Page Views", "Unique Visitors", "New Visitors", "", "Visitor ID", "First Seen", "Last Seen", "Last Visit Date", "Total Visits", "Days Visited"];
var LOG_HEADERS = ["Date", "Time (IST)", "Visitor ID", "Source", "UTM Source", "UTM Medium", "UTM Campaign", "Referrer Domain", "Referrer URL", "Page", "Device", "Browser", "OS", "City", "Region", "Country", "New Visitor", "First Visit Today"];
var CTL_VIEWS_ROW = 2, CTL_RESETDAY_ROW = 3, CTL_RESETLOG_ROW = 4, CTL_FULLRESET_ROW = 5;
var RESET_TODAY_PHRASE = "RESET TODAY";
var RESET_ALL_PHRASE = "RESET ALL ANALYTICS";

function dayKey_(v) {
  if (v instanceof Date) { return Utilities.formatDate(v, ANALYTICS_TZ, "yyyy-MM-dd"); }
  return String(v === null || v === undefined ? "" : v).trim();
}

// Text that came from a visitor's browser: strip control characters, limit length and make sure a
// spreadsheet can never read it as a formula.
function clean_(v, max) {
  var t = String(v === null || v === undefined ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (t.length > max) { t = t.substring(0, max); }
  if (/^[=+\-@]/.test(t)) { t = " " + t; }
  return t;
}

// Appending below the last grid row would fail, so add rows first.
function ensureRows_(sh, row) {
  var max = sh.getMaxRows();
  if (row > max) { sh.insertRowsAfter(max, Math.max(row - max, 1000)); }
}

function analyticsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ANALYTICS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ANALYTICS_SHEET);
    sh.getRange(1, 1, 1, AN_HEADERS.length).setValues([AN_HEADERS]).setFontWeight("bold");
    [AN.date, AN.vid, AN.lastDay].forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat("@"); });
    sh.setFrozenRows(1);
  }
  return sh;
}

function logSheet_(create) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ANALYTICS_LOG_SHEET);
  if (!sh && create) {
    sh = ss.insertSheet(ANALYTICS_LOG_SHEET);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function lastRowInCol_(sh, col) {
  var n = sh.getLastRow();
  if (n < 1) { return 0; }
  var vals = sh.getRange(1, col, n, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) { if (String(vals[i][0]) !== "") { return i + 1; } }
  return 0;
}

// Row (>= 2) whose cell in `col` equals `text`, or 0. Searches rows 2..last.
function findRow_(sh, col, last, text) {
  if (last < 2) { return 0; }
  var cell = sh.getRange(2, col, last - 1, 1).createTextFinder(text).matchEntireCell(true).matchCase(true).findNext();
  return cell ? cell.getRow() : 0;
}

// ----- control block (M:N): lifetime page views + reset markers -----
function setCtl_(sh, row, value, asText) {
  var r = sh.getRange(row, AN.ctlValue);
  if (asText) { r.setNumberFormat("@"); }
  r.setValue(value);
}
function getCtl_(sh, row) { return sh.getRange(row, AN.ctlValue).getValue(); }

// Lifetime page views is its own counter, so "Reset Today's Counts" can leave it untouched.
// First use (or an older install): start from the sum of the daily rows.
function lifetimeViews_(sh) {
  var v = getCtl_(sh, CTL_VIEWS_ROW);
  if (v === "" || v === null || v === undefined) {
    var aLast = lastRowInCol_(sh, AN.date), sum = 0;
    if (aLast >= 2) { sh.getRange(2, AN.views, aLast - 1, 1).getValues().forEach(function (r) { sum += Number(r[0]) || 0; }); }
    sh.getRange(1, AN.ctlLabel, 5, 1).setValues([["Lifetime Totals"], ["Lifetime Page Views"], ["Today Reset Day"], ["Log Row At Reset"], ["Last Full Reset"]]);
    setCtl_(sh, CTL_VIEWS_ROW, sum);
    return sum;
  }
  return Number(v) || 0;
}

// ----- traffic source -----
function hostOf_(url) {
  var m = /^[a-z][a-z0-9+.\-]*:\/\/([^\/?#:]+)/i.exec(String(url || ""));
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}
// Maps a tag value (utm_source) or a referrer host to one of: WhatsApp, Google, Facebook, Instagram, or "" if unknown.
function sourceName_(s) {
  s = String(s || "").toLowerCase();
  if (!s) { return ""; }
  if (/whatsapp|^wa$|(^|\.)wa\.me$/.test(s)) { return "WhatsApp"; }
  if (/instagram|^ig$|^insta$|(^|\.)instagr\.am$/.test(s)) { return "Instagram"; }
  if (/facebook|^fb$|^fb\.|(^|\.)fb\.(com|me|watch)$|(^|\.)fbcdn\./.test(s)) { return "Facebook"; }
  if (/(^|\.)google\.[a-z.]{2,}$|googlequicksearchbox|^google$|^goog$|^gmb$/.test(s)) { return "Google"; }
  return "";
}
// Priority: explicit UTM tag > referrer > in-app browser hint (Instagram / Facebook apps) > Direct
function classifySource_(utmSource, referrer, inApp) {
  var u = String(utmSource || "").trim();
  if (u) { return sourceName_(u) || "Other"; }
  var host = hostOf_(referrer);
  if (host) { return sourceName_(host) || "Other"; }
  if (inApp === "Instagram" || inApp === "Facebook") { return inApp; }
  return "Direct";
}


// Counts one page view (daily + lifetime + log). Runs under the analytics lock (see analyticsRoute_), so two
// simultaneous requests can never both treat the same visitor as new / first-of-the-day.
function trackVisit_(d) {
  var vid = String(d.visitorId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(vid)) { return { success: false, error: "bad_visitor_id" }; }

  // Light flood protection: ignore a single visitor ID sending more than 60 hits a minute
  try {
    var cache = CacheService.getScriptCache(), ck = "pv_" + vid, n0 = Number(cache.get(ck)) || 0;
    if (n0 >= 60) { return { success: true, throttled: true }; }
    cache.put(ck, String(n0 + 1), 60);
  } catch (e) { /* cache problems must never stop counting */ }

  var sh = analyticsSheet_();
  var now = new Date();
  var today = dayKey_(now);
  var life = lifetimeViews_(sh);

  // 1) Visitor list: lifetime uniqueness (one row per Visitor ID) and once-per-day uniqueness (Last Visit Date)
  var vLast = lastRowInCol_(sh, AN.vid);
  var vRow = findRow_(sh, AN.vid, vLast, vid);
  var isNew = false, firstToday = false;
  if (vRow) {
    var cur = sh.getRange(vRow, AN.last, 1, 4).getValues()[0]; // Last Seen, Last Visit Date, Total Visits, Days Visited
    var days = Number(cur[3]) || 0;
    if (dayKey_(cur[1]) !== today) { firstToday = true; days += 1; }
    var r = sh.getRange(vRow, AN.last, 1, 4);
    r.setNumberFormats([["yyyy-mm-dd hh:mm:ss", "@", "0", "0"]]);
    r.setValues([[now, today, (Number(cur[2]) || 0) + 1, days]]);
  } else {
    isNew = true; firstToday = true;
    var vr = Math.max(vLast, 1) + 1;
    ensureRows_(sh, vr);
    var nr = sh.getRange(vr, AN.vid, 1, 6);
    nr.setNumberFormats([["@", "yyyy-mm-dd hh:mm:ss", "yyyy-mm-dd hh:mm:ss", "@", "0", "0"]]);
    nr.setValues([[vid, now, now, today, 1, 1]]);
  }

  // 2) Daily summary row for today
  var aLast = lastRowInCol_(sh, AN.date);
  var dRow = findRow_(sh, AN.date, aLast, today);
  if (dRow) {
    var dv = sh.getRange(dRow, AN.views, 1, 3).getValues()[0];
    sh.getRange(dRow, AN.views, 1, 3).setValues([[(Number(dv[0]) || 0) + 1, (Number(dv[1]) || 0) + (firstToday ? 1 : 0), (Number(dv[2]) || 0) + (isNew ? 1 : 0)]]);
  } else {
    var dr0 = Math.max(aLast, 1) + 1;
    ensureRows_(sh, dr0);
    var dr = sh.getRange(dr0, AN.date, 1, 4);
    dr.setNumberFormats([["@", "0", "0", "0"]]);
    dr.setValues([[today, 1, firstToday ? 1 : 0, isNew ? 1 : 0]]);
  }

  // 3) Lifetime page views
  setCtl_(sh, CTL_VIEWS_ROW, life + 1);

  // 4) Activity log row (anonymous: no IP address, no personal details)
  var referrer = clean_(d.referrer, 300);
  var device = /^(Mobile|Desktop|Tablet)$/.test(String(d.device)) ? d.device : "Other";
  var row = [
    today, Utilities.formatDate(now, ANALYTICS_TZ, "HH:mm:ss"), vid,
    classifySource_(d.utmSource, referrer, d.inApp),
    clean_(d.utmSource, 60), clean_(d.utmMedium, 60), clean_(d.utmCampaign, 80),
    clean_(hostOf_(referrer), 100), referrer, clean_(d.page || "/", 200),
    device, clean_(d.browser, 40), clean_(d.os, 40),
    clean_(d.city, 60), clean_(d.region, 60), clean_(d.country, 60),
    isNew ? "Yes" : "No", firstToday ? "Yes" : "No"
  ];
  var log = logSheet_(true);
  var lr = Math.max(log.getLastRow(), 1) + 1;
  ensureRows_(log, lr);
  var lg = log.getRange(lr, 1, 1, LOG_HEADERS.length);
  lg.setNumberFormat("@");
  lg.setValues([row]);
  return { success: true };
}

// ---------- Admin: authorisation ----------
function safeEq_(a, b) {
  var r = a.length ^ b.length, n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) { r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); }
  return r === 0;
}
// Returns null when the key is right, otherwise an error object. 10 wrong keys in 10 minutes blocks further tries for a while.
function analyticsAuth_(d) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get("an_fail")) || 0;
  if (fails >= 10) { return { success: false, error: "too_many_attempts" }; }
  var key = PropertiesService.getScriptProperties().getProperty("ANALYTICS_ADMIN_KEY");
  if (!key) { return { success: false, error: "not_configured" }; }
  if (!safeEq_(String(d.key || ""), String(key))) { cache.put("an_fail", String(fails + 1), 600); return { success: false, error: "unauthorized" }; }
  if (fails) { cache.remove("an_fail"); }
  return null;
}

// ---------- Admin: statistics ----------
function logRow_(v) {
  return {
    date: String(v[0]), time: String(v[1]), visitor: String(v[2]).substring(0, 8), source: String(v[3]),
    referrer: String(v[7]), page: String(v[9]), device: String(v[10]), browser: String(v[11]), os: String(v[12]),
    city: String(v[13]), region: String(v[14]), country: String(v[15])
  };
}

// Traffic sources for today (log rows are chronological, so read backwards until the date changes)
function sourcesToday_(today, afterRow) {
  var log = logSheet_(false), counts = {};
  if (!log) { return counts; }
  var floor = Math.max(afterRow, 1), end = log.getLastRow();
  while (end > floor) {
    var start = Math.max(end - 999, floor + 1);
    var vals = log.getRange(start, 1, end - start + 1, 4).getValues(), stop = false;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]) !== today) { stop = true; break; }
      var s = String(vals[i][3]) || "Other";
      counts[s] = (counts[s] || 0) + 1;
    }
    if (stop) { break; }
    end = start - 1;
  }
  return counts;
}

function analyticsStats_() {
  var sh = analyticsSheet_();
  var today = dayKey_(new Date());
  var lifetime = lifetimeViews_(sh);
  var aLast = lastRowInCol_(sh, AN.date);
  var viewsToday = 0, uniqueToday = 0, daily = [];
  if (aLast >= 2) {
    var rows = sh.getRange(2, 1, aLast - 1, 4).getValues();
    rows.forEach(function (row) {
      if (dayKey_(row[0]) === today) { viewsToday = Number(row[1]) || 0; uniqueToday = Number(row[2]) || 0; }
    });
    for (var i = rows.length - 1; i >= 0 && daily.length < 30; i--) {
      daily.push({ date: dayKey_(rows[i][0]), views: Number(rows[i][1]) || 0, unique: Number(rows[i][2]) || 0, fresh: Number(rows[i][3]) || 0 });
    }
  }
  var resetDay = dayKey_(getCtl_(sh, CTL_RESETDAY_ROW));
  var resetLog = resetDay === today ? Number(getCtl_(sh, CTL_RESETLOG_ROW)) || 0 : 0;
  var log = logSheet_(false), recent = [];
  if (log && log.getLastRow() >= 2) {
    var last = log.getLastRow(), from = Math.max(2, last - 24);
    log.getRange(from, 1, last - from + 1, LOG_HEADERS.length).getValues().reverse().forEach(function (v) { recent.push(logRow_(v)); });
  }
  return {
    success: true, date: today, pageViewsToday: viewsToday, uniqueToday: uniqueToday,
    pageViewsTotal: lifetime, uniqueTotal: Math.max(0, lastRowInCol_(sh, AN.vid) - 1),
    dailyCount: Math.max(0, aLast - 1), daily: daily, recent: recent, sourcesToday: sourcesToday_(today, resetLog),
    updatedAt: new Date().toISOString()
  };
}

// ---------- Admin: export (paged, so large logs never hit response limits) ----------
function analyticsExport_(d) {
  var part = d.part === "daily" ? "daily" : "activity";
  var offset = Math.max(0, parseInt(d.offset, 10) || 0);
  var limit = Math.min(5000, Math.max(1, parseInt(d.limit, 10) || 2000));
  var sh, header, width, total;
  if (part === "daily") {
    sh = analyticsSheet_(); header = ["Date", "Page Views", "Unique Visitors", "New Visitors"]; width = 4;
    total = Math.max(0, lastRowInCol_(sh, AN.date) - 1);
  } else {
    sh = logSheet_(true); header = LOG_HEADERS; width = LOG_HEADERS.length;
    total = Math.max(0, sh.getLastRow() - 1);
  }
  var n = Math.max(0, Math.min(limit, total - offset));
  var rows = n ? sh.getRange(2 + offset, 1, n, width).getValues().map(function (r) {
    return r.map(function (v) { return v instanceof Date ? dayKey_(v) : v; });
  }) : [];
  return { success: true, part: part, header: header, rows: rows, total: total, offset: offset, next: offset + n, done: offset + n >= total };
}

// ---------- Admin: resets ----------
// Zeroes today's page views / unique visitors. History and the lifetime totals are kept.
function resetToday_() {
  var sh = analyticsSheet_();
  var today = dayKey_(new Date());
  var aLast = lastRowInCol_(sh, AN.date);
  var dRow = findRow_(sh, AN.date, aLast, today);
  if (dRow) { sh.getRange(dRow, AN.views, 1, 3).setValues([[0, 0, 0]]); }
  // Visitors seen today may be counted as unique again after the reset (the visitor rows themselves stay)
  var vLast = lastRowInCol_(sh, AN.vid);
  if (vLast >= 2) {
    var rng = sh.getRange(2, AN.lastDay, vLast - 1, 3); // Last Visit Date, Total Visits, Days Visited
    var vals = rng.getValues(), changed = false;
    vals.forEach(function (v) {
      if (dayKey_(v[0]) === today) { v[0] = ""; v[2] = Math.max(0, (Number(v[2]) || 0) - 1); changed = true; }
    });
    if (changed) { rng.setValues(vals); }
  }
  lifetimeViews_(sh); // make sure the control block exists
  setCtl_(sh, CTL_RESETDAY_ROW, today, true);
  setCtl_(sh, CTL_RESETLOG_ROW, logSheet_(true).getLastRow());
  return { success: true, resetDay: today };
}

// Clears daily history, the visitor list, the lifetime counter and the activity log. Orders / Products are never touched.
function resetAll_() {
  var sh = analyticsSheet_();
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), AN.days).clearContent();
  sh.getRange(1, AN.ctlLabel, 5, 1).setValues([["Lifetime Totals"], ["Lifetime Page Views"], ["Today Reset Day"], ["Log Row At Reset"], ["Last Full Reset"]]);
  setCtl_(sh, CTL_VIEWS_ROW, 0);
  setCtl_(sh, CTL_RESETDAY_ROW, "", true);
  setCtl_(sh, CTL_RESETLOG_ROW, 0);
  setCtl_(sh, CTL_FULLRESET_ROW, Utilities.formatDate(new Date(), ANALYTICS_TZ, "yyyy-MM-dd HH:mm:ss"), true);
  var log = logSheet_(true);
  if (log.getLastRow() > 1) { log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADERS.length).clearContent(); }
  return { success: true };
}

function analyticsAdmin_(d) {
  var denied = analyticsAuth_(d);
  if (denied) { return denied; }
  switch (d.type) {
    case "analytics-stats": return analyticsStats_();
    case "analytics-export": return analyticsExport_(d);
    case "analytics-reset-today":
      if (d.confirm !== RESET_TODAY_PHRASE) { return { success: false, error: "confirmation_required" }; }
      return resetToday_();
    case "analytics-reset-all":
      if (d.confirm !== RESET_ALL_PHRASE) { return { success: false, error: "confirmation_required" }; }
      return resetAll_();
  }
  return { success: false, error: "unknown_action" };
}

// Entry point for analytics requests. Uses its own (document) lock, separate from the order lock, so website
// visits can never make an order wait. Returns null for anything that is not an analytics request.
function analyticsRoute_(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return null; }
  if (!d || typeof d.type !== "string") { return null; }
  var isTrack = d.type === "pageview";
  if (!isTrack && d.type.indexOf("analytics-") !== 0) { return null; }
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(20000);
    var out = isTrack ? trackVisit_(d) : analyticsAdmin_(d);
    SpreadsheetApp.flush();
    return json_(out);
  } catch (err2) {
    return json_({ success: false, error: String(err2) });
  } finally {
    try { lock.releaseLock(); } catch (e3) { /* not held */ }
  }
}

// ---------- Web app ----------
function doPost(e) {
  // Website analytics is handled first, with its own lock; the order code below is unchanged
  var analytics = analyticsRoute_(e);
  if (analytics) { return analytics; }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    var countNow = saveOrder_(d);
    var missing = countNow ? addOrdered_(d.itemDetails, 1) : [];
    // Optional email alert - remove the // to use:
    // MailApp.sendEmail("your-email@example.com", "Order #" + d.orderId + " - " + d.status, d.name + " " + d.mobile + "\n" + d.items + "\nTotal: " + d.total);
    return json_({ success: true, notFoundInProducts: missing });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Stock levels for the website (JSONP: ?callback=name)
function doGet(e) {
  var out = { success: true, products: [] };
  try {
    var p = productsInfo_();
    if (p && p.sh.getLastRow() > 1) {
      var n = p.sh.getLastRow() - 1;
      var names = p.sh.getRange(2, p.name, n, 1).getValues();
      var limits = p.limit ? p.sh.getRange(2, p.limit, n, 1).getValues() : null;
      var ordered = p.sh.getRange(2, p.ordered, n, 1).getValues();
      for (var r = 0; r < n; r++) {
        if (!String(names[r][0]).trim()) { continue; }
        var lim = limits ? numberOrNull_(limits[r][0]) : null;
        var used = num_(ordered[r][0]);
        var ap = appProduct_(names[r][0]);
        out.products.push({ name: ap ? ap.name : String(names[r][0]).trim(), limit: lim, remaining: lim === null ? null : Math.max(0, lim - used) });
      }
    }
  } catch (err) { out = { success: false, error: String(err) }; }
  var cb = e && e.parameter && e.parameter.callback;
  if (cb && /^[A-Za-z0-9_$.]+$/.test(cb)) {
    return ContentService.createTextOutput(cb + "(" + JSON.stringify(out) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(out);
}

// ---------- Maintenance (run from the Apps Script editor when needed) ----------

// Start a new week: set every "Ordered This Week" to 0. Best run automatically every Sunday night:
// Apps Script > Triggers > Add trigger > resetOrderedThisWeek > Time-driven > Week timer > Sunday.
function resetOrderedThisWeek() {
  var p = productsInfo_();
  if (!p || p.sh.getLastRow() < 2) { return; }
  var n = p.sh.getLastRow() - 1;
  p.sh.getRange(2, p.ordered, n, 1).setValue(0);
  if (p.remaining && p.limit) {
    var limits = p.sh.getRange(2, p.limit, n, 1).getValues();
    for (var r = 0; r < n; r++) {
      var lim = numberOrNull_(limits[r][0]);
      if (lim !== null && !p.sh.getRange(r + 2, p.remaining).getFormula()) { p.sh.getRange(r + 2, p.remaining).setValue(lim); }
    }
  }
}

// Rebuild "Ordered This Week" from the Orders sheet for the most recent delivery date
// (use after deleting or cancelling orders by hand).
function recountFromOrders() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_SHEET);
  if (!sh || sh.getLastRow() < 2) { return; }
  var cols = ordersColumns_(sh);
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var delivery = rows[rows.length - 1][cols.delivery - 1];
  resetOrderedThisWeek();
  rows.forEach(function (row) {
    if (row[cols.delivery - 1] !== delivery || isPending_(row[cols.status - 1])) { return; }
    try { addOrdered_(JSON.parse(row[cols.itemDetails - 1] || "[]"), 1); } catch (e) {}
  });
}

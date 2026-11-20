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
  ["time", "Time", /^time/i],
  ["delivery", "Delivery", /^delivery/i],
  ["name", "Name", /^name/i],
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
  var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var cols = {};
  ORDER_FIELDS.forEach(function (f) {
    for (var i = 0; i < headers.length; i++) {
      if (f[2].test(String(headers[i]))) { cols[f[0]] = i + 1; break; }
    }
    if (!cols[f[0]] && f[0] === "itemDetails") { // add the helper column once
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
  ORDER_FIELDS.forEach(function (f) { if (cols[f[0]]) { row[cols[f[0]] - 1] = values[f[0]]; } });
  if (found) { sh.getRange(found, 1, 1, width).setValues([row]); } else { sh.appendRow(row); }
  return !isPending_(d.status) && (!found || isPending_(prevStatus));
}

// ---------- Products ----------
// The products of the website (same ids and names as PRODUCTS in src/App.jsx). Sheet rows are matched to these
// leniently (spelling variants, English names like "Beef", extra words), so small naming differences don't matter.
var APP_PRODUCTS = [
  { id: "beef", name: "பீஃப்" }, { id: "thanikari", name: "தனி கறி" }, { id: "kottu", name: "கொத்துக்கறி" },
  { id: "liver", name: "ஈரல்" }, { id: "brain", name: "மூளை" }, { id: "spleen", name: "பல்குத்தி / மண்ணீரல்" },
  { id: "kudal", name: "குடல்" }, { id: "kidney", name: "கிட்னி" }, { id: "tail", name: "வால்" }
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
  return null;
}
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

// ---------- Web app ----------
function doPost(e) {
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

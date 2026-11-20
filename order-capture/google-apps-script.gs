// KAYAL FRESH MEAT - order capture + weekly stock counter
// Paste into Extensions > Apps Script of the Google Sheet (replace the old code), then
// Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy (keeps the same URL).
//
// Sheets used:
//   Orders   - one row per order (created automatically; columns are found by their header names)
//   Products - one row per product. Needed headers: a name column (e.g. "Product"), "Weekly Limit",
//              "Ordered This Week" and optionally "Remaining". The product name must match the name in the app.
//
// Every NEW order adds its quantities to "Ordered This Week" (and updates "Remaining").
// The same order being updated later (pending -> paid / cash on delivery) is NOT counted twice.

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

// Saves the order. Returns true if it was a NEW order (so its quantities must be counted).
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
  var width = sh.getLastColumn();
  var row = found ? sh.getRange(found, 1, 1, width).getValues()[0] : new Array(width).fill("");
  ORDER_FIELDS.forEach(function (f) { if (cols[f[0]]) { row[cols[f[0]] - 1] = values[f[0]]; } });
  if (found) { sh.getRange(found, 1, 1, width).setValues([row]); } else { sh.appendRow(row); }
  return !found;
}

// ---------- Products ----------
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
function addOrdered_(details, sign) {
  var p = productsInfo_();
  if (!p || !details || !details.length || p.sh.getLastRow() < 2) { return; }
  var n = p.sh.getLastRow() - 1;
  var names = p.sh.getRange(2, p.name, n, 1).getValues();
  var ordered = p.sh.getRange(2, p.ordered, n, 1).getValues();
  var limits = p.limit ? p.sh.getRange(2, p.limit, n, 1).getValues() : null;
  var totals = {};
  details.forEach(function (it) { var k = norm_(it.name); totals[k] = (totals[k] || 0) + Number(it.quantity || 0); });
  for (var r = 0; r < n; r++) {
    var q = totals[norm_(names[r][0])];
    if (!q) { continue; }
    var now = Math.max(0, Math.round(((Number(ordered[r][0]) || 0) + sign * q) * 100) / 100);
    p.sh.getRange(r + 2, p.ordered).setValue(now);
    if (p.remaining && limits && !p.sh.getRange(r + 2, p.remaining).getFormula()) {
      var lim = numberOrNull_(limits[r][0]);
      if (lim !== null) { p.sh.getRange(r + 2, p.remaining).setValue(Math.max(0, Math.round((lim - now) * 100) / 100)); }
    }
  }
}

// ---------- Web app ----------
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    var isNew = saveOrder_(d);
    if (isNew) { addOrdered_(d.itemDetails, 1); }
    // Optional email alert - remove the // to use:
    // MailApp.sendEmail("your-email@example.com", "Order #" + d.orderId + " - " + d.status, d.name + " " + d.mobile + "\n" + d.items + "\nTotal: " + d.total);
    return json_({ success: true });
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
        var used = Number(ordered[r][0]) || 0;
        out.products.push({ name: String(names[r][0]).trim(), limit: lim, remaining: lim === null ? null : Math.max(0, lim - used) });
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
    if (row[cols.delivery - 1] !== delivery) { return; }
    try { addOrdered_(JSON.parse(row[cols.itemDetails - 1] || "[]"), 1); } catch (e) {}
  });
}

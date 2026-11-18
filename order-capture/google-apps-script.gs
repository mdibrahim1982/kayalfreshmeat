// Paste into Extensions > Apps Script of a Google Sheet, then Deploy > New deployment > Web app
// (Execute as: Me, Who has access: Anyone). Copy the Web app URL into .env as VITE_ORDER_ENDPOINT.
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Orders") || ss.insertSheet("Orders");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Order No", "Status", "Paying Mobile", "Time", "Delivery", "Name", "Mobile", "Alt Mobile", "Address", "Area", "Landmark", "Notes", "Items", "Total"]);
  }
  var row = [d.orderId, d.status, d.payMobile, d.time, d.delivery, d.name, d.mobile, d.alt, d.address, d.area, d.landmark, d.notes, d.items, d.total];
  // Same order number -> update the existing row (pending -> paid), otherwise add a new row
  var ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  var found = 0;
  for (var i = 1; i < ids.length; i++) { if (String(ids[i][0]) === String(d.orderId)) { found = i + 1; } }
  if (found) { sh.getRange(found, 1, 1, row.length).setValues([row]); } else { sh.appendRow(row); }
  // Optional email alert - remove the // to use:
  // MailApp.sendEmail("your-email@example.com", "Order #" + d.orderId + " - " + d.status, d.name + " " + d.mobile + "\n" + d.items + "\nTotal: " + d.total + "\nPaying Mobile: " + d.payMobile);
  return ContentService.createTextOutput("ok");
}

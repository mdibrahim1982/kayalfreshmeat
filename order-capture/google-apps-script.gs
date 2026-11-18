// Paste into Extensions > Apps Script of a Google Sheet, then Deploy > New deployment > Web app
// (Execute as: Me, Who has access: Anyone). Copy the Web app URL into .env as VITE_ORDER_ENDPOINT.
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Orders") || ss.insertSheet("Orders");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Order No", "Time", "Delivery", "Name", "Mobile", "Alt Mobile", "Address", "Area", "Landmark", "Notes", "Items", "Total"]);
  }
  sh.appendRow([d.orderId, d.time, d.delivery, d.name, d.mobile, d.alt, d.address, d.area, d.landmark, d.notes, d.items, d.total]);
  // Optional email alert - remove the // to use:
  // MailApp.sendEmail("your-email@example.com", "New order #" + d.orderId, d.name + " " + d.mobile + "\n" + d.items + "\nTotal: " + d.total);
  return ContentService.createTextOutput("ok");
}

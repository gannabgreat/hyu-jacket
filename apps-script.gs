/**
 * HYU Jacket — order collector (Google Apps Script)
 *
 * Receives the order form from index.html and appends a row to a Google Sheet.
 * The sheet is created automatically on first run ("HYU Jacket Orders" in your Drive).
 * Re-submissions from the same browser (same id) update the existing row instead of adding a new one.
 *
 * Deploy: Deploy > New deployment > Type: Web app > Execute as: Me > Who has access: Anyone
 * Then paste the Web app URL into SHEET_ENDPOINT in artifact-source.html / index.html.
 */

var SHEET_NAME = "orders";
var HEADERS = ["received", "id", "initials", "country", "countryName", "flag", "size", "email", "krBank", "payMethod", "question", "page"];

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty("SS_ID");
  var ss = null;
  if (ssId) { try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create("HYU Jacket Orders");
    props.setProperty("SS_ID", ss.getId());
  }
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }
  return sh;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var sh = getSheet_();
    var row = [
      new Date(),
      data.id || "", data.initials || "", data.country || "", data.countryName || "", data.flag || "",
      data.size || "", data.email || "", data.krBank || "", data.payMethod || "", data.question || "", data.page || ""
    ];
    // update existing row for the same id, otherwise append
    var last = sh.getLastRow();
    var target = 0;
    if (data.id && last > 1) {
      var ids = sh.getRange(2, 2, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) { if (ids[i][0] === data.id) { target = i + 2; break; } }
    }
    if (target) sh.getRange(target, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return json_({ ok: true, updated: !!target });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  var sh = getSheet_();
  return json_({ ok: true, sheet: sh.getParent().getUrl(), rows: Math.max(0, sh.getLastRow() - 1) });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

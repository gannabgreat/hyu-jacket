/**
 * HANYANG VARSITY JACKET — order intake
 *
 * Receives one order per POST from https://gannabgreat.github.io/hyu-jacket/
 * and writes it to the bound spreadsheet. Nothing here ever reads data back
 * out: there is no doGet, so the deployment URL cannot be used to dump the
 * sheet. Keep the spreadsheet itself private (do NOT turn on link sharing) —
 * that is what actually keeps the entries yours only.
 *
 * Setup: Extensions > Apps Script from the sheet, paste this, Deploy > New
 * deployment > Web app, "Execute as: Me", "Who has access: Anyone".
 */

// Must match SHARED_TOKEN in the page. Not a secret (the page is public);
// it only drops bots that hit the URL without reading the page first.
var TOKEN = 'hyu-jacket-2026';

// Leave empty to mail the account that owns this script.
var NOTIFY_EMAIL = '';

// The spreadsheet this writes to. Addressed by id rather than
// getActiveSpreadsheet() so the script works standalone as well as bound.
var SHEET_ID     = '1Pv1dVRG_HAVH3epj4tRk_AdW1c7rGU5Oz1oo5OiIH-4';
var SHEET_NAME   = 'orders';
var PER_ID_MS    = 20 * 1000;  // same browser: one write per 20s
var FLOOD_MAX    = 20;         // everyone together: max writes per minute
var MAX_LEN      = 300;        // per field, question gets 4x

var HEADERS = ['접수시각', 'id', '이니셜', '국기코드', '국가', '사이즈',
               '이메일', '한국계좌', '결제수단', '질문', '개인정보동의', '동의시각',
               '유입페이지', '수정횟수'];

function doGet() {
  // No read path on purpose.
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'not available' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (body.token !== TOKEN) return json({ ok: false, error: 'bad token' });
    if (body.website) return json({ ok: true });                 // honeypot: swallow silently
    // Consent is the legal basis for holding these entries: no consent, no row.
    if (!body.consent) return json({ ok: false, error: 'consent required' });
    var id = clean(body.id);
    if (!id) return json({ ok: false, error: 'missing id' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email || ''))) {
      return json({ ok: false, error: 'bad email' });
    }

    var cache = CacheService.getScriptCache();
    if (cache.get('rl_' + id)) return json({ ok: false, error: 'too fast' });

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return json({ ok: false, error: 'busy' });

    try {
      var minute = 'flood_' + Math.floor(Date.now() / 60000);
      var seen = Number(cache.get(minute) || 0);
      if (seen >= FLOOD_MAX) return json({ ok: false, error: 'rate limited' });
      cache.put(minute, String(seen + 1), 120);
      cache.put('rl_' + id, '1', Math.ceil(PER_ID_MS / 1000));

      var sheet = getSheet();
      var row = [
        new Date(), id,
        clean(body.initials), clean(body.flag), clean(body.countryName), clean(body.size),
        clean(body.email), clean(body.krBank), clean(body.payMethod),
        clean(body.question, MAX_LEN * 4), clean(body.consent), clean(body.consentTs),
        clean(body.page), 0
      ];

      var at = findRow(sheet, id);
      var updated = false;
      if (at > 0) {
        // Same browser sending again = an edit, not a new order. Keep one row per person.
        var edits = Number(sheet.getRange(at, HEADERS.length).getValue() || 0) + 1;
        row[HEADERS.length - 1] = edits;
        sheet.getRange(at, 1, 1, HEADERS.length).setValues([row]);
        updated = true;
      } else {
        sheet.appendRow(row);
        confirmToApplicant(row);
      }

      notify(row, updated, sheet.getLastRow() - 1);
      return json({ ok: true, updated: updated });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function notify(row, updated, total) {
  var to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;
  var lines = [];
  for (var i = 0; i < HEADERS.length; i++) lines.push(HEADERS[i] + ': ' + row[i]);
  lines.push('', '누적 신청: ' + total + '명');
  try {
    MailApp.sendEmail(to,
      (updated ? '[자켓] 신청 수정 — ' : '[자켓] 새 신청 — ') + row[5] + ' / ' + row[4],
      lines.join('\n'));
  } catch (err) {
    // Mail quota is not a reason to lose the row.
  }
}

// Receipt for the person who filled the form. English only on purpose: one
// message goes out to two dozen first languages and English is the shared one.
function confirmToApplicant(row) {
  var to = String(row[6] || '');
  if (!to) return;
  var body = [
    'Hi,',
    '',
    'Thanks for taking part in the interest check for the Hanyang varsity jacket group order.',
    '',
    'Your entry is on the list. As soon as the order is confirmed we will email you at this address with the payment and pick-up details.',
    '',
    'What we have for you',
    '  Size        : ' + (row[5] || '-'),
    '  Flag        : ' + (row[4] || '-'),
    '  Sleeve text : ' + (row[2] || '(none)'),
    '  Korean bank : ' + (row[7] || '-'),
    '',
    'Nothing is charged yet and nothing is final. If any of the above is wrong,',
    'just reply to this email and we will fix it.',
    '',
    'Hanyang Varsity Jacket group order',
    'wpalskdl03@gmail.com'
  ].join('\n');
  try {
    MailApp.sendEmail({
      to: to,
      subject: 'Hanyang varsity jacket - thanks for joining the interest check',
      body: body,
      name: 'Hanyang Varsity Jacket'
    });
  } catch (err) {
    // Mail quota is not a reason to lose the row.
  }
}

function clean(v, max) {
  return String(v == null ? '' : v).slice(0, max || MAX_LEN);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

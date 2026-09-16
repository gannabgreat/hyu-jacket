/**
 * HANYANG VARSITY JACKET — order intake
 *
 * Receives one order per POST from https://hyu-jacket.pages.dev/
 * (the github.io and netlify.app copies of the page post here too).
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

// The spreadsheet this writes to. Addressed by id rather than
// getActiveSpreadsheet() so the script works standalone as well as bound.
var SHEET_ID     = '1Pv1dVRG_HAVH3epj4tRk_AdW1c7rGU5Oz1oo5OiIH-4';
// New sheet from 2026-09-16: the old 'orders' tab keeps the entries taken
// while this was an interest check, on the old columns. Nothing writes there now.
var SHEET_NAME   = 'orders2';
var PER_ID_MS    = 20 * 1000;  // same browser: one write per 20s
var FLOOD_MAX    = 20;         // everyone together: max writes per minute
var MAX_LEN      = 300;        // per field, question gets 4x

var HEADERS = ['접수시각', 'id', '이니셜', '국기코드', '국가', '사이즈',
               '이메일', '결제수단', '배송', '합계', '질문', '개인정보동의', '동의시각',
               '유입페이지', '수정횟수'];

// What an order costs. The page shows the same numbers; keep them in step.
var BASE_PRICE = 65000;
var FLAG_FEE   = 3000;   // only when a flag is actually chosen
var SHIP_FEE   = 5000;   // only when they want it delivered
// The two biggest sizes take more fabric and the factory charges for it.
var SIZE_FEES  = { '4XL': 5000, '5XL': 10000 };

// Where the money goes. Sent to each applicant in the receipt mail, not on the page.
var BANK_NAME   = 'KB Kookmin Bank';
var BANK_CODE   = '004';
var BANK_ACCOUNT = '94160201367661';
var BANK_HOLDER = '안현서 (Ahn Hyunseo)';

function orderTotal(countryCode, delivery, size) {
  var flag = countryCode && countryCode !== 'NONE' ? FLAG_FEE : 0;
  var ship = delivery === 'delivery' ? SHIP_FEE : 0;
  var big  = SIZE_FEES[String(size || '').toUpperCase()] || 0;
  return { flag: flag, ship: ship, size: big, total: BASE_PRICE + flag + ship + big };
}

function won(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' KRW';
}

// The hoody is a separate interest list: email only, its own tab.
var HOODY_SHEET  = 'hoody';
var HOODY_HEADERS = ['접수시각', '이메일', '유입페이지'];

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
    if (body.list === 'hoody') return hoodySignup(body);         // email-only waiting list
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
      var cost = orderTotal(clean(body.country), clean(body.delivery), clean(body.size));
      var row = [
        new Date(), id,
        clean(body.initials), clean(body.flag), clean(body.countryName), clean(body.size),
        clean(body.email), clean(body.payMethod), clean(body.delivery), cost.total,
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
        confirmToApplicant(row, cost);
      }

      return json({ ok: true, updated: updated });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Email-only sign-ups for the hoody. One row per address, no consent box:
// the page asks for nothing but the address and says what it is used for.
function hoodySignup(body) {
  var email = String(body.email || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'bad email' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json({ ok: false, error: 'busy' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(HOODY_SHEET) || ss.insertSheet(HOODY_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HOODY_HEADERS);
      sheet.getRange(1, 1, 1, HOODY_HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    var last = sheet.getLastRow();
    if (last > 1) {
      var seen = sheet.getRange(2, 2, last - 1, 1).getValues();
      for (var i = 0; i < seen.length; i++) {
        // already on the list: say yes without writing the address twice
        if (String(seen[i][0]).toLowerCase() === email.toLowerCase()) {
          return json({ ok: true, duplicate: true });
        }
      }
    }
    sheet.appendRow([new Date(), clean(email), clean(body.page)]);
    return json({ ok: true });
  } finally {
    lock.releaseLock();
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

// The only mail this script sends. No organizer copy: everything is in the
// sheet, and one mail per entry keeps the 100/day consumer quota at 100 entries.
// Receipt for the person who filled the form. English only on purpose: one
// message goes out to two dozen first languages and English is the shared one.
function confirmToApplicant(row, cost) {
  var to = String(row[6] || '');
  if (!to) return;
  var delivered = row[8] === 'delivery';
  var body = [
    'Hi,',
    '',
    'Thanks for joining the Hanyang varsity jacket group order.',
    '',
    'Your order is recorded.',
    '',
    'What we have for you',
    '  Size        : ' + (row[5] || '-'),
    '  Flag        : ' + (row[4] || '-'),
    '  Sleeve text : ' + (row[2] || '(none)'),
    '  Pay via     : ' + (row[7] || '-'),
    '  Delivery    : ' + (delivered ? 'to your address' : 'campus pick-up'),
    '',
    'What you pay',
    '  Jacket      : ' + won(BASE_PRICE),
    '  Size        : ' + (cost.size ? row[5] + ', +' + won(cost.size) + ' (more fabric)' : 'no extra charge'),
    '  Flag patch  : ' + (cost.flag ? '+' + won(cost.flag) : 'none'),
    '  Delivery    : ' + (cost.ship ? '+' + won(cost.ship) : 'campus pick-up, included'),
    '  ---------------------------------',
    '  TOTAL       : ' + won(cost.total),
    '',
    'How to pay',
    '  Bank        : ' + BANK_NAME + ' (bank code ' + BANK_CODE + ')',
    '  Account     : ' + BANK_ACCOUNT,
    '  Account name: ' + BANK_HOLDER,
    '  Amount      : ' + won(cost.total),
    '',
    'Please send it under your own name, or reply to this mail with the name you',
    'transferred under, so we can match your payment to your order.',
    '',
    'Prefer cash? Bring it to us in person in front of the International Building',
    '(국제관), Wednesday to Friday during lunch time.',
    '',
    'A flag patch is only produced when 8 or more people pick the same flag. If your',
    'flag does not reach 8, we will write to you before anything is charged.',
    '',
    'Any question, just reply to this mail.',
    '',
    'Hanyang Varsity Jacket group order',
    'wpalskdl03@gmail.com'
  ].join('\n');
  try {
    MailApp.sendEmail({
      to: to,
      subject: 'Hanyang varsity jacket - your order and how to pay',
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

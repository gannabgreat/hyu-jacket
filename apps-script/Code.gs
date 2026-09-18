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
var FLAG_FEE   = 5000;   // only when a flag is actually chosen
var SHIP_FEE   = 3000;   // only when they want it delivered
// The two biggest sizes take more fabric and the factory charges for it.
var SIZE_FEES  = { '4XL': 5000, '5XL': 10000 };

// Where the money goes. Sent to each applicant in the receipt mail, not on the page.
var BANK_NAME   = 'KB Kookmin Bank';
var BANK_CODE   = '004';
var BANK_SWIFT  = 'CZNBKRSE';   // for transfers sent from outside Korea
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
        confirmToApplicant(row, cost, clean(body.lang));
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
// Same shape as the mail the first batch of applicants got, so everyone reads
// the same numbers. Chinese when the page was in Chinese, English otherwise.
var PAY_DEADLINE    = 'Friday, 18 September';
var PAY_DEADLINE_ZH = '9 月 18 日（周五）';
var PAY_DEADLINE_TW = '9 月 18 日（週五）';

function money(n) { return won(n); }

function receiptEn(row, cost, delivered) {
  var lines = [
    'Hi' + (row[2] ? ' ' + row[2] : '') + ',',
    '',
    'Thanks for joining the Hanyang varsity jacket group order - your order is recorded.',
    '',
    '  Jacket          : 65,000 KRW',
    '  Flag patch      : +5,000 KRW   (no country reached 8 people, so every patch has',
    '                    to be made on its own :( )',
    '  4XL / 5XL       : +5,000 / +10,000 KRW  (they take more fabric)',
    '  Campus pick-up  : included',
    '  Delivery        : +3,000 KRW',
    '',
    'What you signed up for',
    '  Size        : ' + (row[5] || '-'),
    '  Flag        : ' + (row[4] || 'no flag'),
    '  Sleeve text : ' + (row[2] || '(none)'),
    '  Getting it  : ' + (delivered ? 'delivery to your address' : 'campus pick-up'),
    '',
    'What you pay',
    '  Jacket      : ' + money(BASE_PRICE),
    '  Size        : ' + (cost.size ? row[5] + ', +' + money(cost.size) : 'no extra charge'),
    '  Flag patch  : ' + (cost.flag ? '+' + money(cost.flag) : 'none'),
    '  Delivery    : ' + (cost.ship ? '+' + money(cost.ship) : 'campus pick-up, included'),
    '  ---------------------------------',
    '  TOTAL       : ' + money(cost.total),
    '',
    'How to pay (by ' + PAY_DEADLINE + ' please)',
    '  Bank        : ' + BANK_NAME + ' (bank code ' + BANK_CODE + ')',
    '  SWIFT/BIC   : ' + BANK_SWIFT + '  (only needed from outside Korea)',
    '  Account     : ' + BANK_ACCOUNT,
    '  Account name: ' + BANK_HOLDER,
    '  Amount      : ' + money(cost.total),
    '',
    'Please send it under your own name, or reply with the name you transferred under.',
    '',
    'Prefer cash? Write to us first so we can arrange it.',
    '',
    'Our page (the only one that is up to date): https://hyu-jacket.pages.dev',
    'Share it with friends who want to take a piece of Hanyang home with them!',
    '',
    'Any question, just reply to this mail.',
    '',
    'Hanyang Varsity Jacket group order',
    'wpalskdl03@gmail.com'
  ];
  return lines.join('\n');
}

function receiptZh(row, cost, delivered, trad) {
  var W = trad ? '韓元' : '韩元';
  function amt(n) { return money(n).replace(' KRW', ' ' + W); }
  var CN = trad ? { 'China': '中國', 'Taiwan': '台灣', 'Korea': '韓國' }
                : { 'China': '中国', 'Taiwan': '台湾', 'Korea': '韩国' };
  var flag = row[4] ? (CN[row[4]] || row[4]) : '';
  var t = trad ? {
    hi: '你好', lead: '感謝你參加漢陽大學棒球外套團購，你的訂單已登記。',
    jacket: '外套', flagRow: '國旗貼布', big: '4XL / 5XL', pickup: '校內領取', deliver: '快遞配送',
    free: '免費', flagNote: '（沒有任何國家達到 8 人，每塊貼布都要單獨製作 :( ）', fabric: '（用料更多）',
    signed: '你的申請內容', sz: '尺碼', fl: '國旗', sleeve: '袖子文字', get: '領取方式',
    getPick: '校內領取', getDeliver: '快遞配送到你的地址', noflag: '不要國旗', none: '（無）',
    pay: '你需要支付', sizeRow: '尺碼追加', noExtra: '無追加費用', nothing: '無',
    included: '校內領取，已包含', total: '合計',
    how: '付款方式（請在 ' + PAY_DEADLINE_TW + ' 前完成）',
    bank: '銀行', bankName: 'KB 國民銀行（銀行代碼 004）', swiftNote: '（僅境外匯款需要）',
    acc: '帳號', holder: '戶名', amount: '金額',
    name: '請用你本人的名字轉帳，或回信告訴我們匯款人姓名。',
    cash: '想用現金支付？請先聯絡我們安排。',
    site: '我們的網站（只有這個是最新的）：https://hyu-jacket.pages.dev',
    share: '把這個網站分享給想把漢陽帶回家的朋友吧！',
    ask: '有任何問題，直接回覆這封郵件即可。', sign: '漢陽大學棒球外套團購'
  } : {
    hi: '你好', lead: '感谢你参加汉阳大学棒球外套团购，你的订单已登记。',
    jacket: '外套', flagRow: '国旗贴布', big: '4XL / 5XL', pickup: '校内领取', deliver: '快递配送',
    free: '免费', flagNote: '（没有任何国家达到 8 人，每块贴布都要单独制作 :( ）', fabric: '（用料更多）',
    signed: '你的申请内容', sz: '尺码', fl: '国旗', sleeve: '袖子文字', get: '领取方式',
    getPick: '校内领取', getDeliver: '快递配送到你的地址', noflag: '不要国旗', none: '（无）',
    pay: '你需要支付', sizeRow: '尺码追加', noExtra: '无追加费用', nothing: '无',
    included: '校内领取，已包含', total: '合计',
    how: '付款方式（请在 ' + PAY_DEADLINE_ZH + ' 前完成）',
    bank: '银行', bankName: 'KB 国民银行（银行代码 004）', swiftNote: '（仅境外汇款需要）',
    acc: '账号', holder: '户名', amount: '金额',
    name: '请用你本人的名字转账，或回信告诉我们汇款人姓名。',
    cash: '想用现金支付？请先联系我们安排。',
    site: '我们的网站（只有这个是最新的）：https://hyu-jacket.pages.dev',
    share: '把这个网站分享给想把汉阳带回家的朋友吧！',
    ask: '有任何问题，直接回复这封邮件即可。', sign: '汉阳大学棒球外套团购'
  };
  var lines = [
    t.hi + (row[2] ? ' ' + row[2] : '') + '，',
    '',
    t.lead,
    '',
    '  ' + t.jacket + '       : ' + amt(BASE_PRICE),
    '  ' + t.flagRow + '   : +' + amt(FLAG_FEE) + ' ' + t.flagNote,
    '  ' + t.big + '  : +5,000 / +10,000 ' + W + ' ' + t.fabric,
    '  ' + t.pickup + '   : ' + t.free,
    '  ' + t.deliver + '   : +' + amt(SHIP_FEE),
    '',
    t.signed,
    '  ' + t.sz + '      : ' + (row[5] || '-'),
    '  ' + t.fl + '      : ' + (flag || t.noflag),
    '  ' + t.sleeve + '  : ' + (row[2] || t.none),
    '  ' + t.get + '  : ' + (delivered ? t.getDeliver : t.getPick),
    '',
    t.pay,
    '  ' + t.jacket + '      : ' + amt(BASE_PRICE),
    '  ' + t.sizeRow + '  : ' + (cost.size ? row[5] + '，+' + amt(cost.size) : t.noExtra),
    '  ' + t.flagRow + '  : ' + (cost.flag ? '+' + amt(cost.flag) : t.nothing),
    '  ' + t.deliver + '  : ' + (cost.ship ? '+' + amt(cost.ship) : t.included),
    '  ---------------------------------',
    '  ' + t.total + '      : ' + amt(cost.total),
    '',
    t.how,
    '  ' + t.bank + '      : ' + t.bankName,
    '  SWIFT/BIC : ' + BANK_SWIFT + ' ' + t.swiftNote,
    '  ' + t.acc + '      : ' + BANK_ACCOUNT,
    '  ' + t.holder + '      : ' + BANK_HOLDER,
    '  ' + t.amount + '      : ' + amt(cost.total),
    '',
    t.name,
    '',
    t.cash,
    '',
    t.site,
    t.share,
    '',
    t.ask,
    '',
    t.sign,
    'wpalskdl03@gmail.com'
  ];
  return lines.join('\n');
}

/* 2026-09-18 17:00 부로 1차 주문 마감. 공장에 명단이 넘어간 뒤로는 새 신청을
   받아도 이번 차수에 넣을 수 없어서, 접수 확인 대신 마감 안내를 보낸다.
   시트에는 그대로 기록된다 — 2차를 열 때 이 사람들에게 먼저 연락하려는 것이다.
   2차를 열면 이 값을 false 로 되돌리면 원래 접수 메일이 다시 나간다. */
var ORDERS_CLOSED = true;

function closedBody_(zh) {
  if (zh) {
    return [
      '你好，',
      '',
      '感谢你的申请。很抱歉——这次团购已经截止了。名单已经在 2026年9月18日 送到工厂，制作已经开始，所以没办法再把你的外套加进这一批。',
      '',
      '你不需要支付任何费用，我们也不会向你收款。',
      '',
      '如果之后开第二次团购，我们会第一时间给你发邮件，让你比其他人先报名。你的申请我们已经留着了。',
      '',
      '我们的网站：https://hyu-jacket.pages.dev',
      '',
      '- 汉阳大学棒球外套团购'
    ].join('\n');
  }
  return [
    'Hi,',
    '',
    'Thank you for signing up. I am sorry to say the group order has already closed - the list went to the factory on 18 September 2026 and production has started, so your jacket cannot be added to this round.',
    '',
    'Nothing is owed and nothing will be charged.',
    '',
    'If we run a second round, we will email you first so you can join before anyone else. Your entry is kept on the list.',
    '',
    'Our website: https://hyu-jacket.pages.dev',
    '',
    '- Hanyang varsity jacket group order'
  ].join('\n');
}

function confirmToApplicant(row, cost, lang) {
  var to = String(row[6] || '');
  if (!to) return;
  var code = String(lang || '').toLowerCase();
  if (ORDERS_CLOSED) {
    var zh = code.indexOf('zh') === 0;
    try {
      MailApp.sendEmail({
        to: to,
        subject: zh ? '汉阳大学棒球外套团购 - 本次团购已截止' : 'Hanyang varsity jacket - orders are now closed',
        body: closedBody_(zh),
        name: 'Hanyang Varsity Jacket'
      });
    } catch (err) {
      // Mail quota is not a reason to lose the row.
    }
    return;
  }
  var delivered = row[8] === 'delivery';
  var subject, body;
  if (code === 'zh-tw' || code === 'zh-hant') {
    subject = '漢陽大學棒球外套團購 - 訂單已登記，這是你的金額';
    body = receiptZh(row, cost, delivered, true);
  } else if (code.indexOf('zh') === 0) {
    subject = '汉阳大学棒球外套团购 - 订单已登记，这是你的金额';
    body = receiptZh(row, cost, delivered, false);
  } else {
    subject = 'Hanyang varsity jacket - your order and how to pay';
    body = receiptEn(row, cost, delivered);
  }
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'Hanyang Varsity Jacket' });
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

/**
 * Payment confirmation - run from the Apps Script editor when the organizer
 * says a transfer has arrived. Paste this below Code.gs, fill PAID, run
 * sendPaidConfirmations(), then delete it again (the editor holds the live
 * web app, so nothing one-off should stay there).
 *
 * It reads the order out of the 'orders2' tab by email, so the size, flag and
 * amount in the mail are the ones actually recorded - nothing retyped by hand.
 * Chinese is sent when the row's 유입페이지 says the page was in Chinese, or
 * when the address is on a Chinese provider; override with lang if needed.
 */
var PAID = [
  // { email: 'someone@example.com', amount: 70000 },            // amount optional: falls back to 합계
  // { email: 'someone@qq.com', amount: 70000, lang: 'zh' },     // 'zh' | 'zh-TW' | 'en'
];

function paidRow(email) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  var v = sh.getDataRange().getValues();
  if (v.length < 2) throw new Error(SHEET_NAME + ' unreadable');   // empty is "could not read", not "no orders"
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][6]).trim().toLowerCase() === email.trim().toLowerCase()) return v[i];
  }
  throw new Error('no order row for ' + email);
}

function paidBodyEn(row, amount) {
  return [
    'Hi' + (row[2] ? ' ' + row[2] : '') + ',',
    '',
    'Your payment of ' + won(amount) + ' has arrived - your jacket is confirmed.',
    '',
    '  Size        : ' + (row[5] || '-'),
    '  Flag        : ' + (row[4] || 'no flag'),
    '  Sleeve text : ' + (row[2] || '(none)'),
    '  Getting it  : ' + (row[8] === 'delivery' ? 'delivery to your address' : 'campus pick-up'),
    '',
    'We will write again when it is ready.',
    '',
    'Please help spread the word to your friends!',
    'https://hyu-jacket.pages.dev',
    '',
    'Hanyang Varsity Jacket group order',
    'wpalskdl03@gmail.com'
  ].join('\n');
}

function paidBodyZh(row, amount, trad) {
  var W = trad ? '韓元' : '韩元';
  var CN = trad ? { 'China': '中國', 'Taiwan': '台灣', 'Korea': '韓國' }
                : { 'China': '中国', 'Taiwan': '台湾', 'Korea': '韩国' };
  var flag = row[4] ? (CN[row[4]] || row[4]) : (trad ? '不要國旗' : '不要国旗');
  var amt = won(amount).replace(' KRW', ' ' + W);
  return trad ? [
    '你好' + (row[2] ? ' ' + row[2] : '') + '，',
    '',
    '我們已收到你的款項 ' + amt + '，你的外套已確認。',
    '',
    '  尺碼      : ' + (row[5] || '-'),
    '  國旗      : ' + flag,
    '  袖子文字  : ' + (row[2] || '（無）'),
    '  領取方式  : ' + (row[8] === 'delivery' ? '快遞配送到你的地址' : '校內領取'),
    '',
    '製作完成後我們會再通知你。',
    '',
    '也請幫我們告訴你的朋友！',
    'https://hyu-jacket.pages.dev',
    '',
    '漢陽大學棒球外套團購',
    'wpalskdl03@gmail.com'
  ].join('\n') : [
    '你好' + (row[2] ? ' ' + row[2] : '') + '，',
    '',
    '我们已收到你的款项 ' + amt + '，你的外套已确认。',
    '',
    '  尺码      : ' + (row[5] || '-'),
    '  国旗      : ' + flag,
    '  袖子文字  : ' + (row[2] || '（无）'),
    '  领取方式  : ' + (row[8] === 'delivery' ? '快递配送到你的地址' : '校内领取'),
    '',
    '制作完成后我们会再通知你。',
    '',
    '也请帮我们告诉你的朋友！',
    'https://hyu-jacket.pages.dev',
    '',
    '汉阳大学棒球外套团购',
    'wpalskdl03@gmail.com'
  ].join('\n');
}

function guessLang(row) {
  if (/lang=zh-TW/i.test(String(row[13]))) return 'zh-TW';
  if (/lang=zh/i.test(String(row[13]))) return 'zh';
  if (/@(qq|163|126)\.com$/i.test(String(row[6]))) return 'zh';
  return 'en';
}

function sendPaidConfirmations() {
  var sent = 0, failed = [];
  for (var i = 0; i < PAID.length; i++) {
    var p = PAID[i];
    try {
      var row = paidRow(p.email);
      var amount = p.amount || Number(row[9]) || 0;
      if (!amount) throw new Error('no amount for ' + p.email);
      var lang = p.lang || guessLang(row);
      var subject, body;
      if (lang === 'zh-TW') { subject = '漢陽大學棒球外套團購 - 已收到款項'; body = paidBodyZh(row, amount, true); }
      else if (lang === 'zh') { subject = '汉阳大学棒球外套团购 - 已收到款项'; body = paidBodyZh(row, amount, false); }
      else { subject = 'Hanyang varsity jacket - payment received'; body = paidBodyEn(row, amount); }
      MailApp.sendEmail({ to: p.email, subject: subject, body: body, name: 'Hanyang Varsity Jacket' });
      sent++;
    } catch (err) {
      failed.push(p.email + ': ' + err);
    }
  }
  Logger.log('sent=' + sent + ' failed=' + JSON.stringify(failed));
}

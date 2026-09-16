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
  // { email: 'someone@example.com', amount: 70000 },        // amount optional: falls back to 합계
  // { email: 'someone@qq.com', amount: 70000, lang: 'zh' }, // 'zh' | 'zh-TW' | 'en'
];

// Looks in both tabs and maps columns by their header name, because the old
// 'orders' tab (interest-check era) and the new 'orders2' tab have different
// column orders. Never guess an index.
function paidRow(email) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var tabs = [SHEET_NAME, 'orders'];
  for (var t = 0; t < tabs.length; t++) {
    var sh = ss.getSheetByName(tabs[t]);
    if (!sh) continue;
    var v = sh.getDataRange().getValues();
    if (v.length < 2) continue;
    var head = v[0].map(function(h){ return String(h).trim(); });
    function col(name) { var i = head.indexOf(name); return i; }
    var cEmail = col('이메일');
    if (cEmail < 0) continue;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][cEmail]).trim().toLowerCase() === email.trim().toLowerCase()) {
        return {
          tab: tabs[t], rowIndex: i + 1,
          sleeve: String(v[i][col('이니셜')] || ''),
          flag: String(v[i][col('국가')] || ''),
          size: String(v[i][col('사이즈')] || ''),
          delivery: col('배송') >= 0 ? String(v[i][col('배송')] || '') : '',
          total: col('합계') >= 0 ? Number(v[i][col('합계')]) || 0 : 0,
          page: col('유입페이지') >= 0 ? String(v[i][col('유입페이지')] || '') : '',
          email: String(v[i][cEmail])
        };
      }
    }
  }
  throw new Error('no order row for ' + email);
}

function paidBodyEn(r, amount) {
  return [
    'Hi' + (r.sleeve ? ' ' + r.sleeve : '') + ',',
    '',
    'Your payment of ' + won(amount) + ' has arrived - your jacket is confirmed.',
    '',
    '  Size        : ' + (r.size || '-'),
    '  Flag        : ' + (r.flag || 'no flag'),
    '  Sleeve text : ' + (r.sleeve || '(none)'),
    '  Getting it  : ' + (r.delivery === 'delivery' ? 'delivery to your address' : 'campus pick-up'),
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

function paidBodyZh(r, amount, trad) {
  var W = trad ? '韓元' : '韩元';
  var CN = trad ? { 'China': '中國', 'Taiwan': '台灣', 'Korea': '韓國' }
                : { 'China': '中国', 'Taiwan': '台湾', 'Korea': '韩国' };
  var flag = r.flag ? (CN[r.flag] || r.flag) : (trad ? '不要國旗' : '不要国旗');
  var amt = won(amount).replace(' KRW', ' ' + W);
  return trad ? [
    '你好' + (r.sleeve ? ' ' + r.sleeve : '') + '，',
    '',
    '我們已收到你的款項 ' + amt + '，你的外套已確認。',
    '',
    '  尺碼      : ' + (r.size || '-'),
    '  國旗      : ' + flag,
    '  袖子文字  : ' + (r.sleeve || '（無）'),
    '  領取方式  : ' + (r.delivery === 'delivery' ? '快遞配送到你的地址' : '校內領取'),
    '',
    '製作完成後我們會再通知你。',
    '',
    '也請幫我們告訴你的朋友！',
    'https://hyu-jacket.pages.dev',
    '',
    '漢陽大學棒球外套團購',
    'wpalskdl03@gmail.com'
  ].join('\n') : [
    '你好' + (r.sleeve ? ' ' + r.sleeve : '') + '，',
    '',
    '我们已收到你的款项 ' + amt + '，你的外套已确认。',
    '',
    '  尺码      : ' + (r.size || '-'),
    '  国旗      : ' + flag,
    '  袖子文字  : ' + (r.sleeve || '（无）'),
    '  领取方式  : ' + (r.delivery === 'delivery' ? '快递配送到你的地址' : '校内领取'),
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

function guessLang(r) {
  if (/lang=zh-TW/i.test(r.page)) return 'zh-TW';
  if (/lang=zh/i.test(r.page)) return 'zh';
  if (/@(qq|163|126)\.com$/i.test(r.email)) return 'zh';
  return 'en';
}

function sendPaidConfirmations() {
  var sent = 0, failed = [];
  for (var i = 0; i < PAID.length; i++) {
    var p = PAID[i];
    try {
      var rec = paidRow(p.email);
      var amount = p.amount || rec.total || 0;
      if (!amount) throw new Error('no amount for ' + p.email);
      var lang = p.lang || guessLang(rec);
      var subject, body;
      if (lang === 'zh-TW') { subject = '漢陽大學棒球外套團購 - 已收到款項'; body = paidBodyZh(rec, amount, true); }
      else if (lang === 'zh') { subject = '汉阳大学棒球外套团购 - 已收到款项'; body = paidBodyZh(rec, amount, false); }
      else { subject = 'Hanyang varsity jacket - payment received'; body = paidBodyEn(rec, amount); }
      MailApp.sendEmail({ to: p.email, subject: subject, body: body, name: 'Hanyang Varsity Jacket' });
      sent++;
    } catch (err) {
      failed.push(p.email + ': ' + err);
    }
  }
  Logger.log('sent=' + sent + ' failed=' + JSON.stringify(failed));
}

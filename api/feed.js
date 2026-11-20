// Đọc feed RSS/Atom của Google Alerts (và các feed RSS khác được phép).
// Dùng cho nguồn "Facebook qua Google" trong tab Săn Máy.
// Chạy trên Vercel: tệp ở api/feed.js thành địa chỉ /api/feed?url=...
//
// Chỉ cho phép vài tên miền feed, để địa chỉ này không bị người khác lợi dụng
// làm trạm trung chuyển gọi lung tung.

const ALLOW = [
  'www.google.com',      // Google Alerts
  'google.com',
  'news.google.com',
  'nhattao.com',
  'rsshub.app'
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

// Google Alerts bọc liên kết qua google.com/url?...&url=<thật>
function realUrl(u) {
  try {
    const x = new URL(u);
    if (x.hostname.endsWith('google.com') && x.pathname === '/url') {
      const real = x.searchParams.get('url') || x.searchParams.get('q');
      if (real) return real;
    }
  } catch (e) { /* bỏ qua */ }
  return u;
}

function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<(entry|item)[\s>][\s\S]*?<\/\1>/gi) || [];
  blocks.forEach((b) => {
    const title = strip((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    let link = strip((b.match(/<link[^>]*href="([^"]+)"/i) || [])[1]) ||
               strip((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    const body = strip((b.match(/<content[^>]*>([\s\S]*?)<\/content>/i) || [])[1]) ||
                 strip((b.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1]) ||
                 strip((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1]);
    const date = strip((b.match(/<published>([\s\S]*?)<\/published>/i) || [])[1]) ||
                 strip((b.match(/<updated>([\s\S]*?)<\/updated>/i) || [])[1]) ||
                 strip((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1]);
    if (!title || !link) return;
    const url = realUrl(link);
    items.push({
      id: 'gg' + (url.replace(/\W+/g, '').slice(-24) || items.length),
      title, body, url,
      price: 0, priceText: '', area: '', seller: '',
      time: date || null,
      src: 'facebook'
    });
  });
  return items;
}

module.exports = async function handler(req, res) {
  const raw = String(req.query?.url || '');
  const debug = String(req.query?.debug || '') === '1';
  if (!raw) { res.status(400).json({ error: 'thiếu tham số url' }); return; }

  let u;
  try { u = new URL(raw); } catch (e) { res.status(400).json({ error: 'địa chỉ feed không hợp lệ' }); return; }
  if (u.protocol !== 'https:' || !ALLOW.includes(u.hostname)) {
    res.status(400).json({ error: 'chỉ nhận feed từ: ' + ALLOW.join(', ') });
    return;
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'application/atom+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8' }
    });
    if (!r.ok) { res.status(502).json({ error: 'HTTP ' + r.status + ' khi lấy feed' }); return; }
    const xml = await r.text();
    const items = parseFeed(xml);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json({
      count: items.length,
      items,
      ...(debug ? { bytes: xml.length, head: xml.slice(0, 300), sample: items.slice(0, 3) } : {})
    });
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? 'quá hạn chờ' : String((err && err.message) || err);
    res.status(502).json({ error: msg });
  } finally {
    clearTimeout(t);
  }
};

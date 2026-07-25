// Vercel serverless function — proxies Yahoo Finance's chart endpoint server-side.
// Yahoo Finance sends no Access-Control-Allow-Origin header, so it can't be
// called directly from a browser at all. Server-to-server requests have no
// CORS restriction, so this function fetches on the app's behalf and adds
// its own CORS header for the frontend to read.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol, range, interval } = req.query;
  if (!symbol || typeof symbol !== 'string') {
    res.status(400).json({ error: 'Missing symbol query param' });
    return;
  }

  // range/interval (ไม่บังคับ) — ใช้ดึงแท่งเทียนรายวัน เช่น ?range=7d&interval=1d
  const qs = [];
  if (typeof range === 'string' && /^[0-9]+[dmoy]+$/.test(range)) qs.push(`range=${range}`);
  if (typeof interval === 'string' && /^[0-9]+[dmowk]+$/.test(interval)) qs.push(`interval=${interval}`);
  const query = qs.length ? `?${qs.join('&')}` : '';

  try {
    const yahooRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}${query}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await yahooRes.json();
    res.status(yahooRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Yahoo Finance' });
  }
}

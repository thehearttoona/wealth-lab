// Vercel serverless function — proxies Yahoo Finance's chart endpoint server-side.
// Yahoo Finance sends no Access-Control-Allow-Origin header, so it can't be
// called directly from a browser at all. Server-to-server requests have no
// CORS restriction, so this function fetches on the app's behalf and adds
// its own CORS header for the frontend to read.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol } = req.query;
  if (!symbol || typeof symbol !== 'string') {
    res.status(400).json({ error: 'Missing symbol query param' });
    return;
  }

  try {
    const yahooRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await yahooRes.json();
    res.status(yahooRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Yahoo Finance' });
  }
}

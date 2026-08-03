// Vercel serverless function — proxies Twelve Data so the API key never ships
// to the browser. The key used to be hardcoded in src/services/priceApi.ts,
// which meant anyone could read it out of the deployed bundle and burn the quota.
//
// Set TWELVE_DATA_API_KEY in the Vercel project env vars. The literal below is
// the old (already public) key, kept only so prices keep working until the env
// var is set — rotate it and drop the fallback.
const FALLBACK_KEY = '1d533ad623aa46eea821c919e473d051';

// Only the two endpoints the app actually uses — never proxy an arbitrary path,
// that would turn this function into an open relay for the account's quota.
const ALLOWED = new Set(['quote', 'symbol_search']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { endpoint, symbol } = req.query;
  if (typeof endpoint !== 'string' || !ALLOWED.has(endpoint)) {
    res.status(400).json({ error: 'Unsupported endpoint' });
    return;
  }
  if (!symbol || typeof symbol !== 'string') {
    res.status(400).json({ error: 'Missing symbol query param' });
    return;
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY || FALLBACK_KEY;
  const url =
    `https://api.twelvedata.com/${endpoint}` +
    `?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Twelve Data' });
  }
}

const streak = (opens, closes, lows, every = 2) => {
  const pairs = [];
  for (let i = 0; i < opens.length; i++) {
    const o = parseFloat(opens[i]), c = parseFloat(closes[i]), l = parseFloat(lows[i]);
    if (!isNaN(o) && !isNaN(c)) pairs.push([o, c, l]);
  }
  let s = 0;
  for (let i = pairs.length - 1; i >= 0; i--) { if (pairs[i][1] < pairs[i][0]) s++; else break; }
  if (!s) return { count: 0, lows: [], lowest: null };
  const sl = pairs.slice(pairs.length - s).map(p => p[2]).filter(l => Number.isFinite(l) && l > 0);
  return { count: s, every, met: s >= every && s % every === 0, lows: sl, lowest: sl.length ? Math.min(...sl) : null };
};

// Binance BTC daily
const r = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=15');
const d = await r.json();
const closed = d.filter(k => Number(k[6]) <= Date.now());
console.log('binance closed candles:', closed.length, 'last3 [o,h,l,c]:', closed.slice(-3).map(k => [k[1], k[2], k[3], k[4]]));
console.log('BTC streak:', streak(closed.map(k=>k[1]), closed.map(k=>k[4]), closed.map(k=>k[3])));

// Yahoo via prod proxy
for (const sym of ['PTT.BK', 'AAPL']) {
  const res = await fetch(`https://wealth-lab-omega.vercel.app/api/yahoo-quote?symbol=${sym}&range=1mo&interval=1d`);
  const j = await res.json();
  const q = j?.chart?.result?.[0]?.indicators?.quote?.[0];
  const meta = j?.chart?.result?.[0]?.meta;
  console.log(sym, 'meta.currency=', meta?.currency, 'has low=', Array.isArray(q?.low), 'n=', q?.low?.length);
  console.log(sym, 'streak:', streak(q.open, q.close, q.low));
  console.log(sym, 'last3 o/c/l:', q.open.slice(-3), q.close.slice(-3), q.low.slice(-3));
}

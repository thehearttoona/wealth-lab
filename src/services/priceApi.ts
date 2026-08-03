// Price API Service
// ดึงราคาล่าสุดจาก API ต่างๆ

// Binance API สำหรับ Crypto (ฟรี ไม่ต้อง API key, ราคาจาก exchange จริงแบบ real-time)
const BINANCE_API = 'https://api.binance.com/api/v3';

// CoinGecko API สำหรับ Crypto (ฟรี ไม่ต้อง API key) — ใช้เป็น fallback ถ้า Binance ไม่มีคู่เทรดนั้น
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// open.er-api.com สำหรับอัตราแลกเปลี่ยน (ฟรี ไม่ต้อง API key)
// หมายเหตุ: Frankfurter (ที่เคยใช้) กับ Yahoo Finance ไม่ส่ง CORS header ให้ —
// เรียกจาก browser จริงไม่ได้เลย (fetch throw "Failed to fetch" เงียบๆ แม้ตัว API จะทำงานปกติ)
// เจอตอนทดสอบผ่าน headless browser จริง ไม่ใช่แค่ curl/Node
const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest/USD';

// ========================
// Exchange Rate Cache
// ========================
let exchangeRateCache: { rates: { [key: string]: number }; timestamp: number } | null = null;
const CACHE_DURATION_MS = 60 * 60 * 1000; // cache 1 ชั่วโมง

async function fetchWithTimeout(url: string, timeout = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ========================
// /api/* proxy — ปลายทางต่างกันระหว่าง dev กับ production
// ========================
// `/api/yahoo-quote` เป็น Vercel serverless function มีจริงเฉพาะบนโดเมนที่ deploy แล้ว
// ตอน dev (Metro :8081) ไม่มี route นี้ Metro เลยตอบ index.html กลับมาพร้อม status 200
// → res.ok เป็น true → res.json() พังเป็น "Unexpected token '<', \"<!DOCTYPE \"..."
// (เห็นเป็น "Error checking red days for XXX" รัว ๆ ใน console ตอน dev)
// แก้โดยยิงข้ามไปที่โดเมน production เมื่อไม่ได้รันบนโดเมนนั้น — ฟังก์ชันฝั่งโน้นใส่
// Access-Control-Allow-Origin: * ไว้แล้ว เรียกข้ามโดเมนได้ไม่ติด CORS
const PROD_API_ORIGIN = 'https://wealth-lab-omega.vercel.app';

// true = ไม่ได้รันบนโดเมนที่มี /api ให้ใช้ (dev บน localhost/LAN IP หรือ native ที่ไม่มี window.location)
const needsRemoteApi = (): boolean => {
  const host = typeof window !== 'undefined' ? window.location?.hostname : undefined;
  if (!host) return true; // iOS/Android — path เปล่า ๆ ไม่มีความหมาย ต้องเป็น URL เต็ม
  return host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
};

const apiUrl = (path: string): string => (needsRemoteApi() ? `${PROD_API_ORIGIN}${path}` : path);

// อ่าน response เป็น JSON แบบไม่ระเบิด — ถ้าปลายทางตอบ HTML (เช่น หน้า 404 ของ SPA
// หรือ Metro เสิร์ฟ index.html) จะได้ null กลับไปแทนที่จะ throw SyntaxError กลางคัน
async function readJson(res: Response): Promise<any | null> {
  if (!(res.headers.get('content-type') || '').includes('json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function getExchangeRates(): Promise<{ [key: string]: number }> {
  if (exchangeRateCache && Date.now() - exchangeRateCache.timestamp < CACHE_DURATION_MS) {
    return exchangeRateCache.rates;
  }
  try {
    const response = await fetchWithTimeout(EXCHANGE_RATE_API);
    if (!response.ok) throw new Error('Exchange rate fetch failed');
    const data = await response.json();
    const rates = data.rates as { [key: string]: number };
    exchangeRateCache = { rates, timestamp: Date.now() };
    return rates;
  } catch {
    // Fallback อัตราแลกเปลี่ยนโดยประมาณ
    return { THB: 35, EUR: 0.92, GBP: 0.78, JPY: 148, CNY: 7.1, HKD: 7.8, SGD: 1.34 };
  }
}

// 1 หน่วยของสกุลนั้น = กี่บาท — ใช้เติมช่อง "เรตต่อบาท" ในหน้าจัดการสกุลเงิน
// getExchangeRates() ฐานเป็น USD เลยต้องหารข้ามสกุลเอง
export async function getRateToTHB(code: string): Promise<number | null> {
  const c = (code || '').toUpperCase();
  if (!c) return null;
  if (c === 'THB') return 1;
  const rates = await getExchangeRates();
  const thb = rates['THB'];
  if (!thb) return null;
  if (c === 'USD') return thb;
  const perUsd = rates[c];
  if (!perUsd) return null;
  return thb / perUsd;
}

export async function getUsdToThbRate(): Promise<number> {
  const rates = await getExchangeRates();
  return rates['THB'] ?? 35;
}

// แปลงราคาจากสกุลเงินใดก็ได้ → สกุลเงินปลายทางที่ระบุ (ผ่าน USD เป็นตัวกลาง)
async function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
  if (fromCurrency === toCurrency) return amount;
  const rates = await getExchangeRates();
  const amountInUsd = fromCurrency === 'USD' ? amount : amount / (rates[fromCurrency] ?? 1);
  if (toCurrency === 'USD') return amountInUsd;
  return amountInUsd * (rates[toCurrency] ?? 35);
}

// ========================
// Crypto (CoinGecko)
// ========================

// ตาราง symbol → CoinGecko ID
const CRYPTO_ID_MAP: { [key: string]: string } = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'BNB': 'binancecoin',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'SOL': 'solana',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'POL': 'matic-network',
  'TAO': 'bittensor',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'AVAX': 'avalanche-2',
  'ATOM': 'cosmos',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
  'TRX': 'tron',
  'NEAR': 'near',
  'APT': 'aptos',
  'OP': 'optimism',
  'ARB': 'arbitrum',
  'SUI': 'sui',
  'INJ': 'injective-protocol',
  'FET': 'fetch-ai',
  'RENDER': 'render-token',
  'WLD': 'worldcoin-wld',
  'TON': 'the-open-network',
  'PEPE': 'pepe',
  'SHIB': 'shiba-inu',
  'FTM': 'fantom',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'IMX': 'immutable-x',
  'AAVE': 'aave',
  'MKR': 'maker',
  'SNX': 'havven',
  'CRV': 'curve-dao-token',
  'LDO': 'lido-dao',
  'STX': 'blockstack',
  'FIL': 'filecoin',
  'THETA': 'theta-token',
  'VET': 'vechain',
  'XLM': 'stellar',
  'ALGO': 'algorand',
  'EOS': 'eos',
  'XTZ': 'tezos',
  'EGLD': 'elrond-erd-2',
  'FLOW': 'flow',
  'XMR': 'monero',
  'ZEC': 'zcash',
  'DASH': 'dash',
};

// CoinGecko รองรับ vs_currencies พวกนี้ตรงตัว (lowercase) — currency อื่นที่ไม่รองรับจะ fallback ไป usd แล้วแปลงเอง
const COINGECKO_SUPPORTED_CURRENCIES = new Set(['usd', 'thb', 'eur', 'jpy', 'cny']);

async function getCryptoPriceFromCoinGecko(upperSymbol: string, targetCurrency: string): Promise<number | null> {
  try {
    const coinId = CRYPTO_ID_MAP[upperSymbol] || upperSymbol.toLowerCase();
    const vsCurrency = targetCurrency.toLowerCase();
    const fetchCurrency = COINGECKO_SUPPORTED_CURRENCIES.has(vsCurrency) ? vsCurrency : 'usd';
    const response = await fetchWithTimeout(
      `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=${fetchCurrency}`
    );
    if (!response.ok) throw new Error('CoinGecko fetch failed');
    const data = await response.json();
    const price = data[coinId]?.[fetchCurrency];
    if (price === undefined || price === null) return null;
    return fetchCurrency === vsCurrency ? price : await convertCurrency(price, fetchCurrency.toUpperCase(), targetCurrency);
  } catch (error) {
    console.error('Error fetching crypto price from CoinGecko:', error);
    return null;
  }
}

export async function getCryptoPrice(symbol: string, targetCurrency: string = 'THB'): Promise<number | null> {
  const upperSymbol = symbol.toUpperCase();
  try {
    const response = await fetchWithTimeout(`${BINANCE_API}/ticker/price?symbol=${upperSymbol}USDT`);
    if (response.ok) {
      const data = await response.json();
      const priceUsdt = parseFloat(data.price);
      if (!isNaN(priceUsdt)) return await convertCurrency(priceUsdt, 'USD', targetCurrency);
    }
  } catch (error) {
    console.error('Error fetching crypto price from Binance:', error);
  }
  // Binance ไม่มีคู่เทรดนี้ (เหรียญเล็ก/ไม่ได้ list) — fallback ไป CoinGecko
  return getCryptoPriceFromCoinGecko(upperSymbol, targetCurrency);
}

// ดึงราคา crypto หลายตัวในครั้งเดียว (ประหยัด request)
export async function getCryptoPrices(
  symbols: string[],
  targetCurrency: string = 'THB'
): Promise<{ [symbol: string]: number | null }> {
  if (symbols.length === 0) return {};
  const upperSymbols = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const result: { [symbol: string]: number | null } = {};
  const unresolved: string[] = [];

  try {
    const pairsParam = JSON.stringify(upperSymbols.map((s) => `${s}USDT`));
    const response = await fetchWithTimeout(
      `${BINANCE_API}/ticker/price?symbols=${encodeURIComponent(pairsParam)}`
    );
    if (response.ok) {
      const data: { symbol: string; price: string }[] = await response.json();
      const priceByPair: { [pair: string]: number } = {};
      data.forEach((d) => { priceByPair[d.symbol] = parseFloat(d.price); });
      await Promise.all(upperSymbols.map(async (sym) => {
        const pair = `${sym}USDT`;
        if (priceByPair[pair] !== undefined && !isNaN(priceByPair[pair])) {
          result[sym] = await convertCurrency(priceByPair[pair], 'USD', targetCurrency);
        } else {
          unresolved.push(sym);
        }
      }));
    } else {
      unresolved.push(...upperSymbols);
    }
  } catch (error) {
    console.error('Error fetching crypto prices batch from Binance:', error);
    unresolved.push(...upperSymbols);
  }

  if (unresolved.length > 0) {
    // ยิงทีละเหรียญแทน (Binance เดี่ยว แล้ว fallback CoinGecko) แทนที่จะข้าม Binance ไปเลยทั้งชุด
    // เพราะ batch endpoint คืน 400 ทั้งก้อนถ้ามีแค่ 1 symbol ที่ไม่มีคู่เทรด USDT
    await Promise.all(
      unresolved.map(async (sym) => {
        result[sym] = await getCryptoPrice(sym, targetCurrency);
      })
    );
  }

  return result;
}

// ========================
// Stock (Twelve Data, fallback: Yahoo Finance via our own /api proxy)
// ========================
// Twelve Data's free tier 404s on several exchanges (e.g. Thai SET stocks
// like PTT — "available starting with the Grow or Venture plan"). Yahoo
// Finance covers them fine but sends no CORS header, so it can't be called
// directly from a browser — routed through our /api/yahoo-quote serverless
// function instead, which fetches server-side (no CORS restriction there)
// and adds its own CORS header for us to read.

// คีย์ Twelve Data ต้องไม่หลุดมาฝั่ง client (เดิม hardcode ไว้ ใครเปิดเว็บก็อ่านจากบันเดิลไปใช้จนโควตาหมดได้)
// เลยยิงผ่าน /api/twelve-data แทน แล้วให้ serverless function ใส่คีย์จาก env ให้เอง — ท่าเดียวกับ yahoo-quote
const twelveDataUrl = (endpoint: 'quote' | 'symbol_search', symbol: string): string =>
  apiUrl(`/api/twelve-data?endpoint=${endpoint}&symbol=${encodeURIComponent(symbol)}`);

async function fetchYahooChart(symbol: string): Promise<{ price: number; currency: string } | null> {
  try {
    const response = await fetchWithTimeout(apiUrl(`/api/yahoo-quote?symbol=${encodeURIComponent(symbol)}`));
    if (!response.ok) return null;
    const data = await readJson(response);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice || !meta?.currency) return null;
    return { price: meta.regularMarketPrice, currency: meta.currency };
  } catch (error) {
    console.error(`Error fetching Yahoo quote for ${symbol}:`, error);
    return null;
  }
}

async function getStockPriceFromYahoo(symbol: string, targetCurrency: string): Promise<number | null> {
  // ลอง .BK (ตลาด SET) ก่อนถ้าไม่ได้ระบุตลาดมา เพราะแอปนี้เน้นผู้ใช้ไทย และ Yahoo
  // มี symbol ซ้ำกันข้ามตลาดได้ (เช่น "PTT" เพียวๆ ดันไปแมตช์กองทุนสหรัฐฯ คนละตัวเลย
  // ไม่ใช่หุ้น PTT ไทย) — ลองแบบเดิมท้ายสุดไว้เป็น fallback
  const attempts = symbol.includes('.') ? [symbol] : [`${symbol}.BK`, symbol];
  for (const attempt of attempts) {
    const result = await fetchYahooChart(attempt);
    if (result) return await convertCurrency(result.price, result.currency, targetCurrency);
  }
  return null;
}

export async function getStockPrice(
  symbol: string,
  targetCurrency: string = 'THB',
  isThaiStock: boolean = false
): Promise<number | null> {
  // หุ้นไทย (ตลาด SET) โดน Twelve Data free tier บล็อกเสมอ ("Grow/Venture plan only")
  // ข้ามไป Yahoo Finance ตรงๆ เลย ไม่ต้องเสียรอบ request ที่รู้อยู่แล้วว่าจะ 404
  if (isThaiStock) {
    return getStockPriceFromYahoo(symbol, targetCurrency);
  }

  try {
    const response = await fetchWithTimeout(twelveDataUrl('quote', symbol));
    if (response.ok) {
      const data = await readJson(response);
      if (data && data.status !== 'error' && data.close) {
        const price = parseFloat(data.close);
        if (!isNaN(price)) return await convertCurrency(price, data.currency || 'USD', targetCurrency);
      }
    }
  } catch (error) {
    console.error('Error fetching stock price from Twelve Data:', error);
  }
  // Twelve Data ล้มเหลว (rate limit / ไม่รองรับ symbol นี้ในแผนฟรี) — fallback ไป Yahoo Finance ผ่าน proxy
  return getStockPriceFromYahoo(symbol, targetCurrency);
}

// ========================
// Gold (metals.live)
// ========================

export async function getGoldPrice(targetCurrency: string = 'THB'): Promise<number | null> {
  try {
    // ทองคำ (GC=F, USD/troy ounce) ผ่าน Yahoo proxy — metals.live โดน CORS เรียกจาก browser ไม่ได้
    const gold = await fetchYahooChart('GC=F');
    if (gold && gold.price > 0) {
      // USD/oz → USD/กรัม → USD/บาททอง (1 บาททอง = 15.244 กรัม, 1 troy oz = 31.1035 กรัม)
      const pricePerGramUSD = gold.price / 31.1035;
      const pricePerBahtTongUSD = pricePerGramUSD * 15.244;
      return await convertCurrency(pricePerBahtTongUSD, 'USD', targetCurrency);
    }
  } catch (error) {
    console.error('Error fetching gold price:', error);
  }
  return null;
}

// ========================
// แท่งเทียนรายวัน — เช็คแดงติดกันเป็นจำนวนคู่ (2/4/6…) สำหรับ crypto/หุ้น
// ========================

export interface RedStreakAlert {
  count: number;        // จำนวนแท่งแดงติดกันล่าสุด (0 = แท่งล่าสุดไม่แดง)
  dropPercent: number;  // % ที่ลงตลอดสตรีค (open แท่งแรก → close แท่งล่าสุด, ค่าติดลบ) — count=0 → 0
  every: number;        // กฎที่ใช้: ครบทุก ๆ กี่แท่ง
  met: boolean;         // ครบรอบแล้วหรือยัง (count >= every และหารลงตัว)
}

// นับ "แท่งแดงติดกันล่าสุด" (แท่งแดง = close < open) จากแท่งท้ายสุดไล่ย้อนขึ้นไป
// แจ้งเตือนเฉพาะเมื่อจำนวนแท่งแดงติดกันครบทุก ๆ `every` แท่ง (every, 2×every, 3×every…)
// ค่าเริ่มต้น every=2 → เตือนที่ 2/4/6 เลขคี่ไม่เตือน (กฎเดิมของแอป)
// คืน % ที่ลงตลอดสตรีค (ค่าติดลบ) — ไม่เข้าเงื่อนไข → null
function recentEvenRedStreak(opens: any[], closes: any[], every = 2): RedStreakAlert | null {
  const step = Number.isFinite(every) && every >= 1 ? Math.floor(every) : 2;
  const pairs: [number, number][] = [];
  for (let i = 0; i < opens.length; i++) {
    const o = parseFloat(opens[i]);
    const c = parseFloat(closes[i]);
    if (!isNaN(o) && !isNaN(c)) pairs.push([o, c]);
  }
  // นับแท่งแดงติดกันจากท้ายสุด
  let streak = 0;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const [o, c] = pairs[i];
    if (c < o) streak++;
    else break;
  }
  // คืนสถานะเสมอ แม้ยังไม่ครบรอบ — หน้าจอต้องบอกได้ว่า "กฎมีผลอยู่ แต่ยังไม่ถึงคิว"
  // ไม่งั้นตั้งกฎแล้วจอเงียบ แยกไม่ออกระหว่าง "ยังไม่ครบ" กับ "ตั้งไม่ติด"
  const met = streak >= step && streak % step === 0;
  if (streak === 0 || pairs.length === 0) return { count: 0, dropPercent: 0, every: step, met: false };
  const firstIdx = pairs.length - streak;
  const startOpen = pairs[firstIdx][0];
  const lastClose = pairs[pairs.length - 1][1];
  return {
    count: streak,
    dropPercent: ((lastClose - startOpen) / startOpen) * 100,
    every: step,
    met,
  };
}

// แปลงกรอบเวลาของแอป → พารามิเตอร์ของแต่ละ API
// Yahoo ต้องขอ range ยาวขึ้นตามกรอบ ไม่งั้นได้แท่งไม่กี่แท่ง จับสตรีคยาว ๆ ไม่เจอ
const CANDLE_PARAMS: Record<string, { binance: string; yahoo: string; range: string }> = {
  day: { binance: '1d', yahoo: '1d', range: '1mo' },
  week: { binance: '1w', yahoo: '1wk', range: '1y' },
  month: { binance: '1M', yahoo: '1mo', range: '5y' },
};

// ต้นคาบ (จันทร์ของสัปดาห์ / วันที่ 1 ของเดือน) — ใช้เทียบว่าแท่งท้ายสุดยังอยู่ในคาบปัจจุบันไหม
const periodStart = (ms: number, interval: string): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (interval === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const dow = (d.getDay() + 6) % 7; // จันทร์ = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
};

const inCurrentPeriod = (ms: number, interval: string): boolean =>
  periodStart(ms, interval) === periodStart(Date.now(), interval);

export interface RedStreakOptions {
  interval?: string; // 'day' | 'week' | 'month' (ไม่ระบุ = day)
  every?: number;    // เตือนทุก ๆ N แท่ง (ไม่ระบุ = 2)
}

// คืนข้อมูลแดงติดกันครบรอบในช่วงล่าสุด, null = ไม่เข้าเงื่อนไข/เช็คไม่ได้
// นับเฉพาะ "แท่งที่ปิดแล้วจริง" — ตัดแท่งปัจจุบันที่ยังวิ่งอยู่ออกก่อนเสมอ
export async function getTwoRedDays(
  type: string,
  symbol: string,
  opts: RedStreakOptions = {}
): Promise<RedStreakAlert | null> {
  const tf = CANDLE_PARAMS[opts.interval || 'day'] || CANDLE_PARAMS.day;
  const every = opts.every && opts.every >= 1 ? opts.every : 2;
  try {
    if (type === 'crypto') {
      const up = symbol.toUpperCase();
      // ดึงย้อนหลังมากพอ (15 แท่ง) ให้จับสตรีคที่ยาวได้ (เช่น 6/8 แท่ง)
      const res = await fetchWithTimeout(`${BINANCE_API}/klines?symbol=${up}USDT&interval=${tf.binance}&limit=15`);
      if (!res.ok) return null; // เหรียญไม่มีคู่เทรดบน Binance
      const data: any[] = await res.json(); // [[openTime, open, high, low, close, ..., closeTime, ...], ...]
      // เก็บเฉพาะแท่งที่ปิดแล้ว: closeTime (index 6, ms) ต้องผ่านมาแล้ว
      // (ใช้ได้กับทุกกรอบเวลา — สัปดาห์/เดือนที่ยังไม่จบก็ถูกตัดด้วยเงื่อนไขเดียวกัน)
      const now = Date.now();
      const closed = data.filter((k) => Number(k[6]) <= now);
      return recentEvenRedStreak(closed.map((k) => k[1]), closed.map((k) => k[4]), every);
    }
    if (type === 'stock_th' || type === 'stock_foreign') {
      const attempts = symbol.includes('.')
        ? [symbol]
        : type === 'stock_th'
          ? [`${symbol}.BK`, symbol]
          : [symbol, `${symbol}.BK`];
      for (const s of attempts) {
        const res = await fetchWithTimeout(apiUrl(`/api/yahoo-quote?symbol=${encodeURIComponent(s)}&range=${tf.range}&interval=${tf.yahoo}`));
        if (!res.ok) continue;
        const data = await readJson(res);
        if (!data) continue; // ได้ HTML แทน JSON = ปลายทางไม่มี /api ให้ใช้ ลอง symbol ถัดไป
        const result = data?.chart?.result?.[0];
        const q = result?.indicators?.quote?.[0];
        if (!q?.open || !q?.close) continue;
        let opens: any[] = q.open;
        let closes: any[] = q.close;
        // ตัด "แท่งที่ยังไม่ปิด" ออกก่อนนับเสมอ — วิธีเช็คต่างกันตามกรอบเวลา
        const ts: number[] | undefined = result?.timestamp;
        const lastTs = ts?.[ts.length - 1];
        let dropLast = false;
        if (lastTs != null) {
          if (opts.interval === 'week' || opts.interval === 'month') {
            // แท่งสัปดาห์/เดือนใช้ timestamp = ต้นคาบ ถ้าตกอยู่ในคาบปัจจุบัน = ยังวิ่งอยู่
            // (เทียบเป็นคาบ ไม่ใช่ตัดแท่งท้ายทิ้งดื้อ ๆ เพราะถ้าคาบปิดไปแล้วจะทำให้สตรีคขาด)
            dropLast = inCurrentPeriod(lastTs * 1000, opts.interval);
          } else {
            // รายวัน: ใช้ session ของตลาดจริง (meta.currentTradingPeriod.regular, หน่วยวินาที)
            const reg = result?.meta?.currentTradingPeriod?.regular;
            dropLast = !!reg && lastTs >= reg.start && Date.now() / 1000 < reg.end;
          }
        }
        if (dropLast) {
          opens = opens.slice(0, -1);
          closes = closes.slice(0, -1);
        }
        return recentEvenRedStreak(opens, closes, every);
      }
      return null;
    }
    return null; // fund/gold/other ไม่มีแท่งเทียน
  } catch (error) {
    console.error('Error checking red days for', symbol, error);
    return null;
  }
}

// ========================
// Search
// ========================

export interface CryptoSearchResult {
  id: string;
  symbol: string;
  name: string;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  region: string;
  currency: string;
}

export async function searchCryptoList(query: string): Promise<CryptoSearchResult[]> {
  try {
    if (!query || query.trim().length < 1) return [];

    const response = await fetchWithTimeout(
      `${COINGECKO_API}/search?query=${encodeURIComponent(query.trim())}`
    );
    if (!response.ok) throw new Error('CoinGecko search failed');

    const data = await response.json();
    return (data.coins || []).slice(0, 10).map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
    }));
  } catch (error) {
    console.error('Error searching crypto:', error);
    return [];
  }
}

export async function searchStockList(
  query: string,
  market: 'th' | 'foreign' | 'all' = 'all'
): Promise<StockSearchResult[]> {
  try {
    if (!query || query.trim().length < 1) return [];

    // Twelve Data symbol search — Yahoo Finance's search endpoint doesn't send
    // CORS headers, so it can't be called from a browser at all (tested)
    const response = await fetchWithTimeout(twelveDataUrl('symbol_search', query.trim()));
    if (!response.ok) throw new Error('Twelve Data symbol search failed');

    const data = await readJson(response);
    const results: any[] = data?.data || [];

    // รับหุ้นสามัญ, ETF และ ADR/DR (เช่น TSMC ซื้อได้จริงในรูป ADR "TSM" บน NYSE)
    // ตัด warrant/futures ฯลฯ ออก
    const allowedTypes = new Set([
      'Common Stock', 'ETF',
      'American Depositary Receipt', 'Depositary Receipt',
      'GDR', 'Global Depositary Receipt',
    ]);
    // คะแนนยิ่งน้อยยิ่งขึ้นก่อน — ดัน USD + หุ้นสามัญ + ตลาดใหญ่ให้อยู่บน (ลด noise พวก CEDEAR/ตลาดรอง)
    const majorExchanges = new Set(['NASDAQ', 'NYSE', 'NYSE American', 'LSE', 'HKEX', 'TSE', 'TWSE', 'SGX', 'Euronext']);
    const scoreOf = (r: any) => {
      let s = 0;
      if (r.currency !== 'USD') s += 2;
      if (r.instrument_type !== 'Common Stock') s += 1;
      if (!majorExchanges.has(r.exchange)) s += 1;
      return s;
    };

    return results
      .filter((r) => allowedTypes.has(r.instrument_type))
      .filter((r) => {
        if (market === 'th') return r.country === 'Thailand';
        if (market === 'foreign') return r.country !== 'Thailand';
        return true;
      })
      .sort((a, b) => scoreOf(a) - scoreOf(b))
      .slice(0, 10)
      .map((r) => ({
        symbol: r.symbol,
        name: r.instrument_name || r.symbol,
        region: r.exchange || r.country || '',
        currency: r.currency || 'USD',
      }));
  } catch (error) {
    console.error('Error searching stock:', error);
    return [];
  }
}

// ========================
// Main update function
// ========================

export async function updateInvestmentPrice(
  type: string,
  symbol: string,
  targetCurrency: string = 'THB'
): Promise<number | null> {
  switch (type) {
    case 'crypto':
      return getCryptoPrice(symbol, targetCurrency);
    case 'stock_th':
      return getStockPrice(symbol, targetCurrency, true);
    case 'stock_foreign':
      return getStockPrice(symbol, targetCurrency, false);
    case 'gold':
      return getGoldPrice(targetCurrency);
    default:
      return null;
  }
}

// ========================
// ดึงราคาหลายรายการในรอบเดียว (ใช้กับปุ่มรีเฟรชและ auto refresh)
// ========================

// กองทุนไม่มี API ราคาสด (NAV กรอกมือ) — ประเภทอื่นนอกลิสต์นี้ก็ดึงไม่ได้ ข้ามไปเลย
const REFRESHABLE_TYPES = ['crypto', 'stock_th', 'stock_foreign', 'gold'];
export const isPriceRefreshable = (type: string): boolean => REFRESHABLE_TYPES.includes(type);

export interface PriceRequestItem {
  id: string;
  type: string;
  symbol: string;
  currency: string;
}

// Twelve Data แผนฟรีจำกัด 8 request/นาที — ยิงหุ้นพร้อมกันทั้งพอร์ตจะโดน rate limit
// แล้วตกไป fallback Yahoo ทั้งชุด (เปลืองกว่าเดิม) เลยจำกัดคิวไว้ทีละ 4
const STOCK_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * ดึงราคาปัจจุบันของหลายรายการพร้อมกัน คืน map ของ id -> ราคา (เฉพาะตัวที่ดึงได้)
 *
 * ต่างจากการวน updateInvestmentPrice ทีละตัวตรงที่:
 * - crypto รวมเป็น batch เดียวของ Binance (เหรียญ 20 ตัว = 1 request ไม่ใช่ 20)
 * - ทอง ดึงราคา GC=F ครั้งเดียวต่อสกุลเงิน แล้วแจกให้ทุกรายการทอง
 * - หุ้นวิ่งขนานแบบจำกัดคิว ไม่ใช่เรียงทีละตัวจนรอบหนึ่งกินเวลาเป็นนาที
 */
export async function fetchPricesForItems(
  items: PriceRequestItem[]
): Promise<{ [id: string]: number }> {
  const targets = items.filter((i) => isPriceRefreshable(i.type) && i.symbol);
  if (targets.length === 0) return {};

  const prices: { [id: string]: number } = {};
  const record = (id: string, price: number | null) => {
    if (price !== null && price > 0) prices[id] = price;
  };

  // จัดกลุ่มตามสกุลเงินเป้าหมาย เพราะราคาถูกแปลงเป็นสกุลของรายการนั้น ๆ
  const byCurrency = <T extends PriceRequestItem>(list: T[]) =>
    list.reduce<{ [cur: string]: T[] }>((acc, item) => {
      const cur = item.currency || 'THB';
      (acc[cur] ||= []).push(item);
      return acc;
    }, {});

  const cryptos = targets.filter((i) => i.type === 'crypto');
  const golds = targets.filter((i) => i.type === 'gold');
  const stocks = targets.filter((i) => i.type === 'stock_th' || i.type === 'stock_foreign');

  await Promise.all([
    // crypto — batch ต่อสกุลเงิน
    ...Object.entries(byCurrency(cryptos)).map(async ([cur, list]) => {
      const bySymbol = await getCryptoPrices(list.map((i) => i.symbol), cur);
      list.forEach((i) => record(i.id, bySymbol[i.symbol.toUpperCase()] ?? null));
    }),
    // ทอง — ราคาเดียวต่อสกุลเงิน แจกให้ทุกรายการ
    ...Object.entries(byCurrency(golds)).map(async ([cur, list]) => {
      const price = await getGoldPrice(cur);
      list.forEach((i) => record(i.id, price));
    }),
    // หุ้น — ขนานแบบจำกัดคิว
    mapWithConcurrency(stocks, STOCK_CONCURRENCY, async (i) => {
      const price = await getStockPrice(i.symbol, i.currency || 'THB', i.type === 'stock_th');
      record(i.id, price);
    }),
  ]);

  return prices;
}

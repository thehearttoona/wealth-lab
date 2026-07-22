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

const TWELVE_DATA_API = 'https://api.twelvedata.com';
const TWELVE_DATA_API_KEY = '1d533ad623aa46eea821c919e473d051';

async function fetchYahooChart(symbol: string): Promise<{ price: number; currency: string } | null> {
  try {
    const response = await fetchWithTimeout(`/api/yahoo-quote?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) return null;
    const data = await response.json();
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
    const response = await fetchWithTimeout(
      `${TWELVE_DATA_API}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${TWELVE_DATA_API_KEY}`
    );
    if (response.ok) {
      const data = await response.json();
      if (data.status !== 'error' && data.close) {
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
    const response = await fetchWithTimeout('https://api.metals.live/v1/spot/gold');
    if (!response.ok) throw new Error('metals.live fetch failed');

    const data = await response.json();
    const pricePerOzUSD: number = data[0]?.price || 0;
    // USD/oz → USD/กรัม → USD/บาททอง (15.244 กรัม = 1 บาททอง)
    const pricePerGramUSD = pricePerOzUSD / 31.1;
    const pricePerBahtTongUSD = pricePerGramUSD * 15.244;

    return await convertCurrency(pricePerBahtTongUSD, 'USD', targetCurrency);
  } catch (error) {
    console.error('Error fetching gold price:', error);
    // fallback ราคาประมาณ (คำนวณจาก THB คงที่ ~30000 แปลงเป็นสกุลเงินปลายทาง)
    return targetCurrency === 'THB' ? 30000 : await convertCurrency(30000, 'THB', targetCurrency);
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
    const response = await fetchWithTimeout(
      `${TWELVE_DATA_API}/symbol_search?symbol=${encodeURIComponent(query.trim())}&apikey=${TWELVE_DATA_API_KEY}`
    );
    if (!response.ok) throw new Error('Twelve Data symbol search failed');

    const data = await response.json();
    const results: any[] = data?.data || [];

    return results
      .filter((r) => r.instrument_type === 'Common Stock' || r.instrument_type === 'ETF')
      .filter((r) => {
        if (market === 'th') return r.country === 'Thailand';
        if (market === 'foreign') return r.country !== 'Thailand';
        return true;
      })
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

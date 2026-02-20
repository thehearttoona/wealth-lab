// Price API Service
// ดึงราคาล่าสุดจาก API ต่างๆ

// CoinGecko API สำหรับ Crypto (ฟรี ไม่ต้อง API key)
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Yahoo Finance API สำหรับหุ้นต่างประเทศ (ไม่ต้อง API key)
const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_FINANCE_API_2 = 'https://query2.finance.yahoo.com/v8/finance/chart';

// Frankfurter API สำหรับอัตราแลกเปลี่ยน (ฟรี ไม่ต้อง API key)
const FRANKFURTER_API = 'https://api.frankfurter.app/latest';

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
    const response = await fetchWithTimeout(`${FRANKFURTER_API}?from=USD`);
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

// แปลงราคาจากสกุลเงินใดก็ได้ → THB
async function convertToThb(amount: number, fromCurrency: string): Promise<number> {
  if (fromCurrency === 'THB') return amount;
  const rates = await getExchangeRates();
  if (fromCurrency === 'USD') {
    return amount * (rates['THB'] ?? 35);
  }
  // fromCurrency → USD → THB
  const rateToUSD = 1 / (rates[fromCurrency] ?? 1);
  return amount * rateToUSD * (rates['THB'] ?? 35);
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

export async function getCryptoPrice(symbol: string): Promise<number | null> {
  try {
    const upperSymbol = symbol.toUpperCase();
    const coinId = CRYPTO_ID_MAP[upperSymbol] || upperSymbol.toLowerCase();

    const response = await fetchWithTimeout(
      `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=thb`
    );
    if (!response.ok) throw new Error('CoinGecko fetch failed');

    const data = await response.json();
    return data[coinId]?.thb ?? null;
  } catch (error) {
    console.error('Error fetching crypto price:', error);
    return null;
  }
}

// ดึงราคา crypto หลายตัวในครั้งเดียว (ประหยัด request)
export async function getCryptoPrices(
  symbols: string[]
): Promise<{ [symbol: string]: number | null }> {
  if (symbols.length === 0) return {};
  try {
    const upperSymbols = symbols.map((s) => s.toUpperCase());
    const coinIds = upperSymbols.map((s) => CRYPTO_ID_MAP[s] || s.toLowerCase());
    const uniqueIds = [...new Set(coinIds)];

    const response = await fetchWithTimeout(
      `${COINGECKO_API}/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=thb`
    );
    if (!response.ok) throw new Error('CoinGecko batch fetch failed');

    const data = await response.json();
    const result: { [symbol: string]: number | null } = {};
    upperSymbols.forEach((sym, i) => {
      const coinId = coinIds[i];
      result[sym] = data[coinId]?.thb ?? null;
    });
    return result;
  } catch (error) {
    console.error('Error fetching crypto prices batch:', error);
    return {};
  }
}

// ========================
// Stock (Yahoo Finance)
// ========================

export async function getStockPrice(symbol: string): Promise<number | null> {
  try {
    // ลอง query1 ก่อน ถ้าล้มเหลวลอง query2
    let response = await fetchWithTimeout(
      `${YAHOO_FINANCE_API}/${encodeURIComponent(symbol)}`
    ).catch(() => null);

    if (!response || !response.ok) {
      response = await fetchWithTimeout(
        `${YAHOO_FINANCE_API_2}/${encodeURIComponent(symbol)}`
      );
    }

    if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta?.regularMarketPrice) return null;

    const priceInOriginalCurrency: number = meta.regularMarketPrice;
    const currency: string = meta.currency || 'USD';

    return await convertToThb(priceInOriginalCurrency, currency);
  } catch (error) {
    console.error('Error fetching stock price:', error);
    return null;
  }
}

// ========================
// Gold (metals.live)
// ========================

export async function getGoldPrice(): Promise<number | null> {
  try {
    const response = await fetchWithTimeout('https://api.metals.live/v1/spot/gold');
    if (!response.ok) throw new Error('metals.live fetch failed');

    const data = await response.json();
    const pricePerOzUSD: number = data[0]?.price || 0;
    // USD/oz → THB/กรัม → THB/บาททอง (15.244 กรัม = 1 บาททอง)
    const pricePerGramUSD = pricePerOzUSD / 31.1;
    const pricePerBahtTongUSD = pricePerGramUSD * 15.244;

    const usdToThb = await getUsdToThbRate();
    return pricePerBahtTongUSD * usdToThb;
  } catch (error) {
    console.error('Error fetching gold price:', error);
    return 30000; // fallback ราคาประมาณ
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

export async function searchStockList(query: string): Promise<StockSearchResult[]> {
  try {
    if (!query || query.trim().length < 1) return [];

    // Yahoo Finance search endpoint
    const response = await fetchWithTimeout(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
        query.trim()
      )}&lang=en-US&region=US&quotesCount=10&newsCount=0`
    );
    if (!response.ok) throw new Error('Yahoo Finance search failed');

    const data = await response.json();
    const quotes: any[] = data?.quotes || [];

    return quotes
      .filter((q) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      .slice(0, 10)
      .map((q) => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        region: q.exchange || '',
        currency: q.currency || 'USD',
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
  symbol: string
): Promise<number | null> {
  switch (type) {
    case 'crypto':
      return getCryptoPrice(symbol);
    case 'stock':
      return getStockPrice(symbol);
    case 'gold':
      return getGoldPrice();
    default:
      return null;
  }
}

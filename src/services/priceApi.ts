// Price API Service
// ดึงราคาล่าสุดจาก API ต่างๆ

// CoinGecko API สำหรับ Crypto (ฟรี ไม่ต้อง API key)
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Alpha Vantage API สำหรับหุ้น (ต้องมี API key ฟรี)
const ALPHA_VANTAGE_API = 'https://www.alphavantage.co/query';
const ALPHA_VANTAGE_KEY = 'demo'; // ใช้ demo key หรือสมัครฟรีที่ https://www.alphavantage.co/support/#api-key

export async function getCryptoPrice(symbol: string): Promise<number | null> {
  try {
    // แปลง symbol เป็น coingecko id
    const symbolMap: { [key: string]: string } = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'USDT': 'tether',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'SOL': 'solana',
      'DOT': 'polkadot',
      'MATIC': 'matic-network',
      'TAO': 'bittensor',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'AVAX': 'avalanche-2',
      'ATOM': 'cosmos',
    };

    const coinId = symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=thb`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch crypto price');
    }

    const data = await response.json();
    return data[coinId]?.thb || null;
  } catch (error) {
    console.error('Error fetching crypto price:', error);
    return null;
  }
}

export async function getStockPrice(symbol: string): Promise<number | null> {
  try {
    // Alpha Vantage API
    const response = await fetch(
      `${ALPHA_VANTAGE_API}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch stock price');
    }

    const data = await response.json();
    const price = data['Global Quote']?.['05. price'];
    
    if (price) {
      // แปลง USD เป็น THB (อัตราประมาณ 35 บาท/ดอลลาร์)
      return parseFloat(price) * 35;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching stock price:', error);
    return null;
  }
}

export async function getGoldPrice(): Promise<number | null> {
  try {
    // Gold API - สามารถใช้ Gold API ฟรี
    const response = await fetch('https://api.metals.live/v1/spot/gold');
    
    if (!response.ok) {
      throw new Error('Failed to fetch gold price');
    }

    const data = await response.json();
    // แปลง USD/oz เป็น THB/บาท (1 oz = 31.1 กรัม, 15.244 กรัม = 1 บาท)
    const pricePerOz = data[0]?.price || 0;
    const pricePerGram = pricePerOz / 31.1;
    const pricePerBaht = pricePerGram * 15.244 * 35; // แปลงเป็นบาทไทย
    
    return pricePerBaht;
  } catch (error) {
    console.error('Error fetching gold price:', error);
    // ถ้าดึงไม่ได้ ใช้ราคาประมาณ (30,000 บาท/บาททอง)
    return 30000;
  }
}

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
    if (!query || query.trim().length < 1) {
      return [];
    }

    const response = await fetch(
      `${COINGECKO_API}/search?query=${encodeURIComponent(query.trim())}`
    );

    if (!response.ok) {
      throw new Error('Failed to search crypto');
    }

    const data = await response.json();
    const coins = data.coins || [];

    // จำกัดผลลัพธ์ 10 รายการแรก
    return coins.slice(0, 10).map((coin: any) => ({
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
    if (!query || query.trim().length < 1) {
      return [];
    }

    const response = await fetch(
      `${ALPHA_VANTAGE_API}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query.trim())}&apikey=${ALPHA_VANTAGE_KEY}`
    );

    if (!response.ok) {
      throw new Error('Failed to search stock');
    }

    const data = await response.json();
    const matches = data.bestMatches || [];

    // จำกัดผลลัพธ์ 10 รายการแรก
    return matches.slice(0, 10).map((match: any) => ({
      symbol: match['1. symbol'],
      name: match['2. name'],
      region: match['4. region'],
      currency: match['8. currency'],
    }));
  } catch (error) {
    console.error('Error searching stock:', error);
    return [];
  }
}

export async function updateInvestmentPrice(
  type: string,
  symbol: string
): Promise<number | null> {
  switch (type) {
    case 'crypto':
      return await getCryptoPrice(symbol);
    case 'stock':
      return await getStockPrice(symbol);
    case 'gold':
      return await getGoldPrice();
    default:
      return null;
  }
}

export interface MT5Settings {
  backendUrl: string;
  login: number;
  password: string;
  server: string;
  path?: string;
}

export interface GridSettings {
  symbol: string;
  direction: 'BUY' | 'SELL';
  firstLot: number;
  profitPoints: number;
  magic: number;
  autoOpen?: boolean;
  openingPrice?: number;
  gridSpacing?: number;  // Spacing between orders in points (default 500)
}

export interface Position {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  sl: number;
  tp: number;
  price_current: number;
  profit: number;
  magic: number;
  comment: string;
}

export interface AccountInfo {
  login: number;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  profit: number;
}

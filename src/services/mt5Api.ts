import { MT5Settings, GridSettings, Position, AccountInfo } from '../types/mt5';

class MT5API {
  private baseUrl: string = '';
  private ws: WebSocket | null = null;
  private wsListeners: ((data: any) => void)[] = [];

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async connect(settings: MT5Settings): Promise<{ success: boolean; message: string; data?: AccountInfo }> {
    try {
      const response = await fetch(`${this.baseUrl}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: settings.login,
          password: settings.password,
          server: settings.server,
          path: settings.path,
        }),
      });
      
      return await response.json();
    } catch (error: any) {
      console.error('Connection error:', error);
      return { success: false, message: error.message };
    }
  }

  async disconnect(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/disconnect`, {
        method: 'POST',
      });
      
      this.disconnectWebSocket();
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async getAccount(): Promise<{ success: boolean; message: string; data?: AccountInfo }> {
    try {
      const response = await fetch(`${this.baseUrl}/account`);
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async openOrder(params: {
    symbol: string;
    direction: 'BUY' | 'SELL';
    lot: number;
    tpPoints: number;
    slPoints: number;
    price?: number;
    useLimit?: boolean;
    magic?: number;
    comment?: string;
  }): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const response = await fetch(`${this.baseUrl}/order/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: params.symbol,
          direction: params.direction,
          lot: params.lot,
          tp_points: params.tpPoints,
          sl_points: params.slPoints,
          price: params.price ?? null,
          use_limit: params.useLimit ?? false,
          magic: params.magic ?? 888888,
          comment: params.comment ?? 'Narix Order',
        }),
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async openGrid(settings: GridSettings): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const response = await fetch(`${this.baseUrl}/grid/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: settings.symbol,
          direction: settings.direction,
          lots: settings.lots,
          sl_points: settings.slPoints,
          tp_points: settings.tpPoints,
          magic: settings.magic,
        }),
      });
      
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async getPositions(magic?: number): Promise<{ success: boolean; message: string; data?: { positions: Position[] } }> {
    try {
      const url = magic ? `${this.baseUrl}/positions?magic=${magic}` : `${this.baseUrl}/positions`;
      const response = await fetch(url);
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async closePosition(ticket: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/position/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      });
      
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async closeGrid(magic: number): Promise<{ success: boolean; message: string; data?: { closed_count: number } }> {
    try {
      const response = await fetch(`${this.baseUrl}/grid/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magic }),
      });
      
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async startAutoGrid(settings: GridSettings): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const response = await fetch(`${this.baseUrl}/grid/start_auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: settings.symbol,
          direction: settings.direction,
          first_lot: settings.firstLot,
          profit_points: settings.profitPoints,
          magic: settings.magic,
          auto_open: settings.autoOpen || false,
          opening_price: settings.openingPrice || null,
          grid_spacing: settings.gridSpacing || 500,
        }),
      });
      
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async toggleAutoClose(magic: number): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const response = await fetch(`${this.baseUrl}/grid/toggle_auto_close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magic }),
      });
      
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async getAutoCloseStatus(magic: number): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const response = await fetch(`${this.baseUrl}/grid/auto_close_status/${magic}`);
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async getSymbols(): Promise<{ success: boolean; message: string; data?: { symbols: string[] } }> {
    try {
      const response = await fetch(`${this.baseUrl}/symbols`);
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Trade History APIs
  async getTradeHistory(limit: number = 50, symbol?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      let url = `${this.baseUrl}/history?limit=${limit}`;
      if (symbol) {
        url += `&symbol=${symbol}`;
      }
      const response = await fetch(url);
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async getTradeStats(symbol?: string): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      let url = `${this.baseUrl}/history/stats`;
      if (symbol) {
        url += `?symbol=${symbol}`;
      }
      const response = await fetch(url);
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async deleteHistoryRecord(recordId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/history/${recordId}`, {
        method: 'DELETE',
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async clearTradeHistory(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const response = await fetch(`${this.baseUrl}/history`, {
        method: 'DELETE',
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  connectWebSocket(onMessage: (data: any) => void) {
    if (this.ws) {
      this.disconnectWebSocket();
    }

    const wsUrl = this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    this.ws = new WebSocket(`${wsUrl}/ws`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
        this.wsListeners.forEach(listener => listener(data));
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
  }

  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsListeners = [];
  }

  addWebSocketListener(listener: (data: any) => void) {
    this.wsListeners.push(listener);
  }

  removeWebSocketListener(listener: (data: any) => void) {
    this.wsListeners = this.wsListeners.filter(l => l !== listener);
  }
}

export const mt5Api = new MT5API();

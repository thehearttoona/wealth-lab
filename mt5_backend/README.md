# MT5 Grid Trading Backend

Python FastAPI backend for automated MT5 grid trading.

## Features

- Connect to MT5 terminal
- Open 7-position grid trades
- Auto-close all positions when any one closes
- Real-time WebSocket monitoring
- RESTful API for trade management

## Installation

1. Install Python 3.9+
2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

4. Edit `.env` with your MT5 credentials:
```
MT5_LOGIN=your_login
MT5_PASSWORD=your_password
MT5_SERVER=your_broker_server
MT5_PATH=C:/Program Files/MetaTrader 5/terminal64.exe
HOST=0.0.0.0
PORT=8000
```

## Running

```bash
python main.py
```

Or with uvicorn:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

### POST /connect
Connect to MT5 terminal
```json
{
  "login": 12345678,
  "password": "your_password",
  "server": "BrokerServer-Demo",
  "path": "C:/Program Files/MetaTrader 5/terminal64.exe"
}
```

### POST /disconnect
Disconnect from MT5

### GET /account
Get account information

### POST /grid/open
Open 7-position grid
```json
{
  "symbol": "EURUSD",
  "direction": "BUY",
  "lots": [0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64],
  "sl_points": 100,
  "tp_points": 100,
  "magic": 999999
}
```

### GET /positions?magic=999999
Get open positions for specific magic number

### POST /position/close
Close single position
```json
{
  "ticket": 123456789
}
```

### POST /grid/close
Close all positions with magic number
```json
{
  "magic": 999999
}
```

### WebSocket /ws
Real-time position monitoring

Receives:
```json
{
  "type": "positions_update",
  "magic": 999999,
  "positions": [...]
}
```

Or:
```json
{
  "type": "grid_auto_closed",
  "magic": 999999,
  "closed_count": 6,
  "message": "Auto-closed 6 positions..."
}
```

## Grid Trading Logic

1. **Open Grid**: Opens 7 positions simultaneously with configurable lot sizes (martingale progression)
2. **Monitor**: Continuously monitors all positions with the same magic number
3. **Auto-Close**: When ANY position closes (SL/TP hit or manual close), automatically closes all remaining positions
4. **Broadcast**: Sends real-time updates via WebSocket to connected clients

## Magic Numbers

Each grid gets a unique magic number (default: 999999). This allows:
- Multiple grids running simultaneously
- Isolated monitoring per grid
- Independent auto-close logic

## Production Deployment

For production use:
1. Run on VPS with MT5 installed
2. Use process manager (PM2, systemd)
3. Configure CORS for your React Native app
4. Use HTTPS/WSS for WebSocket
5. Add authentication

## Troubleshooting

**MT5 not connecting:**
- Ensure MT5 terminal is installed
- Check credentials in `.env`
- Verify server name is correct
- Run as administrator if needed

**Positions not opening:**
- Check symbol name (e.g., "EURUSD" vs "EURUSDm")
- Verify account has sufficient margin
- Check broker allows API trading
- Verify lot sizes are within broker limits

**WebSocket not working:**
- Check firewall rules
- Verify port 8000 is open
- Test with ws://localhost:8000/ws first

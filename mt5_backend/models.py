from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class MT5Config(BaseModel):
    login: int
    password: str
    server: str
    path: Optional[str] = None

class GridOrderRequest(BaseModel):
    symbol: str
    direction: str  # "BUY" or "SELL"
    first_lot: float  # First position lot size
    profit_points: float  # Profit target in points
    magic: int = 999999
    opening_price: Optional[float] = None  # If provided, auto-open first order at this price
    auto_open: bool = False  # If true, auto-open first order immediately
    grid_spacing: float = 500  # Spacing between grid orders in points

class ClosePositionRequest(BaseModel):
    ticket: int

class CloseByMagicRequest(BaseModel):
    magic: int

class OrderResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None

class PositionInfo(BaseModel):
    ticket: int
    symbol: str
    type: str
    volume: float
    price_open: float
    sl: float
    tp: float
    price_current: float
    profit: float
    magic: int
    comment: str

class AccountInfo(BaseModel):
    login: int
    balance: float
    equity: float
    margin: float
    margin_free: float
    profit: float

class GridTradeHistory(BaseModel):
    """Record of a completed grid trade"""
    id: str  # Unique ID (timestamp + magic)
    magic: int
    symbol: str
    direction: str  # BUY or SELL
    first_lot: float
    max_positions_opened: int  # How many positions were opened before close
    total_lots: float  # Total volume traded
    profit: float  # Final profit/loss
    cost_basis: float = 0  # ต้นทุนรวม sum(volume * price_open)
    profit_percent: float = 0  # % กำไร/ขาดทุน จากต้นทุน
    close_reason: str  # "tp_hit", "manual_close", "auto_close"
    opened_at: str  # ISO timestamp when grid started
    closed_at: str  # ISO timestamp when grid closed
    duration_minutes: float  # How long the grid was open

class GridHistoryStats(BaseModel):
    """Statistics summary of all grid trades"""
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float  # percentage
    total_profit: float
    total_loss: float
    net_profit: float
    average_profit: float
    average_loss: float
    largest_win: float
    largest_loss: float
    average_duration_minutes: float
    average_profit_percent: float = 0  # % กำไรเฉลี่ยของเทรดที่ชนะ

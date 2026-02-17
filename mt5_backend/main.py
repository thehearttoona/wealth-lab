from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging
from typing import List, Set
import os
from dotenv import load_dotenv

from models import (
    MT5Config,
    GridOrderRequest,
    ClosePositionRequest,
    CloseByMagicRequest,
    OrderResponse,
    PositionInfo,
    AccountInfo,
)
from mt5_handler import mt5_handler
from trade_history import trade_history
import MetaTrader5 as mt5

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# WebSocket connections
active_connections: Set[WebSocket] = set()

# Grid monitoring
monitoring_magic_numbers: Set[int] = set()
monitoring_task = None

# Auto-close control
auto_close_enabled: dict[int, bool] = {}  # magic_number -> enabled/disabled

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting MT5 Backend...")
    yield
    # Shutdown
    logger.info("Shutting down MT5 Backend...")
    mt5_handler.shutdown()

app = FastAPI(title="MT5 Grid Trading API", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your React Native app URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MT5 connection
@app.post("/connect", response_model=OrderResponse)
async def connect_mt5(config: MT5Config):
    """Connect to MT5 terminal"""
    try:
        success = mt5_handler.initialize(
            login=config.login,
            password=config.password,
            server=config.server,
            path=config.path,
        )
        
        if success:
            account_info = mt5_handler.get_account_info()
            return OrderResponse(
                success=True,
                message="Connected to MT5 successfully",
                data=account_info,
            )
        else:
            return OrderResponse(
                success=False,
                message="Failed to connect to MT5",
            )
    except Exception as e:
        logger.error(f"Connection error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/disconnect", response_model=OrderResponse)
async def disconnect_mt5():
    """Disconnect from MT5"""
    mt5_handler.shutdown()
    return OrderResponse(success=True, message="Disconnected from MT5")

@app.get("/account", response_model=OrderResponse)
async def get_account():
    """Get account information"""
    account_info = mt5_handler.get_account_info()
    if account_info:
        return OrderResponse(
            success=True,
            message="Account info retrieved",
            data=account_info,
        )
    return OrderResponse(success=False, message="Not connected to MT5")

@app.get("/symbols", response_model=OrderResponse)
async def get_symbols():
    """Get all available symbols that account can trade"""
    if not mt5_handler.initialized:
        return OrderResponse(success=False, message="Not connected to MT5")
    
    symbols = mt5_handler.get_account_symbols()
    return OrderResponse(
        success=True,
        message=f"Found {len(symbols)} tradeable symbols",
        data={"symbols": symbols},
    )

@app.get("/symbols/all", response_model=OrderResponse)
async def get_all_symbols():
    """Get all symbols from broker (including non-tradeable)"""
    if not mt5_handler.initialized:
        return OrderResponse(success=False, message="Not connected to MT5")
    
    symbols = mt5_handler.get_symbols()
    return OrderResponse(
        success=True,
        message=f"Found {len(symbols)} symbols",
        data={"symbols": symbols},
    )

@app.post("/grid/open", response_model=OrderResponse)
async def open_grid(request: GridOrderRequest):
    """Open grid of 7 positions"""
    try:
        if len(request.lots) != 7:
            raise HTTPException(status_code=400, detail="Must provide exactly 7 lot sizes")
        
        # Get symbol info for SL/TP calculation
        symbol_info = mt5.symbol_info(request.symbol)
        if symbol_info is None:
            raise HTTPException(status_code=400, detail=f"Symbol {request.symbol} not found")
        
        point = symbol_info.point
        
        opened_positions = []
        failed_positions = []
        
        # Open 7 positions
        for i, lot in enumerate(request.lots):
            # Calculate SL and TP
            current_price = mt5.symbol_info_tick(request.symbol).ask if request.direction == "BUY" else mt5.symbol_info_tick(request.symbol).bid
            
            if request.direction == "BUY":
                sl = current_price - (request.sl_points * point) if request.sl_points > 0 else 0.0
                tp = current_price + (request.tp_points * point) if request.tp_points > 0 else 0.0
            else:
                sl = current_price + (request.sl_points * point) if request.sl_points > 0 else 0.0
                tp = current_price - (request.tp_points * point) if request.tp_points > 0 else 0.0
            
            result = mt5_handler.place_order(
                symbol=request.symbol,
                order_type=request.direction,
                volume=lot,
                sl=sl,
                tp=tp,
                comment=f"Grid {i+1}/7",
                magic=request.magic,
            )
            
            if result:
                opened_positions.append(result)
            else:
                failed_positions.append(i + 1)
        
        # Start monitoring this magic number
        monitoring_magic_numbers.add(request.magic)
        asyncio.create_task(start_monitoring())
        
        # Enable auto-close by default
        auto_close_enabled[request.magic] = True
        
        return OrderResponse(
            success=len(opened_positions) > 0,
            message=f"Opened {len(opened_positions)}/7 positions. Failed: {failed_positions if failed_positions else 'None'}",
            data={
                "opened": opened_positions,
                "failed": failed_positions,
                "magic": request.magic,
            },
        )
    except Exception as e:
        logger.error(f"Error opening grid: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/positions", response_model=OrderResponse)
async def get_positions(magic: int = None):
    """Get open positions and pending orders"""
    positions = mt5_handler.get_positions(magic=magic)
    pending_orders = mt5_handler.get_pending_orders(magic=magic)
    return OrderResponse(
        success=True,
        message=f"Found {len(positions)} positions and {len(pending_orders)} pending orders",
        data={
            "positions": positions,
            "pending_orders": pending_orders,
        },
    )

@app.post("/position/close", response_model=OrderResponse)
async def close_position(request: ClosePositionRequest):
    """Close a single position"""
    success = mt5_handler.close_position(request.ticket)
    if success:
        return OrderResponse(success=True, message="Position closed")
    return OrderResponse(success=False, message="Failed to close position")

@app.post("/grid/close", response_model=OrderResponse)
async def close_grid(request: CloseByMagicRequest):
    """Close all positions AND cancel all pending orders with specific magic number"""
    # Get current positions to calculate profit BEFORE closing
    positions = mt5_handler.get_positions(magic=request.magic)
    total_profit = sum(pos["profit"] for pos in positions)
    total_lots = sum(pos["volume"] for pos in positions)
    cost_basis = sum(pos["volume"] * pos["price_open"] for pos in positions)

    # Update trade history stats before closing
    trade_history.update_grid_stats(request.magic, len(positions), total_lots, cost_basis)

    result = mt5_handler.close_all_by_magic(request.magic)

    # Record to trade history
    history_record = trade_history.close_grid(
        magic=request.magic,
        profit=total_profit,
        close_reason="manual_close"
    )

    # Stop monitoring this magic number
    monitoring_magic_numbers.discard(request.magic)
    if request.magic in auto_close_enabled:
        del auto_close_enabled[request.magic]

    # Clean up auto_grid_configs
    if hasattr(monitor_positions, 'auto_grid_configs') and request.magic in monitor_positions.auto_grid_configs:
        del monitor_positions.auto_grid_configs[request.magic]
    if hasattr(monitor_positions, 'grid_position_tickets') and request.magic in monitor_positions.grid_position_tickets:
        del monitor_positions.grid_position_tickets[request.magic]
    if hasattr(monitor_positions, 'grid_total_counts') and request.magic in monitor_positions.grid_total_counts:
        del monitor_positions.grid_total_counts[request.magic]

    return OrderResponse(
        success=True,
        message=f"Closed {result['positions_closed']} positions and cancelled {result['orders_cancelled']} pending orders. Profit: ${total_profit:.2f}",
        data={
            **result,
            "total_profit": total_profit,
            "history_record": history_record,
        },
    )

@app.post("/grid/toggle_auto_close", response_model=OrderResponse)
async def toggle_auto_close(request: CloseByMagicRequest):
    """Toggle auto-close for specific magic number"""
    current_state = auto_close_enabled.get(request.magic, True)
    new_state = not current_state
    auto_close_enabled[request.magic] = new_state
    
    return OrderResponse(
        success=True,
        message=f"Auto-close {'enabled' if new_state else 'disabled'} for magic {request.magic}",
        data={"magic": request.magic, "auto_close_enabled": new_state},
    )

@app.get("/grid/auto_close_status/{magic}", response_model=OrderResponse)
async def get_auto_close_status(magic: int):
    """Get auto-close status for specific magic number"""
    status = auto_close_enabled.get(magic, True)
    return OrderResponse(
        success=True,
        message=f"Auto-close is {'enabled' if status else 'disabled'}",
        data={"magic": magic, "auto_close_enabled": status},
    )

# ============ Trade History Endpoints ============

@app.get("/history", response_model=OrderResponse)
async def get_trade_history(limit: int = 50, symbol: str = None):
    """Get trade history, optionally filtered by symbol"""
    history = trade_history.get_history(limit=limit, symbol=symbol)
    return OrderResponse(
        success=True,
        message=f"Found {len(history)} trade records",
        data={"history": history},
    )

@app.get("/history/stats", response_model=OrderResponse)
async def get_trade_stats(symbol: str = None):
    """Get trading statistics"""
    stats = trade_history.get_stats(symbol=symbol)
    return OrderResponse(
        success=True,
        message="Trading statistics",
        data=stats,
    )

@app.get("/history/debug", response_model=OrderResponse)
async def debug_trade_history():
    """Debug endpoint to check trade history state"""
    return OrderResponse(
        success=True,
        message="Trade history debug info",
        data={
            "history_file": trade_history.history_file,
            "history_count": len(trade_history.history),
            "active_grids": list(trade_history.active_grids.keys()),
            "active_grids_detail": trade_history.active_grids,
            "monitoring_magic_numbers": list(monitoring_magic_numbers),
        },
    )

@app.delete("/history/{record_id}", response_model=OrderResponse)
async def delete_history_record(record_id: str):
    """Delete a single trade history record"""
    success = trade_history.delete_record(record_id)
    if success:
        return OrderResponse(
            success=True,
            message=f"Record {record_id} deleted",
        )
    return OrderResponse(
        success=False,
        message=f"Record {record_id} not found",
    )

@app.delete("/history", response_model=OrderResponse)
async def clear_trade_history():
    """Clear all trade history"""
    count = trade_history.clear_history()
    return OrderResponse(
        success=True,
        message=f"Cleared {count} trade records",
        data={"deleted_count": count},
    )

# ============ End Trade History Endpoints ============

@app.post("/grid/start_auto", response_model=OrderResponse)
async def start_auto_grid(request: GridOrderRequest):
    """Start auto-grid: Open 7 pending orders with martingale lots and spacing"""
    try:
        # Calculate lot progression (martingale x2)
        lots = [request.first_lot * (2 ** i) for i in range(7)]
        
        # Check if there's already a position with this magic
        existing_positions = mt5_handler.get_positions(magic=request.magic)
        existing_orders = mt5.orders_get(symbol=request.symbol)
        existing_magic_orders = [o for o in (existing_orders or []) if o.magic == request.magic]
        
        if len(existing_positions) > 0 or len(existing_magic_orders) > 0:
            return OrderResponse(
                success=False,
                message=f"Already {len(existing_positions)} position(s) and {len(existing_magic_orders)} order(s) with magic {request.magic}. Please use different magic number.",
            )
        
        # Get symbol info
        symbol_info = mt5.symbol_info(request.symbol)
        if symbol_info is None:
            return OrderResponse(
                success=False,
                message=f"Symbol {request.symbol} not found",
            )
        
        point = symbol_info.point
        grid_spacing = request.grid_spacing  # Default 500 points
        
        # Get current price
        tick = mt5.symbol_info_tick(request.symbol)
        if tick is None:
            return OrderResponse(
                success=False,
                message=f"Cannot get price for {request.symbol}",
            )
        
        # Determine base price
        if request.opening_price and request.opening_price > 0:
            base_price = request.opening_price
        else:
            base_price = tick.ask if request.direction == "BUY" else tick.bid
        
        # TP in price (profit_points * point)
        tp_distance = request.profit_points * point
        
        # Open 7 pending orders with spacing
        opened_orders = []
        failed_orders = []
        
        for i in range(7):
            lot = lots[i]
            
            # Calculate price for this order
            # For BUY: orders are placed below current price (buying on dips)
            # For SELL: orders are placed above current price (selling on rallies)
            if request.direction == "BUY":
                order_price = base_price - (i * grid_spacing * point)
                tp_price = order_price + tp_distance  # TP above entry for BUY
            else:
                order_price = base_price + (i * grid_spacing * point)
                tp_price = order_price - tp_distance  # TP below entry for SELL
            
            # Determine order type
            current_ask = tick.ask
            current_bid = tick.bid
            
            if i == 0 and request.auto_open:
                # First order: use market if auto_open and no specific price
                if not request.opening_price or request.opening_price <= 0:
                    # Market order - TP based on current price
                    market_price = current_ask if request.direction == "BUY" else current_bid
                    if request.direction == "BUY":
                        tp_price = market_price + tp_distance
                    else:
                        tp_price = market_price - tp_distance
                    
                    result = mt5_handler.place_order(
                        symbol=request.symbol,
                        order_type=request.direction,
                        volume=lot,
                        price=None,
                        sl=0.0,
                        tp=tp_price,
                        magic=request.magic,
                        comment=f"Grid_1/7",
                        use_limit=False,
                    )
                else:
                    # Limit order at specified price
                    result = mt5_handler.place_order(
                        symbol=request.symbol,
                        order_type=request.direction,
                        volume=lot,
                        price=order_price,
                        sl=0.0,
                        tp=tp_price,
                        magic=request.magic,
                        comment=f"Grid_1/7",
                        use_limit=True,
                    )
            else:
                # Pending orders for positions 2-7 (or all if not auto_open)
                result = mt5_handler.place_order(
                    symbol=request.symbol,
                    order_type=request.direction,
                    volume=lot,
                    price=order_price,
                    sl=0.0,
                    tp=tp_price,
                    magic=request.magic,
                    comment=f"Grid_{i+1}/7",
                    use_limit=True,
                )
            
            if result.get('success'):
                opened_orders.append({
                    "order": i + 1,
                    "lot": lot,
                    "price": order_price,
                    "is_pending": result.get('is_pending', True) if i > 0 else result.get('is_pending', False),
                    "ticket": result.get('order'),
                })
                logger.info(f"Grid {i+1}/7 opened: {lot} lot at {order_price}")
            else:
                failed_orders.append({
                    "order": i + 1,
                    "lot": lot,
                    "price": order_price,
                    "error": result.get('message', 'Unknown error'),
                })
                logger.error(f"Grid {i+1}/7 failed: {result.get('message')}")
            
            await asyncio.sleep(0.3)  # Small delay between orders
        
        # Start monitoring
        global monitoring_task
        if monitoring_task is None or monitoring_task.done():
            monitoring_task = asyncio.create_task(monitor_positions())
        
        # Store configuration for monitoring
        if not hasattr(monitor_positions, 'auto_grid_configs'):
            monitor_positions.auto_grid_configs = {}
        
        monitor_positions.auto_grid_configs[request.magic] = {
            'symbol': request.symbol,
            'direction': request.direction,
            'lots': lots,
            'profit_points': request.profit_points,
            'grid_spacing': grid_spacing,
            'expanded': True,  # All orders already placed
        }
        
        monitoring_magic_numbers.add(request.magic)
        auto_close_enabled[request.magic] = True

        # Start tracking for trade history
        trade_history.start_grid(
            magic=request.magic,
            symbol=request.symbol,
            direction=request.direction,
            first_lot=request.first_lot
        )

        if len(opened_orders) > 0:
            return OrderResponse(
                success=True,
                message=f"Grid created! Opened {len(opened_orders)}/7 orders with {grid_spacing} points spacing.",
                data={
                    "magic": request.magic,
                    "symbol": request.symbol,
                    "direction": request.direction,
                    "grid_spacing": grid_spacing,
                    "profit_target": request.profit_points,
                    "opened_orders": opened_orders,
                    "failed_orders": failed_orders,
                    "lots": lots,
                },
            )
        else:
            return OrderResponse(
                success=False,
                message="Failed to open any orders",
                data={"failed_orders": failed_orders},
            )
    except Exception as e:
        logger.error(f"Error starting auto-grid: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# WebSocket for real-time monitoring
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"WebSocket connected. Total: {len(active_connections)}")
    
    try:
        while True:
            # Keep connection alive and wait for messages
            data = await websocket.receive_text()
            # Echo back or handle commands if needed
            await websocket.send_text(f"Received: {data}")
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(active_connections)}")

async def broadcast_positions(data: dict):
    """Broadcast position updates to all connected clients"""
    disconnected = set()
    for connection in active_connections:
        try:
            await connection.send_json(data)
        except:
            disconnected.add(connection)
    
    # Remove disconnected clients
    for conn in disconnected:
        active_connections.remove(conn)

async def monitor_positions():
    """Monitor positions and auto-close grid when one position closes (TP hit)"""
    # Use function attributes to persist data across awaits
    if not hasattr(monitor_positions, 'auto_grid_configs'):
        monitor_positions.auto_grid_configs = {}
    if not hasattr(monitor_positions, 'grid_position_tickets'):
        monitor_positions.grid_position_tickets = {}  # Track actual ticket numbers
    if not hasattr(monitor_positions, 'grid_total_counts'):
        monitor_positions.grid_total_counts = {}  # Track total (positions + pending orders)

    auto_grid_configs = monitor_positions.auto_grid_configs
    grid_position_tickets = monitor_positions.grid_position_tickets
    grid_total_counts = monitor_positions.grid_total_counts

    logger.info("Monitor positions task started")

    while True:
        try:
            for magic in list(monitoring_magic_numbers):
                positions = mt5_handler.get_positions(magic=magic)
                pending_orders = mt5_handler.get_pending_orders(magic=magic)

                current_position_count = len(positions)
                current_pending_count = len(pending_orders)
                current_total = current_position_count + current_pending_count

                # Get current position tickets
                current_tickets = set(pos["ticket"] for pos in positions)

                # Initialize tracking
                if magic not in grid_total_counts and current_total > 0:
                    grid_total_counts[magic] = current_total
                    grid_position_tickets[magic] = current_tickets.copy()
                    logger.info(f"Grid {magic}: Tracking started - {current_position_count} positions (tickets: {current_tickets}), {current_pending_count} pending orders")

                initial_total = grid_total_counts.get(magic, current_total)
                previous_tickets = grid_position_tickets.get(magic, set())

                # Check if any position was closed (ticket disappeared)
                # This is more reliable than just counting
                closed_tickets = previous_tickets - current_tickets

                # Update trade history stats
                total_lots = sum(pos["volume"] for pos in positions)
                cost_basis = sum(pos["volume"] * pos["price_open"] for pos in positions)
                trade_history.update_grid_stats(magic, current_position_count, total_lots, cost_basis)

                if closed_tickets and len(previous_tickets) > 0:
                    is_auto_close_enabled = auto_close_enabled.get(magic, True)

                    logger.warning(f"Grid {magic}: Position(s) closed! Tickets: {closed_tickets}")
                    logger.info(f"  - Previous tickets: {previous_tickets}")
                    logger.info(f"  - Current tickets: {current_tickets}")
                    logger.info(f"  - Pending Orders: {current_pending_count}")
                    logger.info(f"  - Auto-close enabled: {is_auto_close_enabled}")

                    if is_auto_close_enabled:
                        # ดึงกำไรจาก position ที่ปิดไปแล้ว (TP hit) ผ่าน MT5 deal history
                        closed_profit = 0.0
                        for ticket in closed_tickets:
                            try:
                                deals = mt5.history_deals_get(position=ticket)
                                if deals:
                                    for deal in deals:
                                        if deal.entry == 1:  # DEAL_ENTRY_OUT = closing deal
                                            closed_profit += deal.profit
                                            logger.info(f"Grid {magic}: Closed ticket {ticket} profit from deal history: {deal.profit}")
                            except Exception as e:
                                logger.error(f"Grid {magic}: Error getting deal history for ticket {ticket}: {e}")

                        # กำไรรวม = กำไรจาก position ที่ปิดไปแล้ว + กำไรจาก position ที่ยังเปิดอยู่
                        remaining_profit = sum(pos["profit"] for pos in positions)
                        total_profit = closed_profit + remaining_profit
                        logger.warning(f"Grid {magic}: TP Hit! Closing all remaining... (closed_profit: {closed_profit}, remaining_profit: {remaining_profit}, total_profit: {total_profit})")

                        # Close all remaining positions AND cancel pending orders
                        result = mt5_handler.close_all_by_magic(magic)

                        logger.info(f"Grid {magic}: close_all_by_magic result: {result}")

                        # Record to trade history (total = closed TP profit + remaining positions profit)
                        history_record = trade_history.close_grid(
                            magic=magic,
                            profit=total_profit,
                            close_reason="tp_hit"
                        )

                        # Notify clients
                        await broadcast_positions({
                            "type": "grid_auto_closed",
                            "magic": magic,
                            "positions_closed": result["positions_closed"],
                            "orders_cancelled": result["orders_cancelled"],
                            "profit": total_profit,
                            "message": f"🎯 TP Hit! Closed {result['positions_closed']} positions and cancelled {result['orders_cancelled']} pending orders. Profit: ${total_profit:.2f}",
                        })

                        # Stop monitoring this magic
                        monitoring_magic_numbers.discard(magic)
                        if magic in auto_grid_configs:
                            del auto_grid_configs[magic]
                        if magic in grid_position_tickets:
                            del grid_position_tickets[magic]
                        if magic in grid_total_counts:
                            del grid_total_counts[magic]
                        if magic in auto_close_enabled:
                            del auto_close_enabled[magic]

                        continue  # Move to next magic
                    else:
                        logger.info(f"Grid {magic}: Position closed but auto-close is disabled.")
                        grid_position_tickets[magic] = current_tickets.copy()
                        grid_total_counts[magic] = current_total

                # Check for new positions (from pending orders triggering)
                new_tickets = current_tickets - previous_tickets
                if new_tickets:
                    grid_position_tickets[magic] = current_tickets.copy()
                    logger.info(f"Grid {magic}: New position(s) opened! Tickets: {new_tickets}. Total now: {current_position_count} positions, {current_pending_count} pending")

                    # Align all position TPs to the latest position's TP
                    if current_position_count >= 2:
                        result = mt5_handler.align_all_tp_to_latest(magic)
                        logger.info(f"Grid {magic}: TP alignment result - {result['message']}")

                        if result.get('modified', 0) > 0:
                            # Notify clients about TP alignment
                            await broadcast_positions({
                                "type": "tp_aligned",
                                "magic": magic,
                                "modified": result['modified'],
                                "new_tp": result.get('new_tp'),
                                "message": f"📍 TP Aligned! {result['modified']} positions moved to {result.get('new_tp')}",
                            })

                # Check if all closed
                if current_total == 0 and initial_total > 0:
                    logger.info(f"Grid {magic}: All positions and orders closed")
                    monitoring_magic_numbers.discard(magic)
                    if magic in auto_grid_configs:
                        del auto_grid_configs[magic]
                    if magic in grid_position_tickets:
                        del grid_position_tickets[magic]
                    if magic in grid_total_counts:
                        del grid_total_counts[magic]
                    if magic in auto_close_enabled:
                        del auto_close_enabled[magic]
                else:
                    # Get account info for real-time updates
                    account_info = mt5_handler.get_account_info()

                    # Send position updates to clients
                    await broadcast_positions({
                        "type": "positions_update",
                        "magic": magic,
                        "positions": positions,
                        "pending_orders": pending_orders,
                        "position_count": current_position_count,
                        "pending_count": current_pending_count,
                        "account": account_info,
                    })

            await asyncio.sleep(1)  # Check every second
        except Exception as e:
            logger.error(f"Monitoring error: {str(e)}", exc_info=True)
            await asyncio.sleep(5)

async def start_monitoring():
    """Start the monitoring task if not already running"""
    global monitoring_task
    if monitoring_task is None or monitoring_task.done():
        monitoring_task = asyncio.create_task(monitor_positions())

@app.get("/")
async def root():
    return {
        "message": "MT5 Grid Trading API",
        "status": "running",
        "connected": mt5_handler.initialized,
    }

if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    
    uvicorn.run(app, host=host, port=port)

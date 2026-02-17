import MetaTrader5 as mt5
from typing import Optional, List, Dict
import logging

logger = logging.getLogger(__name__)

class MT5Handler:
    def __init__(self):
        self.initialized = False
        
    def initialize(self, login: int, password: str, server: str, path: str = None) -> bool:
        """Initialize connection to MT5"""
        try:
            if path:
                if not mt5.initialize(path=path, login=login, password=password, server=server):
                    logger.error(f"MT5 initialization failed: {mt5.last_error()}")
                    return False
            else:
                if not mt5.initialize(login=login, password=password, server=server):
                    logger.error(f"MT5 initialization failed: {mt5.last_error()}")
                    return False
            
            self.initialized = True
            logger.info("MT5 initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing MT5: {str(e)}")
            return False
    
    def shutdown(self):
        """Shutdown MT5 connection"""
        if self.initialized:
            mt5.shutdown()
            self.initialized = False
            logger.info("MT5 shutdown")
    
    def get_account_info(self) -> Optional[Dict]:
        """Get account information"""
        if not self.initialized:
            return None
        
        account_info = mt5.account_info()
        if account_info is None:
            return None
        
        return {
            "login": account_info.login,
            "balance": account_info.balance,
            "equity": account_info.equity,
            "margin": account_info.margin,
            "margin_free": account_info.margin_free,
            "profit": account_info.profit,
        }
    
    def place_order(
        self,
        symbol: str,
        order_type: str,  # "BUY" or "SELL"
        volume: float,
        price: float = None,  # If None, use market price
        sl: float = 0.0,
        tp: float = 0.0,
        comment: str = "",
        magic: int = 0,
        use_limit: bool = False  # If True, use pending order at specified price
    ) -> Dict:
        """Place a market order or pending order"""
        if not self.initialized:
            logger.error("MT5 not initialized")
            return {"success": False, "message": "MT5 not initialized"}
        
        # Get symbol info
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            logger.error(f"Symbol {symbol} not found")
            return {"success": False, "message": f"Symbol {symbol} not found"}
        
        if not symbol_info.visible:
            if not mt5.symbol_select(symbol, True):
                logger.error(f"Failed to select {symbol}")
                return {"success": False, "message": f"Failed to select {symbol}"}
        
        # Get current price
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return {"success": False, "message": f"Cannot get price for {symbol}"}
        
        current_ask = tick.ask
        current_bid = tick.bid
        
        # Determine if we should use market or pending order
        if price is not None and price > 0 and use_limit:
            # Use Pending Order (Limit/Stop)
            if order_type == "BUY":
                # BUY Limit: price below current ask, BUY Stop: price above current ask
                if price < current_ask:
                    mt5_order_type = mt5.ORDER_TYPE_BUY_LIMIT
                else:
                    mt5_order_type = mt5.ORDER_TYPE_BUY_STOP
            else:
                # SELL Limit: price above current bid, SELL Stop: price below current bid
                if price > current_bid:
                    mt5_order_type = mt5.ORDER_TYPE_SELL_LIMIT
                else:
                    mt5_order_type = mt5.ORDER_TYPE_SELL_STOP
            
            request = {
                "action": mt5.TRADE_ACTION_PENDING,
                "symbol": symbol,
                "volume": volume,
                "type": mt5_order_type,
                "price": price,
                "sl": sl,
                "tp": tp,
                "magic": magic,
                "comment": comment,
                "type_time": mt5.ORDER_TIME_GTC,
            }
            logger.info(f"Placing pending order: {mt5_order_type} at {price}")
        else:
            # Use Market Order
            exec_price = current_ask if order_type == "BUY" else current_bid
            
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": mt5.ORDER_TYPE_BUY if order_type == "BUY" else mt5.ORDER_TYPE_SELL,
                "price": exec_price,
                "sl": sl,
                "tp": tp,
                "magic": magic,
                "comment": comment,
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            logger.info(f"Placing market order at {exec_price}")
        
        # Send order
        result = mt5.order_send(request)
        
        if result is None:
            error = mt5.last_error()
            logger.error(f"Order send failed: {error}")
            return {"success": False, "message": f"Order send failed: {error}"}
        
        if result.retcode != mt5.TRADE_RETCODE_DONE and result.retcode != mt5.TRADE_RETCODE_PLACED:
            logger.error(f"Order failed: {result.retcode} - {result.comment}")
            return {"success": False, "message": f"Order failed: {result.retcode} - {result.comment}"}
        
        return {
            "success": True,
            "order": result.order,
            "volume": result.volume,
            "price": result.price if result.price > 0 else price,
            "comment": result.comment,
            "request_id": result.request_id,
            "is_pending": use_limit and price is not None and price > 0,
        }
    
    def close_position(self, ticket: int) -> bool:
        """Close a position by ticket"""
        if not self.initialized:
            return False
        
        position = mt5.positions_get(ticket=ticket)
        if position is None or len(position) == 0:
            logger.error(f"Position {ticket} not found")
            return False
        
        position = position[0]
        
        # Prepare close request
        symbol = position.symbol
        volume = position.volume
        order_type = mt5.ORDER_TYPE_SELL if position.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        price = mt5.symbol_info_tick(symbol).bid if position.type == mt5.ORDER_TYPE_BUY else mt5.symbol_info_tick(symbol).ask
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "position": ticket,
            "price": price,
            "magic": position.magic,
            "comment": "Close by app",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logger.error(f"Close failed: {result.retcode}")
            return False
        
        return True
    
    def get_positions(self, symbol: str = None, magic: int = None) -> List[Dict]:
        """Get open positions"""
        if not self.initialized:
            return []
        
        if symbol:
            positions = mt5.positions_get(symbol=symbol)
        else:
            positions = mt5.positions_get()
        
        if positions is None:
            return []
        
        result = []
        for pos in positions:
            if magic is not None and pos.magic != magic:
                continue
            
            result.append({
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": "BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL",
                "volume": pos.volume,
                "price_open": pos.price_open,
                "sl": pos.sl,
                "tp": pos.tp,
                "price_current": pos.price_current,
                "profit": pos.profit,
                "magic": pos.magic,
                "comment": pos.comment,
            })
        
        return result
    
    def close_positions_by_magic(self, magic: int) -> int:
        """Close all positions with specific magic number"""
        if not self.initialized:
            return 0
        
        positions = self.get_positions(magic=magic)
        closed_count = 0
        
        for pos in positions:
            if self.close_position(pos["ticket"]):
                closed_count += 1
        
        return closed_count
    
    def cancel_orders_by_magic(self, magic: int) -> int:
        """Cancel all pending orders with specific magic number"""
        if not self.initialized:
            logger.error("MT5 not initialized for cancel_orders_by_magic")
            return 0
        
        orders = mt5.orders_get()
        logger.info(f"Found {len(orders) if orders else 0} total pending orders")
        
        if orders is None or len(orders) == 0:
            logger.info("No pending orders found")
            return 0
        
        cancelled_count = 0
        for order in orders:
            logger.info(f"Checking order {order.ticket}: magic={order.magic}, target_magic={magic}")
            if order.magic == magic:
                request = {
                    "action": mt5.TRADE_ACTION_REMOVE,
                    "order": order.ticket,
                }
                result = mt5.order_send(request)
                if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                    cancelled_count += 1
                    logger.info(f"Cancelled pending order {order.ticket}")
                else:
                    error_msg = result.comment if result else "No result"
                    logger.error(f"Failed to cancel order {order.ticket}: retcode={result.retcode if result else 'N/A'}, {error_msg}")
        
        return cancelled_count
    
    def close_all_by_magic(self, magic: int) -> dict:
        """Close all positions AND cancel all pending orders with specific magic number"""
        logger.info(f"close_all_by_magic called with magic={magic}")
        
        if not self.initialized:
            logger.error("MT5 not initialized for close_all_by_magic")
            return {"positions_closed": 0, "orders_cancelled": 0}
        
        # First cancel pending orders
        logger.info("Cancelling pending orders...")
        orders_cancelled = self.cancel_orders_by_magic(magic)
        logger.info(f"Cancelled {orders_cancelled} pending orders")
        
        # Then close positions
        logger.info("Closing positions...")
        positions_closed = self.close_positions_by_magic(magic)
        logger.info(f"Closed {positions_closed} positions")
        
        return {
            "positions_closed": positions_closed,
            "orders_cancelled": orders_cancelled,
        }
    
    def get_pending_orders(self, magic: int = None) -> List[Dict]:
        """Get pending orders"""
        if not self.initialized:
            return []
        
        orders = mt5.orders_get()
        if orders is None:
            return []
        
        result = []
        for order in orders:
            if magic is not None and order.magic != magic:
                continue
            
            order_type_map = {
                mt5.ORDER_TYPE_BUY_LIMIT: "BUY_LIMIT",
                mt5.ORDER_TYPE_SELL_LIMIT: "SELL_LIMIT",
                mt5.ORDER_TYPE_BUY_STOP: "BUY_STOP",
                mt5.ORDER_TYPE_SELL_STOP: "SELL_STOP",
            }
            
            result.append({
                "ticket": order.ticket,
                "symbol": order.symbol,
                "type": order_type_map.get(order.type, str(order.type)),
                "volume": order.volume_current,
                "price_open": order.price_open,
                "sl": order.sl,
                "tp": order.tp,
                "magic": order.magic,
                "comment": order.comment,
            })
        
        return result
    
    def modify_position_tp(self, ticket: int, new_tp: float) -> bool:
        """Modify the take profit of an existing position"""
        if not self.initialized:
            logger.error("MT5 not initialized for modify_position_tp")
            return False
        
        # Get position info
        position = mt5.positions_get(ticket=ticket)
        if position is None or len(position) == 0:
            logger.error(f"Position {ticket} not found")
            return False
        
        position = position[0]
        
        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": position.symbol,
            "position": ticket,
            "sl": position.sl,  # Keep existing SL
            "tp": new_tp,
        }
        
        result = mt5.order_send(request)
        
        if result is None:
            error = mt5.last_error()
            logger.error(f"Modify TP failed for {ticket}: {error}")
            return False
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logger.error(f"Modify TP failed for {ticket}: {result.retcode} - {result.comment}")
            return False
        
        logger.info(f"Modified TP for position {ticket} to {new_tp}")
        return True
    
    def align_all_tp_to_latest(self, magic: int) -> dict:
        """Align all position TPs to the latest position's TP"""
        if not self.initialized:
            return {"success": False, "message": "MT5 not initialized", "modified": 0}
        
        positions = self.get_positions(magic=magic)
        if len(positions) < 2:
            return {"success": True, "message": "Less than 2 positions, no alignment needed", "modified": 0}
        
        # Find the latest position (highest ticket number = most recent)
        latest_position = max(positions, key=lambda x: x["ticket"])
        latest_tp = latest_position["tp"]
        
        if latest_tp == 0:
            return {"success": False, "message": "Latest position has no TP set", "modified": 0}
        
        modified_count = 0
        for pos in positions:
            if pos["ticket"] != latest_position["ticket"] and pos["tp"] != latest_tp:
                if self.modify_position_tp(pos["ticket"], latest_tp):
                    modified_count += 1
                    logger.info(f"Aligned position {pos['ticket']} TP from {pos['tp']} to {latest_tp}")
        
        return {
            "success": True,
            "message": f"Aligned {modified_count} positions to TP {latest_tp}",
            "modified": modified_count,
            "new_tp": latest_tp,
        }
    
    def get_symbols(self) -> List[str]:
        """Get all available symbols that account can trade"""
        if not self.initialized:
            return []
        
        symbols = mt5.symbols_get()
        if symbols is None:
            return []
        
        # Filter symbols that can be traded by this account
        # Check: trade mode enabled, not disabled, and has valid trade contract size
        tradeable_symbols = []
        for s in symbols:
            # TRADE_MODE_FULL = 0 means full trading allowed
            # Check if symbol has trading enabled and is not disabled
            if s.trade_mode != 0:  # 0 = TRADE_MODE_DISABLED
                # Try to select symbol to make it visible/tradeable
                if not s.visible:
                    mt5.symbol_select(s.name, True)
                tradeable_symbols.append(s.name)
        
        return sorted(tradeable_symbols)
    
    def get_account_symbols(self) -> List[str]:
        """Get symbols available for this specific account/broker"""
        if not self.initialized:
            return []
        
        symbols = mt5.symbols_get()
        if symbols is None:
            return []
        
        # Get account info to check broker type
        account = mt5.account_info()
        if account is None:
            return self.get_symbols()
        
        # Filter symbols based on what's actually tradeable
        tradeable = []
        for s in symbols:
            # Check multiple conditions for tradeability
            # trade_mode: 0=disabled, 1=longonly, 2=shortonly, 3=closeonly, 4=full
            if s.trade_mode == 0:  # Disabled
                continue
            
            # Check if spread is reasonable (not disabled symbol)
            if s.spread <= 0 and s.trade_mode != 4:
                continue
                
            # Check if has valid trade parameters
            if s.trade_contract_size <= 0:
                continue
            
            # Select symbol to ensure it's available
            if not s.visible:
                mt5.symbol_select(s.name, True)
            
            tradeable.append(s.name)
        
        return sorted(tradeable)

# Global MT5 handler instance
mt5_handler = MT5Handler()

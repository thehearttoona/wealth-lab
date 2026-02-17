import json
import os
from datetime import datetime
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

# Use absolute path in the same directory as this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(SCRIPT_DIR, "trade_history.json")

class TradeHistoryManager:
    def __init__(self, history_file: str = HISTORY_FILE):
        self.history_file = history_file
        self.history: List[dict] = []
        self.active_grids: dict = {}  # magic -> grid info (start time, symbol, etc.)
        logger.info(f"TradeHistoryManager initialized. History file: {self.history_file}")
        self._load_history()

    def _load_history(self):
        """Load history from file"""
        logger.info(f"Loading history from: {self.history_file}")
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, 'r', encoding='utf-8') as f:
                    self.history = json.load(f)
                logger.info(f"Loaded {len(self.history)} trade history records")
            except Exception as e:
                logger.error(f"Error loading history: {e}")
                self.history = []
        else:
            logger.info(f"History file does not exist yet: {self.history_file}")
            self.history = []

    def _save_history(self):
        """Save history to file"""
        try:
            logger.info(f"Saving {len(self.history)} records to: {self.history_file}")
            with open(self.history_file, 'w', encoding='utf-8') as f:
                json.dump(self.history, f, indent=2, ensure_ascii=False)
            logger.info(f"Successfully saved {len(self.history)} trade history records")
        except Exception as e:
            logger.error(f"Error saving history: {e}", exc_info=True)

    def start_grid(self, magic: int, symbol: str, direction: str, first_lot: float):
        """Record when a grid starts"""
        self.active_grids[magic] = {
            "magic": magic,
            "symbol": symbol,
            "direction": direction,
            "first_lot": first_lot,
            "opened_at": datetime.now().isoformat(),
            "max_positions": 0,
            "total_lots": 0.0,
            "cost_basis": 0.0,
        }
        logger.info(f"=== TRADE HISTORY: Grid {magic} started tracking: {symbol} {direction} ===")
        logger.info(f"Active grids now: {list(self.active_grids.keys())}")

    def update_grid_stats(self, magic: int, position_count: int, total_lots: float, cost_basis: float = 0.0):
        """Update max positions, total lots, and cost basis for active grid"""
        if magic in self.active_grids:
            if position_count > self.active_grids[magic]["max_positions"]:
                self.active_grids[magic]["max_positions"] = position_count
            if total_lots > self.active_grids[magic]["total_lots"]:
                self.active_grids[magic]["total_lots"] = total_lots
            if cost_basis > self.active_grids[magic].get("cost_basis", 0):
                self.active_grids[magic]["cost_basis"] = cost_basis

    def close_grid(self, magic: int, profit: float, close_reason: str) -> Optional[dict]:
        """Record when a grid closes and save to history"""
        logger.info(f"=== TRADE HISTORY: close_grid called for magic={magic}, profit={profit}, reason={close_reason} ===")
        logger.info(f"Active grids: {list(self.active_grids.keys())}")

        if magic not in self.active_grids:
            logger.warning(f"Grid {magic} not found in active grids - creating minimal record")
            # Create a minimal record anyway
            record = {
                "id": f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{magic}",
                "magic": magic,
                "symbol": "UNKNOWN",
                "direction": "UNKNOWN",
                "first_lot": 0,
                "max_positions_opened": 0,
                "total_lots": 0,
                "profit": profit,
                "cost_basis": 0,
                "profit_percent": 0,
                "close_reason": close_reason,
                "opened_at": datetime.now().isoformat(),
                "closed_at": datetime.now().isoformat(),
                "duration_minutes": 0,
            }
        else:
            grid_info = self.active_grids[magic]
            opened_at = datetime.fromisoformat(grid_info["opened_at"])
            closed_at = datetime.now()
            duration = (closed_at - opened_at).total_seconds() / 60

            cost_basis = grid_info.get("cost_basis", 0)
            profit_percent = round((profit / cost_basis) * 100, 4) if cost_basis > 0 else 0

            record = {
                "id": f"{closed_at.strftime('%Y%m%d_%H%M%S')}_{magic}",
                "magic": magic,
                "symbol": grid_info["symbol"],
                "direction": grid_info["direction"],
                "first_lot": grid_info["first_lot"],
                "max_positions_opened": grid_info["max_positions"],
                "total_lots": grid_info["total_lots"],
                "profit": profit,
                "cost_basis": round(cost_basis, 2),
                "profit_percent": profit_percent,
                "close_reason": close_reason,
                "opened_at": grid_info["opened_at"],
                "closed_at": closed_at.isoformat(),
                "duration_minutes": round(duration, 2),
            }

            # Remove from active grids
            del self.active_grids[magic]

        # Add to history and save
        self.history.append(record)
        self._save_history()

        logger.info(f"=== TRADE HISTORY: Grid {magic} closed and saved! ===")
        logger.info(f"  - Profit: {profit}")
        logger.info(f"  - Reason: {close_reason}")
        logger.info(f"  - Total history records: {len(self.history)}")
        logger.info(f"  - Record: {record}")
        return record

    def get_history(self, limit: int = 50, symbol: str = None) -> List[dict]:
        """Get trade history, optionally filtered by symbol"""
        filtered = self.history
        if symbol:
            filtered = [h for h in filtered if h.get("symbol") == symbol]

        # Return most recent first
        return sorted(filtered, key=lambda x: x.get("closed_at", ""), reverse=True)[:limit]

    def get_stats(self, symbol: str = None) -> dict:
        """Calculate statistics from history"""
        filtered = self.history
        if symbol:
            filtered = [h for h in filtered if h.get("symbol") == symbol]

        if not filtered:
            return {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0,
                "total_profit": 0,
                "total_loss": 0,
                "net_profit": 0,
                "average_profit": 0,
                "average_loss": 0,
                "largest_win": 0,
                "largest_loss": 0,
                "average_duration_minutes": 0,
                "average_profit_percent": 0,
            }

        profits = [h["profit"] for h in filtered]
        wins = [p for p in profits if p > 0]
        losses = [p for p in profits if p < 0]
        durations = [h.get("duration_minutes", 0) for h in filtered]
        win_percents = [h.get("profit_percent", 0) for h in filtered if h["profit"] > 0 and h.get("profit_percent")]

        total_trades = len(filtered)
        winning_trades = len(wins)
        losing_trades = len(losses)

        return {
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "losing_trades": losing_trades,
            "win_rate": round((winning_trades / total_trades) * 100, 2) if total_trades > 0 else 0,
            "total_profit": round(sum(wins), 2),
            "total_loss": round(sum(losses), 2),
            "net_profit": round(sum(profits), 2),
            "average_profit": round(sum(wins) / len(wins), 2) if wins else 0,
            "average_loss": round(sum(losses) / len(losses), 2) if losses else 0,
            "largest_win": round(max(wins), 2) if wins else 0,
            "largest_loss": round(min(losses), 2) if losses else 0,
            "average_duration_minutes": round(sum(durations) / len(durations), 2) if durations else 0,
            "average_profit_percent": round(sum(win_percents) / len(win_percents), 4) if win_percents else 0,
        }

    def delete_record(self, record_id: str) -> bool:
        """Delete a single record by ID"""
        original_len = len(self.history)
        self.history = [h for h in self.history if h.get("id") != record_id]
        if len(self.history) < original_len:
            self._save_history()
            return True
        return False

    def clear_history(self) -> int:
        """Clear all history and return count of deleted records"""
        count = len(self.history)
        self.history = []
        self._save_history()
        return count


# Global instance
trade_history = TradeHistoryManager()

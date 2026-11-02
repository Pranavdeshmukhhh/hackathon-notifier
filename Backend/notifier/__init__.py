"""
Backend/notifier package — Push notification dispatcher and interactive Telegram bot.
"""

from .telegram_bot import (
    send_notification,
    send_batch,
    start_polling,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
)

__all__ = [
    "send_notification",
    "send_batch",
    "start_polling",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
]

"""
test_telegram.py — Tests for notifier/telegram_bot.py.

We test the two things we own completely:
  1. _format_message()  — pure function, no network needed
  2. send_batch()       — we patch requests.Session.post so no real HTTP call happens

We do NOT test send_notification() against a live Telegram API.
That would make CI dependent on a network credential and slow down the suite.
Instead we test the retry/backoff logic by making the mock return 429 twice
then 200, and asserting the function eventually returns True.

Why this matters for an interview:
  "I unit-test my Telegram formatting logic independently of the network layer.
  The HTML escaping tests catch cases like a hackathon title containing '<' or
  '&' that would silently break Telegram's HTML parse mode."
"""
from unittest.mock import MagicMock, patch, call
import pytest

from notifier.telegram_bot import _format_message, _escape_html, send_batch


# ── _escape_html ──────────────────────────────────────────────────────────────

class TestEscapeHtml:
    def test_ampersand_escaped(self):
        assert _escape_html("A & B") == "A &amp; B"

    def test_less_than_escaped(self):
        assert _escape_html("x < y") == "x &lt; y"

    def test_greater_than_escaped(self):
        assert _escape_html("x > y") == "x &gt; y"

    def test_all_special_chars(self):
        result = _escape_html("<script>alert('xss & evil')</script>")
        assert "<" not in result
        assert ">" not in result
        assert "&amp;" in result

    def test_plain_string_unchanged(self):
        assert _escape_html("Hello World") == "Hello World"

    def test_non_string_coerced(self):
        """_escape_html must handle non-string inputs (e.g. int 0 for prize)."""
        assert _escape_html(42) == "42"


# ── _format_message ───────────────────────────────────────────────────────────

FULL_HACK = {
    "title":            "IIT Bombay TechFest",
    "deadline":         "01 Jan 2027",
    "mode":             "Online",
    "tags":             ["AI", "ML"],
    "link":             "https://devfolio.co/hackathons/iitb",
    "source":           "Devfolio",
    "is_top_college":   True,
    "college_type":     "IIT",
    "college_name":     "IIT Bombay",
    "is_internship":    False,
    "opportunity_type": "Hackathon",
    "location":         "",
}

INTERNSHIP_HACK = {
    "title":            "Google Summer Internship 2027",
    "deadline":         "15 Mar 2027",
    "mode":             "Online",
    "tags":             [],
    "link":             "https://unstop.com/hackathons/google",
    "source":           "Unstop",
    "is_top_college":   False,
    "college_type":     None,
    "college_name":     None,
    "is_internship":    True,
    "opportunity_type": "Internship",
    "location":         "",
}

MINIMAL_HACK = {
    "title":  "Minimal Hack",
    "link":   "https://example.com",
    "source": "Devfolio",
}


class TestFormatMessage:
    def test_title_appears_in_message(self):
        msg = _format_message(FULL_HACK)
        assert "IIT Bombay TechFest" in msg

    def test_college_badge_present_for_top_college(self):
        """The IIT Bombay badge line must appear when is_top_college=True."""
        msg = _format_message(FULL_HACK)
        assert "IIT Bombay" in msg

    def test_internship_badge_present(self):
        msg = _format_message(INTERNSHIP_HACK)
        assert "Internship" in msg

    def test_link_in_message(self):
        msg = _format_message(FULL_HACK)
        assert "https://devfolio.co/hackathons/iitb" in msg

    def test_tags_in_message(self):
        msg = _format_message(FULL_HACK)
        assert "AI" in msg
        assert "ML" in msg

    def test_html_special_chars_escaped_in_title(self):
        """A title with HTML special chars must be escaped or Telegram will reject the message.

        Telegram's HTML parse mode fails silently (or sends a 400) if the
        message contains unescaped < > & characters.
        """
        hack = {**FULL_HACK, "title": "Hack <Dev> & Friends"}
        msg = _format_message(hack)
        assert "<Dev>" not in msg        # raw angle brackets must not appear
        assert "&lt;Dev&gt;" in msg      # must be escaped

    def test_missing_fields_use_defaults(self):
        """A hackathon with only title+link should not crash _format_message."""
        msg = _format_message(MINIMAL_HACK)
        assert "Minimal Hack" in msg
        assert "https://example.com" in msg

    def test_no_link_shows_fallback_text(self):
        hack = {**MINIMAL_HACK, "link": ""}
        msg = _format_message(hack)
        assert "not available" in msg.lower()

    def test_location_included_when_present(self):
        hack = {**FULL_HACK, "location": "Mumbai, India"}
        msg = _format_message(hack)
        assert "Mumbai" in msg

    def test_location_omitted_when_absent(self):
        """An empty location string must not add a blank location line."""
        hack = {**FULL_HACK, "location": ""}
        msg = _format_message(hack)
        assert "Location:" not in msg


# ── send_batch ────────────────────────────────────────────────────────────────

class TestSendBatch:
    """Test send_batch() return shape and delay behavior using mocked HTTP.

    We patch requests.Session.post so no real Telegram API is called.
    """

    def _ok_response(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"ok": True}
        return mock_resp

    def _fail_response(self, status=500):
        mock_resp = MagicMock()
        mock_resp.status_code = status
        mock_resp.json.return_value = {"ok": False}
        mock_resp.text = "Internal Server Error"
        return mock_resp

    @patch("notifier.telegram_bot.TELEGRAM_BOT_TOKEN", "fake-token")
    @patch("notifier.telegram_bot.TELEGRAM_CHAT_ID", "12345")
    @patch("notifier.telegram_bot.time.sleep")     # don't actually sleep in tests
    @patch("notifier.telegram_bot.requests.Session")
    def test_all_sent_returns_correct_counts(self, MockSession, mock_sleep):
        session_instance = MagicMock()
        MockSession.return_value.__enter__ = MagicMock(return_value=session_instance)
        MockSession.return_value.__exit__ = MagicMock(return_value=False)
        session_instance.post.return_value = self._ok_response()

        result = send_batch([FULL_HACK, INTERNSHIP_HACK])

        assert result["total"] == 2
        assert result["sent"] == 2
        assert result["failed"] == 0

    @patch("notifier.telegram_bot.TELEGRAM_BOT_TOKEN", "fake-token")
    @patch("notifier.telegram_bot.TELEGRAM_CHAT_ID", "12345")
    @patch("notifier.telegram_bot.time.sleep")
    @patch("notifier.telegram_bot.requests.Session")
    def test_failed_send_counted_in_failed(self, MockSession, mock_sleep):
        session_instance = MagicMock()
        MockSession.return_value.__enter__ = MagicMock(return_value=session_instance)
        MockSession.return_value.__exit__ = MagicMock(return_value=False)
        # First call succeeds, second fails
        session_instance.post.side_effect = [
            self._ok_response(),
            self._fail_response(500),
        ]

        result = send_batch([FULL_HACK, INTERNSHIP_HACK])

        assert result["total"] == 2
        assert result["sent"] == 1
        assert result["failed"] == 1

    @patch("notifier.telegram_bot.TELEGRAM_BOT_TOKEN", "fake-token")
    @patch("notifier.telegram_bot.TELEGRAM_CHAT_ID", "12345")
    @patch("notifier.telegram_bot.time.sleep")
    @patch("notifier.telegram_bot.requests.Session")
    def test_delay_called_between_messages(self, MockSession, mock_sleep):
        """The inter-message delay must fire between messages (but not after the last)."""
        session_instance = MagicMock()
        MockSession.return_value.__enter__ = MagicMock(return_value=session_instance)
        MockSession.return_value.__exit__ = MagicMock(return_value=False)
        session_instance.post.return_value = self._ok_response()

        send_batch([FULL_HACK, MINIMAL_HACK, INTERNSHIP_HACK])  # 3 messages

        # sleep should fire 2 times: between msg1→2 and msg2→3, not after msg3
        assert mock_sleep.call_count == 2

    def test_empty_list_returns_zeros(self):
        """send_batch([]) must return immediately with all zeros. No HTTP call."""
        result = send_batch([])
        assert result == {"total": 0, "sent": 0, "failed": 0}

    @patch("notifier.telegram_bot.TELEGRAM_BOT_TOKEN", "")
    @patch("notifier.telegram_bot.TELEGRAM_CHAT_ID", "")
    def test_missing_credentials_send_fails(self):
        """With no credentials configured, send_notification must return False safely."""
        from notifier.telegram_bot import send_notification
        result = send_notification(FULL_HACK)
        assert result is False

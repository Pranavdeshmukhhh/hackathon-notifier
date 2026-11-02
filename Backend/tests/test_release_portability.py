"""Release integration checks without system timezone data or external services."""
import os
import subprocess
import sys


def test_iana_timezones_available_without_operating_system_database():
    result = subprocess.run([sys.executable, '-c',
        'from zoneinfo import ZoneInfo; assert ZoneInfo("Asia/Kolkata").key == "Asia/Kolkata"'],
        env={**os.environ, 'PYTHONTZPATH': ''}, capture_output=True, text=True)
    assert result.returncode == 0, 'Install the pinned tzdata package for Windows/IANA timezone support'

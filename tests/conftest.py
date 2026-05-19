"""Pytest configuration - mock the decky module so main.py can be imported."""

import sys
from types import ModuleType
from unittest.mock import MagicMock

# Create a mock decky module before any test imports main
mock_decky = ModuleType('decky')
mock_decky.logger = MagicMock()
mock_decky.DECKY_PLUGIN_DIR = '/tmp/test_plugin'
mock_decky.HOME = '/tmp/test_home'
sys.modules['decky'] = mock_decky

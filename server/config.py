from typing import Dict, Tuple

# Serial Configuration
SERIAL_BAUD_RATE = 115200
SERIAL_RECONNECT_DELAY = 3.0
KNOWN_USB_VIDS_PIDS = [
    (0x1A86, 0x7523),  # CH340
    (0x10C4, 0xEA60),  # CP2102
    (0x303A, 0x1001),  # ESP32-C3 Native USB
]

# Topology Watchdog Constants
HEARTBEAT_INTERVAL_SEC = 30.0
MAX_MISSED_HEARTBEATS = 2
RSSI_DEGRADATION_THRESHOLD = -95.0  # dBm
SNR_DEGRADATION_THRESHOLD = -5.0    # dB
RF_WINDOW_SIZE = 5

# Local LLM Configuration
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "qwen2.5:3b"  # Fallback: "llama3.2:3b"

# Fleet Ceiling Constraints
MAX_DRONE_FLEET = 6
BATTERY_HANDOVER_THRESHOLD = 25  # % battery triggers Tethered Aerostat Balloon handover

# Baseline Kathmandu Terrestrial Mesh Coordinates (Lat, Lon, Alt in meters)
BASELINE_NODES: Dict[str, Tuple[float, float, float]] = {
    "0x0001": (27.7172, 85.3240, 1350.0),  # Base Camp Helper
    "N1": (27.7050, 85.3150, 1310.0),
    "N2": (27.6950, 85.3200, 1305.0),
    "N3": (27.6850, 85.3250, 1295.0),      # Floodplain sector
    "N4": (27.6750, 85.3300, 1290.0),
    "N5": (27.7100, 85.3400, 1330.0),
    "N6": (27.7000, 85.3450, 1320.0),
    "N7": (27.6900, 85.3100, 1300.0),
    "N8": (27.6800, 85.3200, 1300.0),
}


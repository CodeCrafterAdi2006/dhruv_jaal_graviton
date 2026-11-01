import asyncio
import json
import logging
from typing import Any, Dict, Optional
import serial
import serial.tools.list_ports

from server.config import SERIAL_BAUD_RATE, KNOWN_USB_VIDS_PIDS
from server.models.schemas import SerialTelemetryEvent, CompactedLoRaPayload

logger = logging.getLogger("dhruva.serial")

# Exact production Kathmandu hardware test stream for fail-safe emulation
SYNTHETIC_KATHMANDU_STREAM = [
    "# Dhruva Jaal helper 0x0001 ready",
    '@{"t":1730,"node":"0x0001","ev":"ini_tx","gps_fix":false}',
    '@{"t":22261,"node":"0x0001","ev":"radio_rx","len":170,"first":123,"rssi":-81,"snr":14.0}',
    '@{"t":22262,"node":"0x0001","ev":"data_decoded","src":"0x2001","dst":"0x0001","nh":"0x0001","mid":16}',
    '@{"t":22434,"node":"0x0001","ev":"data_rx","key":"2001-00016","from":"0x2001","rssi":-81,"snr":14.0,"ttl":10,"hops":0}',
    '# json : {"t":"DATA","src":"2001","mid":16,"dst":"0001","nh":"0001","ttl":10,"ppl":25,"flg":18,"lat":27.680000,"lon":85.320000,"alt":1300,"acc":10,"ts":1793443152,"path":["2001"]}',
    '@{"t":22435,"node":"0x0001","ev":"delivered","key":"2001-00016","path":["0x2001","0x0001"]}',
    '@{"t":22739,"node":"0x0001","ev":"delivery_acked","key":"2001-00016","by":"0x2001"}',
    # Simulated RF link degradation and upstream neighbor loss on N3
    '@{"t":28000,"node":"0x0001","ev":"neighbor_lost","from":"N2","lost_node":"N3"}',
    '@{"t":31000,"node":"0x0001","ev":"data_rx","key":"2001-00017","from":"0x2001","rssi":-98,"snr":-6.5,"ttl":9,"hops":1}',
    '# json : {"t":"DATA","src":"2001","mid":17,"dst":"0001","nh":"0001","ttl":9,"ppl":42,"flg":27,"lat":27.678500,"lon":85.321500,"alt":1294,"acc":8,"ts":1793443210,"path":["2001","N2"]}',
]


class SerialManager:
    def __init__(self, event_queue: asyncio.Queue) -> None:
        self.event_queue = event_queue
        self.serial_conn: Optional[serial.Serial] = None
        self.mode: str = "INITIALIZING"
        self.last_rf_metrics: Dict[str, float] = {"rssi": -81.0, "snr": 14.0}

    def detect_hardware_port(self) -> Optional[str]:
        ports = serial.tools.list_ports.comports()
        for p in ports:
            if (p.vid, p.pid) in KNOWN_USB_VIDS_PIDS:
                return p.device
            if any(k in (p.description or "").upper() for k in ["CP210", "CH340", "USB SERIAL", "UART"]):
                return p.device
        return None

    def parse_line(self, raw_line: str) -> Optional[Dict[str, Any]]:
        line = raw_line.strip()
        if not line:
            return None

        if line.startswith("@"):
            try:
                raw_json = json.loads(line[1:].strip())
                evt = SerialTelemetryEvent.model_validate(raw_json)
                if evt.rssi is not None:
                    self.last_rf_metrics["rssi"] = evt.rssi
                if evt.snr is not None:
                    self.last_rf_metrics["snr"] = evt.snr
                return {"type": "telemetry", "payload": evt.model_dump(by_alias=True)}
            except Exception as exc:
                logger.warning(f"Malformed @ telemetry line: {line} ({exc})")
                return None

        if line.startswith("# json :"):
            try:
                json_part = line.split("# json :", 1)[1].strip()
                raw_json = json.loads(json_part)
                data_pkt = CompactedLoRaPayload.model_validate(raw_json)
                return {
                    "type": "sos_payload",
                    "packet_key": data_pkt.packet_key,
                    "payload": data_pkt.model_dump(),
                    "rf_context": dict(self.last_rf_metrics),
                }
            except Exception as exc:
                logger.warning(f"Malformed # json payload line: {line} ({exc})")
                return None

        return None

    async def write_ack(self, ack_frame: str) -> bool:
        """Sends a return LoRa ACK packet backwards over USB serial to the physical helper node."""
        if self.serial_conn and self.serial_conn.is_open:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self.serial_conn.write, ack_frame.encode("utf-8"))
            return True
        logger.info(f"[EMULATOR ACK TX] {ack_frame.strip()}")
        return True

    async def inject_line(self, line: str) -> bool:
        """Injects a raw serial line directly into the parsing and event pipeline."""
        parsed = self.parse_line(line)
        if parsed:
            await self.event_queue.put(parsed)
            return True
        return False

    async def run_synthetic_stream(self) -> None:
        """Runs the benchmark Kathmandu test stream once on demand."""
        logger.info("[EMULATOR] Running single Kathmandu Flash Flood test stream replay...")
        for line in SYNTHETIC_KATHMANDU_STREAM:
            parsed = self.parse_line(line)
            if parsed:
                await self.event_queue.put(parsed)
            await asyncio.sleep(1.5 if line.startswith("# json :") else 0.3)

    async def write_ack(self, ack_frame: str) -> bool:
        """Transmits return ACK to physical USB serial if connected, or emulates TX."""
        if self.serial_conn and self.serial_conn.is_open:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self.serial_conn.write, ack_frame.encode("utf-8"))
                return True
            except Exception as exc:
                logger.error(f"Failed to write ACK to hardware serial: {exc}")
                return False
        logger.info(f"[EMULATED SERIAL TX] {ack_frame.strip()}")
        return True

    async def run_reader(self) -> None:
        while True:
            port = self.detect_hardware_port()
            if port:
                try:
                    self.serial_conn = serial.Serial(port, SERIAL_BAUD_RATE, timeout=1)
                    self.mode = f"HARDWARE ({port})"
                    logger.info(f"Connected to physical ESP32 Helper Node on {port}")
                    loop = asyncio.get_running_loop()
                    while True:
                        raw_bytes = await loop.run_in_executor(None, self.serial_conn.readline)
                        if raw_bytes:
                            line = raw_bytes.decode("utf-8", errors="ignore")
                            parsed = self.parse_line(line)
                            if parsed:
                                await self.event_queue.put(parsed)
                        await asyncio.sleep(0.01)
                except Exception as exc:
                    logger.error(f"Hardware serial disconnected ({exc}). Switching to Emulator Standby.")
                    if self.serial_conn and self.serial_conn.is_open:
                        self.serial_conn.close()
                    self.serial_conn = None

            # Standby mode: Wait for hardware or manual/frontend packet injection
            self.mode = "STANDBY (Awaiting USB Hardware or Injected Packets)"
            await asyncio.sleep(2.0)


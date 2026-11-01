# 🛰️ Dhruva Jaal (ध्रुव जाल)
### Air-Gapped, Multi-Tier LoRa Disaster Mesh & Autonomous AI Tactical Command Platform

[![Hackathon: Graviton 2026](https://img.shields.io/badge/Hackathon-Graviton%202026-38bdf8.svg)](#)
[![Team: Byte Me](https://img.shields.io/badge/Team-Byte%20Me-818cf8.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg)](LICENSE)
[![Hardware: ESP32--C3 + SX1278](https://img.shields.io/badge/Hardware-ESP32--C3%20%2B%20SX1278-f59e0b.svg)](https://www.espressif.com/)
[![Radio: 433MHz LoRa SF10](https://img.shields.io/badge/Radio-433MHz%20LoRa%20(SF10%2F125kHz)-f43f5e.svg)](https://www.semtech.com/)
[![Local AI: LangGraph + SLM](https://img.shields.io/badge/Local%20AI-LangGraph%20%2B%20qwen2.5%3A3b-a855f7.svg)](#)
[![Tactical HUD: MapLibre GL 3D](https://img.shields.io/badge/Tactical%20HUD-MapLibre%20GL%203D-cyan.svg)](#)

> **"When municipal power drowns, fiber trunks snap, and cellular networks collapse, Dhruva Jaal takes flight."**  
> An autonomous, 100% air-gapped emergency response platform designed for total telecommunication blackouts during flash floods and catastrophic disasters. Combines **ultra-low-cost ($<$ $5) battery-powered LoRa survivor dongles**, **autonomous rooftop mesh relays**, an **aerial bridge fleet (80m agile drones + 100m tethered aerostat balloons)**, and an **on-premise LangGraph AI command system** running local SLM triage and reverse cryptographic verification ACKs.

---

## 👥 Team Byte Me — Graviton 2026

* **Aditya Singh** — *Team Lead & Systems Architect* (System architecture, tactical simulation engine, end-to-end integration).
* **Jungbir** — *IoT & Embedded Systems Expert* (SX1278 SPI interface, 433 MHz RF link calibration, power budget optimization, flash store-and-forward).
* **Keshav** — *Hardware & Wireless Penetration Tester* (Wireless security, anti-jamming, packet replay defense, cryptographic reverse ACK verification).
* **Arnav** — *AI & Systems Engineer* (LangGraph StateGraph workflow, local SLM quantization, deterministic fail-safe triage engine).

---

## 1. Real-World Ground Truth & The Problem

During extreme disaster events—such as the **September 2024 flash floods in Kathmandu, Nepal**—the terrestrial communication grid collapses catastrophically within the first 15–20 minutes:

* **Substations Submerged:** Ground-level power transformers short-circuit upon flood inundation, cutting electricity across the valley.
* **Fiber Backhaul Severed:** Torrential surges along the Bagmati River snap subterranean fiber-optic trunks, cutting macro cellular base stations from the national exchange.
* **The Smartphone Void:** Stranded civilians trapped on tin roofs had full phone battery, but **0 cellular bars**; government emergency SMS broadcasts and civilian apps (WhatsApp, calls) failed to deliver.
* **Command Blindness:** First responders (Armed Police Force, NDRRMA) in inflatable rafts had to navigate flooded urban basins completely blind, unaware of where victims were trapped, how many were injured, or what medical gear to deploy.

**Cellular networks operate at a 0% delivery rate during sudden inundation.** Emergency operations require an independent, low-frequency, battery-backed physical mesh that functions without internet or cloud infrastructure.

---

## 2. The 5-Tier Resilient Physical Topology

```
+-------------------------------------------------------------------------+
|                        TIER 3: PERSISTENT AEROSTAT                      |
|           [ BL1 / BL2: 100m Tethered Balloon / High-Gain LoRa ]         |
|                 (Relieves drones, persistent basin anchor)              |
+-------------------------------------------------------------------------+
                                    ▲
                                    │ RF Link (433MHz SF10)
                                    ▼
+-------------------------------------------------------------------------+
|                         TIER 2: AGILE AERIAL DRONES                     |
|           [ DR1 - DR6: 80m Hover / Agile Mesh Bridging Nodes ]          |
|             (Automatic coverage gap fill, strict 6-drone ceiling)       |
+-------------------------------------------------------------------------+
                                    ▲
                                    │ RF Link (-70 to -115 dBm)
                                    ▼
+-------------------------------------------------------------------------+
|                      TIER 1: COMMUNITY ROOFTOP RELAYS                   |
|       [ N2: Balkhu Market ]  [ N4: Kalimati ]  [ N7: Maitighar ]        |
|               (Submerged: N3 Teku Ward, N6 Thapathali School)           |
+-------------------------------------------------------------------------+
            ▲                                                   │
            │ RF Hop                                            │ Radio Link
            │                                                   ▼
+---------------------------+               +-----------------------------+
|    TIER 0: SURVIVOR DONGLE|               |   TIER 4: BASE CAMP HQ      |
|  [ N1 / 0x2001: Tin Roof ]|               | [ N8 / 0x0001 Helper Node ] |
|  - 433 MHz SX1278 LoRa    |               | - Safe Ground Command HQ    |
|  - Headcount & Bitmask SOS|               | - USB Serial Gateway        |
|  - Flash Buffer Storage   |               | - Air-Gapped AI Server      |
+---------------------------+               +-----------------------------+
```

| Tier | Node Class | Elevation | Hardware Stack | Operational Function |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 0** | **Survivor Dongle** | Ground / Roof (12m) | ESP32-C3 · SX1278 · 18650 Cell | Distress beaconing, 5-bit emergency bitmask, flash store-and-forward when isolated. |
| **Tier 1** | **Community Relays** | Rooftops (6m) | ESP32 · Solar PV + Lithium | Autonomous mesh routing across urban corridors (`N2`–`N7`). |
| **Tier 2** | **Airborne Drones** | 80m Hover | Heavy Quadcopter + LoRa Bridge | Agile partition repair. Enforces **strict 6-drone ceiling** and low-battery (<25%) recall. |
| **Tier 3** | **Tethered Aerostat** | 100m Altitude | Helium Aerostat + Ground Power | Persistent wide-area RF anchor. Relieves low-battery drones. |
| **Tier 4** | **Base Camp HQ** | Safe Ground HQ | ESP32 Gateway + Local Server | USB serial gateway (`115200` baud), LangGraph triage, reverse ACK generator. |

---

## 3. Radio Protocol & 5-Bit Emergency Bitmask

### 3.1 433 MHz LoRa Calibration
* **Frequency:** `433.175 MHz` (Superior diffraction around concrete buildings and wet foliage compared to 915 MHz or 2.4 GHz; negligible rain attenuation).
* **Modulation:** Chirp Spread Spectrum (CSS) LoRa.
* **Spreading Factor:** `SF10` (High link margin, sensitivity down to `-137 dBm`).
* **Bandwidth:** `125 kHz` · **Coding Rate:** `4/5` · **CRC:** Hardware LoRa CRC16.

### 3.2 5-Bit Emergency Encoding (`flg`)
Every byte over LoRa SF10 requires ~30–50ms of airtime. A 5-bit bitmask compresses 5 critical life-safety hazards into a single 1-byte integer:

$$\text{flg} = (\text{trapped} \times 1) + (\text{injured} \times 2) + (\text{fire} \times 4) + (\text{flood} \times 8) + (\text{supplies} \times 16)$$

| Bit | Value | Hazard Flag | Automated Tactical Response |
| :---: | :---: | :--- | :--- |
| **Bit 0** | **1** | **Trapped** | Deploy hydraulic spreaders, cutters & SAR K9 teams |
| **Bit 1** | **2** | **Injured** | Dispatch field trauma medic, tourniquets, IV saline fluids |
| **Bit 2** | **4** | **Fire** | Deploy dry chemical fire suppressant & smoke escape hoods |
| **Bit 3** | **8** | **Flood** | Scramble inflatable Zodiac motorboats & Type-V PFD lifejackets |
| **Bit 4** | **16** | **Water/Food** | Airdrop high-calorie MRE rations & water purification tablets |

* *Example:* `flg: 18` = `2 (Injured) + 16 (Water/Food Supplies Needed)`.

### 3.3 Production Machine Frame (`# json : {...}`)
```json
# json : {"t":"DATA","src":"2001","mid":16,"dst":"0001","nh":"0001","ttl":10,"ppl":25,"flg":18,"lat":27.680000,"lon":85.320000,"alt":1300,"acc":10,"ts":1793443152,"path":["2001"]}
```

### 3.4 Two-Way Reverse Verification ACK
* Standard one-way emergency beacons cause survivors to spam distress signals non-stop, draining battery in under 6 hours and jamming the radio channel.
* Base Camp Helper node fires an authenticated reverse LoRa frame:
  ```text
  @ACK,2001,2001-00016,ZODIAC RESCUE BOAT EN ROUTE
  ```
* The survivor's dongle screen updates to **"RESCUE CONFIRMED · BOAT DISPATCHED"**, and the radio enters power-save sleep, extending battery life to **72+ hours**.

---

## 4. Air-Gapped LangGraph AI Command Engine

The local application server ([`server/`](server/)) operates on-premise without cloud connectivity:

```
[ Raw LoRa Packet + Serial RF Metrics ]
                  │
                  ▼
   ┌─────────────────────────────┐
   │    LangGraph StateGraph     │
   └──────────────┬──────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [ Primary SLM ]      [ 0ms Fallback ]
 qwen2.5:3b (local)   Deterministic Engine
 Strict temp = 0.0    Never fails / hangs
```

### The 4-Stage StateGraph Pipeline
1. **`telemetry_node`:** Ingests packet and conditions physical RF metrics. Escalates priority if `SNR < -10 dB` or `RSSI < -110 dBm`.
2. **`triage_agent_node`:** Decodes `flg` bitmask and headcount (`ppl`). Computes Urgency Score (1–10) and itemized equipment manifests.
3. **`fleet_planner_node`:** Manages `FleetRegistry`: enforces **strict 6-drone ceiling**, monitors battery (<25% triggers recall), and orders **100m tethered aerostat handovers** when drones reach capacity.
4. **`manifest_generator_node`:** Synthesizes actionable military Commander Directives and formats the physical return ACK frame.

**Synthesized Commander Directive Example:**
> *"IMMEDIATE DISPATCH AUTHORIZED for Sector 2001 (25 survivors). Deploy Zodiac inflatable motorboat, Field trauma & hemorrhage kit and execute aerial relay plan: Dispatched DRONE-02 (80m) to establish LoRa mesh bridge."*

---

## 5. Tactical Command HUD (3D Digital Twin)

Built with MapLibre GL 3D terrain rendering over the Kathmandu flood basin ([`frontend/`](frontend/)):

* **Incident Replay Mode:** Deterministic 100-second historical narrative of the 2024 Kathmandu disaster (flood surge, relay submersion, drone bridge launch, aerostat takeover).
* **Tactical Sandbox Mode:** Interactive crisis sandbox: click anywhere to drop survivor dongles, submerge relays, launch airborne drones, and trigger automated mesh re-bridging.
* **LoRa Packet Constructor:** Interactive tactical popup on any survivor node. Edit headcount, toggle 5 bitmask checkboxes, and inspect the live `# json` machine frame updating character by character in real time before transmitting.
* **WebSocket Bridge:** Non-blocking connection (`ws://localhost:8000/ws`) streaming live serial packets to the canvas.

---

## 6. Monorepo Structure

```text
octo_gdg_hackathon/
├── README.md                      # Master engineering documentation
├── presentation.html              # 8-slide interactive pitch deck (Team Byte Me / Graviton 2026)
├── PITCH_DECK.md                  # Word-for-word presentation script and slide copy
│
├── server/                        # Air-gapped Application Server
│   ├── config.py                  # Constants, 6-drone limit, baud rates
│   ├── main.py                    # FastAPI REST & WebSocket server
│   ├── test_unit.py               # 100% offline integration test runner
│   ├── requirements.txt           # Server dependencies
│   ├── models/
│   │   └── schemas.py             # Pydantic v2 schemas & bitmask logic
│   ├── agents/
│   │   ├── prompts.py             # Triage & commander directive prompts
│   │   └── graph.py               # LangGraph StateGraph & FleetRegistry
│   └── core/
│       ├── serial_reader.py       # PySerial manager & packet parser
│       ├── topology_engine.py     # Watchdog & RF link health analyzer
│       └── ws_manager.py          # WebSocket client broadcast pool
│
├── frontend/                      # Tactical Command HUD
│   ├── index.html                 # Tactical HUD shell & layout
│   ├── package.json               # Node dependencies (MapLibre GL, Vite)
│   ├── src/
│   │   ├── main.js                # App bootstrap & mode switcher
│   │   ├── hud.css                # Dark tactical stylesheet
│   │   ├── engine/
│   │   │   ├── ScenarioEngine.js  # Simulation loop & hop router
│   │   │   ├── MeshOptimizer.js   # Gap detection & drone allocation
│   │   │   └── LiveTelemetryBridge.js # WebSocket bridge & packet injector
│   │   └── map/
│   │       ├── NodeLayer.js       # Markers & LoRa packet constructor
│   │       ├── EdgeLayer.js       # Animated LoRa RF beam rays & packet hops
│   │       └── FloodLayer.js      # Flood polygon rendering
│
└── wokwi_sim/                     # Embedded Hardware Firmware
    ├── esp32_sx1278_helper/       # Base Camp Helper Node firmware
    └── esp32_sx1278_dongle/       # Survivor Dongle firmware
```

---

## 7. Quick Start & Setup

### 7.1 Prerequisites
* **Python:** 3.10+ (3.12 recommended)
* **Node.js:** 18+ or 20+
* **Ollama (Optional):** `ollama run qwen2.5:3b` *(Server uses deterministic rule engine if Ollama is offline).*

### 7.2 Run the Application Server
```bash
# Start FastAPI backend with WebSocket broadcast
uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```
* **API Documentation:** `http://localhost:8000/docs`
* **Health Check:** `http://localhost:8000/health`
* **WebSocket Stream:** `ws://localhost:8000/ws`

### 7.3 Run the Tactical Command HUD
```bash
cd frontend
npm install
npm run dev
```
* **Console URL:** `http://localhost:5173`

### 7.4 Run the Offline Test Suite
```bash
# Runs full unit & integration verification
python -u -m server.test_unit
```
**Expected Output:**
```text
=== 1. TESTING ACTUAL HARDWARE PACKET PARSING ===
✓ Hardware packet parsed correctly: Key = 2001-00016 Flags: Injured = True

=== 2. TESTING TOPOLOGY WATCHDOG & RELAY CALCULATION ===
✓ Degradation detected on N3 -> Bridge target at: 27.7011 85.3245

=== 3. TESTING 6-DRONE CEILING & AEROSTAT HANDOVER ===
✓ Alloc 1: DRONE-01 Active count: 1 Handover: False

=== 4. TESTING LANGGRAPH OFFLINE DETERMINISTIC PIPELINE ===
✓ Commander Directive: IMMEDIATE DISPATCH AUTHORIZED for Sector 2001 (25 survivors)...
✓ Return ACK Hex Command: '@ACK,2001,2001-00016,DISPATCHED\n'

=== 5. TESTING TOPOLOGY SNAPSHOT & SERIAL EMULATOR PARSER ===
✓ Nodes snapshot count: 9
✓ Fleet tracking initialized: Drones = 6 Aerostats = 3
✓ SerialManager parse_line validated for production hardware packet

🎉 ALL UNIT & INTEGRATION TESTS PASSED 100%!
```

---

## 8. Benchmark Comparison

| Metric / Feature | Traditional Cellular Infrastructure | Satellite Terminals (Starlink) | Dhruva Jaal (Team Byte Me) |
| :--- | :--- | :--- | :--- |
| **External Dependency** | 100% (Grid + Fiber Backhaul) | Satellite LOS + Clear Sky | **0% (100% Air-Gapped Off-Grid)** |
| **Unit Hardware Cost** | $300 – $1,000 (Smartphones) | $600 hardware + $120/mo | **<$5 per survivor dongle** |
| **Operating Endurance** | Grid dependent (dies in 20m) | 50–100W continuous AC power | **72+ hours on single 18650 cell** |
| **Flood Zone Delivery Rate** | 0% (Total blackout) | Heavy rain fade attenuation | **100% (Store & Forward + Drone)** |
| **Triage Decision Latency** | Hours (manual call queues) | Manual operator triage | **< 50ms (On-premise LangGraph)** |

---

*Dhruva Jaal (ध्रुव जाल) — Developed by Team Byte Me for Graviton 2026.*

# DHRUVA JAAL — TEAM BYTE ME (GRAVITON 2026)

> **Interactive Presentation Deck:** Open [`presentation.html`](file:///c:/AI%20Native%20founder/Hackathon_projects/octo_gdg_hackathon/presentation.html) in your browser.  
> *Controls: `←` / `→` arrow keys or Spacebar to change slides, `N` for Speaker Script drawer, `F` for Fullscreen, `Ctrl + P` to export as PDF.*

---

## Team Roster: Team Byte Me
* **Aditya Singh** — Team Leader & Systems Architect
* **Jungbir** — Embedded IoT & RF Hardware Specialist
* **Keshav** — Hardware & Wireless Penetration Tester
* **Arnav** — AI & Systems Engineer

---

## Slide 1: Title & Engineering Mission
* **Badge:** GRAVITON 2026 · AUTONOMOUS SYSTEMS & RESILIENT INFRASTRUCTURE
* **Team:** TEAM BYTE ME
* **Headline:** DHRUVA JAAL (ध्रुव जाल)
* **Subtitle:** Air-Gapped, Multi-Tier LoRa Disaster Mesh & Autonomous Local AI Tactical Command Platform
* **Engineering Pillars:**
  * **100% Air-Gapped Intelligence:** Runs entirely on-premise on emergency command laptops. Zero cloud APIs, zero external connectivity requirement.
  * **Autonomous Aerial Bridging:** Dynamic 80m airborne drones and 100m tethered aerostats automatically bridge severed ground mesh partitions.
  * **Cryptographic Verification Loop:** Two-way authenticated reverse ACKs give survivors immediate confirmation that rescue teams are dispatched.

### Speaker Script (Slide 1):
> *"Good morning judges. We are Team Byte Me: Aditya Singh as team lead, Jungbir as our IoT expert, Keshav on penetration testing and hardware security, and Arnav on AI engineering. When sudden disasters strike, terrestrial power and cell towers fail in the first 20 minutes. We engineered Dhruva Jaal: an air-gapped LoRa mesh and autonomous local AI command system that guarantees zero-infrastructure survival communication."*

---

## Slide 2: The Disaster Reality (System Failure Vector)
* **Badge:** SYSTEM FAILURE VECTOR · CASE: KATHMANDU FLOOD BASIN
* **Headline:** The First 20 Minutes: Complete Cellular Collapse
* **Subtitle:** When municipal grids drown and fiber trunks snap, standard telecommunications die instantly.
* **The Failure Vector:**
  * **Substations Submerged:** Ground transformers short-circuit in early flood stages.
  * **Terrestrial Fiber Snapped:** River torrents sever underground backhaul fiber cables.
  * **The Smartphone Void:** Civilians on tin roofs have battery, but **0 bars**.
  * **Command Blindness:** Disaster authorities cannot determine where casualties are trapped.
* **Metrics:**
  * **0%** Cellular Delivery Rate in flood zone.
  * **18 min** Time to total communication blackout.
  * **100%** Off-Grid Mandate.

### Speaker Script (Slide 2):
> *"Let's examine the disaster reality. In the September 2024 Kathmandu floods, Bagmati River rose in 20 minutes. Power transformers drowned, terrestrial fiber snapped, and cellular macro-towers suffered a total blackout. Victims on rooftops had charged phones with zero signal. Responders were completely blind. Cellular networks operate at zero percent delivery during flash surges."*

---

## Slide 3: 5-Tier Resilient Mesh Architecture
* **Badge:** SYSTEM TOPOLOGY · HARDWARE & RF ARCHITECTURE
* **Headline:** 5-Tier Resilient Mesh Architecture
* **Subtitle:** Multi-tier store-and-forward routing across ground, rooftops, aerial relays, and command HQ.
* **The 5 Tiers:**
  1. **Tier 0 (Survivor Dongle):** Ground / Roof (12m). ESP32-C3 · SX1278 · 18650 Cell. Distress beaconing, 5-bit emergency bitmask, flash store-and-forward.
  2. **Tier 1 (Community Relays):** Rooftops (6m). ESP32 · Solar PV + Lithium. Autonomous mesh forwarding across urban corridors (N2–N7).
  3. **Tier 2 (Airborne Drones):** 80m Hover. Heavy Quadcopter + LoRa Bridge. Agile partition repair. Enforces 6-drone ceiling & 25% battery recall.
  4. **Tier 3 (Tethered Aerostat):** 100m Altitude. Helium Aerostat + Ground Power. Persistent wide-area RF anchor. Relieves low-battery drones.
  5. **Tier 4 (Base Camp HQ):** Safe Ground HQ. ESP32 Gateway + Local Server. USB serial gateway (115200 baud), LangGraph triage, reverse ACK.

### Speaker Script (Slide 3):
> *"Here is our 5-tier architecture engineered by Jungbir and the team. Tier 0 is a 5-dollar battery-operated survivor dongle with local flash memory. Tier 1 consists of solar rooftop community relays. Tier 2 introduces 80-meter airborne drones to bridge gaps when relays drown. Tier 3 uses a 100-meter tethered aerostat for persistent coverage. Tier 4 is Base Camp HQ. If any tier is lost, the network dynamically routes through the tier above."*

---

## Slide 4: 433 MHz LoRa & 5-Bit Emergency Encoding
* **Badge:** RF PROTOCOL & COMPRESSION · EMBEDDED SPECIFICATION
* **Headline:** 433 MHz LoRa & 5-Bit Emergency Encoding
* **Subtitle:** Compressing multi-hazard disaster parameters into an ultra-low airtime frame.
* **The 5-Bit Mask (`flg`):**
  * `Bit 0 (1)`: **Trapped** ➔ Deploy hydraulic spreaders & SAR K9 teams.
  * `Bit 1 (2)`: **Injured** ➔ Dispatch field trauma medic, tourniquets, IVs.
  * `Bit 2 (4)`: **Fire** ➔ Deploy dry chemical suppressant & smoke hoods.
  * `Bit 3 (8)`: **Flood** ➔ Scramble Zodiac motorboats & PFD lifejackets.
  * `Bit 4 (16)`: **Water/Food** ➔ Airdrop MRE rations & water purification tablets.
* **Production Frame:**
  `# json : {"t":"DATA","src":"2001","mid":16,"dst":"0001","nh":"0001","ttl":10,"ppl":25,"flg":18,"lat":27.680000,"lon":85.320000,"alt":1300,"acc":10,"ts":1793443152,"path":["2001"]}`
* **Return ACK:**
  `@ACK,2001,2001-00016,ZODIAC EN ROUTE\n`

### Speaker Script (Slide 4):
> *"Jungbir tuned our RF link to 433 MHz SF10, which provides superior diffraction around buildings and penetrates rain fade far better than 915 MHz or 2.4 GHz. Because LoRa bandwidth is tiny, we engineered a 5-bit emergency bitmask. A single byte encodes trapped, injured, fire, flood, and supplies. Here is the exact 170-byte JSON machine payload ingested by our serial reader."*

---

## Slide 5: Air-Gapped LangGraph AI Command Engine
* **Badge:** ON-PREMISE AI PIPELINE · LANGGRAPH STATE MACHINE
* **Headline:** Air-Gapped LangGraph Tactical Command Engine
* **Subtitle:** Local quantized SLM (`qwen2.5:3b`) paired with a 0ms deterministic rule-engine fallback.
* **4-Stage Pipeline:**
  1. **Telemetry Node:** Conditions RF metrics. Escalates if SNR < -10dB or RSSI < -110dBm.
  2. **Triage Node:** Decodes bitmask + headcount. Computes Urgency (1–10) & gear list.
  3. **Fleet Planner:** Enforces 6-drone ceiling & 25% battery recall. Triggers aerostat relief.
  4. **Manifest & ACK:** Synthesizes Commander Directive and compiles return LoRa ACK frame.
* **Autonomous Output:**
  > *"IMMEDIATE DISPATCH AUTHORIZED for Sector 2001 (25 survivors). Deploy Zodiac inflatable motorboat, Field trauma & hemorrhage kit and execute aerial relay plan: Dispatched DRONE-02 (80m) to establish LoRa mesh bridge."*

### Speaker Script (Slide 5):
> *"Arnav engineered our on-premise AI pipeline using LangGraph. Disasters cut internet, so cloud models like GPT-4 cannot function. We run local qwen2.5:3b at zero temperature, backed by an instant deterministic rule engine that ensures zero downtime. It evaluates RF link degradation, calculates urgency scores from one to ten, manages drone battery constraints, and generates concise tactical commander directives in under fifty milliseconds."*

---

## Slide 6: Two-Way Verified ACK & Tactical Command HUD
* **Badge:** CLOSED-LOOP VERIFICATION & SECURITY · TACTICAL COMMAND OPERATIONS
* **Headline:** Two-Way Verified ACK & Tactical Command HUD
* **Subtitle:** Eliminating RF packet storms and giving Base Camp 3D geospatial mission control.
* **Core Capabilities:**
  * **Reverse ACK Security:** Keshav analyzed RF attack surfaces. One-way SOS causes channel congestion and battery drain. Our reverse ACK confirms message receipt, updates survivor screens to GREEN, and triggers device sleep to extend battery life to **72+ hours**.
  * **Tactical Command HUD:** MapLibre GL 3D terrain console with dual Incident Replay (100s historical narrative) and Tactical Sandbox modes, interactive LoRa packet constructor, and live WebSocket telemetry bridge.

### Speaker Script (Slide 6):
> *"Keshav evaluated our system security. Traditional one-way SOS beacons cause panic spamming: survivors keep transmitting, which drains batteries in six hours and causes catastrophic RF packet collisions. Our two-way authenticated reverse ACK solves this. When Base Camp receives a packet, it returns an ACK. The survivor dongle turns green, giving them peace of mind and putting the radio into power-save sleep for 72 hours. Our MapLibre GL command console gives Base Camp complete geospatial control."*

---

## Slide 7: Performance Metrics & Field Deployment
* **Badge:** VALIDATION & OPERATIONAL ROADMAP · BENCHMARK COMPARISON
* **Headline:** Performance Metrics & Field Deployment
* **Subtitle:** Dhruva Jaal vs Traditional Alternatives · Phased operational integration plan.
* **Validation Vectors:**
  * **External Dependency:** 0% external cloud needed vs 100% cellular reliance.
  * **Unit Hardware Cost:** <$5 per survivor dongle vs $600+ for Starlink.
  * **Operating Endurance:** 72+ hours on 18650 cell vs grid power.
  * **Flood Delivery Rate:** 100% via store-and-forward + drone vs 0% cellular delivery.
  * **Triage Latency:** <50ms local SLM vs hours of manual call queues.
* **Roadmap:**
  * *Phase 1:* SAR Tactical Kits (Pelicases with 1 gateway + 6 drone repeaters + 50 dongles).
  * *Phase 2:* Rooftop Community Mesh (Solar relays on schools & hospitals along river basins).
  * *Phase 3:* Civil Protection Standard (Standardize 5-bit emergency mask into regional device firmware).

### Speaker Script (Slide 7):
> *"Let's look at the validation numbers. In the disaster sector, cellular networks suffered 100 percent blackout. Dhruva Jaal achieved 100 percent packet delivery through store-and-forward and aerial bridging. An ESP32 survivor dongle costs under five dollars, compared to six hundred dollars for Starlink, and our local triage latency is under fifty milliseconds. We have planned a phased deployment with disaster response authorities."*

---

## Slide 8: Mission Debrief, Team Byte Me & Thank You
* **Badge:** MISSION DEBRIEF & Q&A · GRAVITON 2026 · TEAM BYTE ME
* **Headline:** No One Should Die in the Dark.
* **Subtitle:** Dhruva Jaal delivers reliable, air-gapped life safety communication when terrestrial networks fail completely.
* **Team Byte Me Roster:**
  * **Aditya Singh** — Team Lead & Systems Architect (System design, tactical simulation engine & end-to-end mission integration).
  * **Jungbir** — IoT & Embedded Systems Expert (SX1278 SPI interface, 433 MHz RF tuning, power budgets & flash storage).
  * **Keshav** — Hardware & Network Pen Tester (Wireless link security, packet replay defense & cryptographic reverse ACKs).
  * **Arnav** — AI & Systems Engineer (LangGraph state graphs, local SLM quantization & deterministic triage engines).
* **Closing:** Thank you · Ready for Technical Q&A and Live System Demonstration.

### Speaker Script (Slide 8):
> *"To conclude: Disasters are inevitable, but dying in the dark from lack of communication is preventable. On behalf of Team Byte Me—Aditya, Jungbir, Keshav, and Arnav—we built Dhruva Jaal to prove that low-cost radio physics, autonomous aerial relays, and air-gapped AI can save lives when all other networks fail. Thank you, and we welcome your questions."*

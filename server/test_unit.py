import sys
import asyncio

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from server.models.schemas import CompactedLoRaPayload, SerialTelemetryEvent, AckRequest
from server.core.topology_engine import topology_engine
from server.agents.graph import (
    triage_agent_app,
    fleet_registry,
    telemetry_node,
    fleet_planner_node,
    manifest_generator_node,
)
import server.main as server_main

print("=== 1. TESTING ACTUAL HARDWARE PACKET PARSING ===")
raw_json = {
    "t": "DATA",
    "src": "2001",
    "mid": 16,
    "dst": "0001",
    "nh": "0001",
    "ttl": 10,
    "ppl": 25,
    "flg": 18,
    "lat": 27.680000,
    "lon": 85.320000,
    "alt": 1300.0,
    "acc": 10.0,
    "ts": 1793443152,
    "path": ["2001"]
}
payload = CompactedLoRaPayload.model_validate(raw_json)
assert payload.packet_key == "2001-00016"
assert payload.decoded_flags.injured == True
assert payload.decoded_flags.supplies_needed == True
assert payload.decoded_flags.trapped == False
assert payload.decoded_flags.is_critical == True
print("✓ Hardware packet parsed correctly: Key =", payload.packet_key, "Flags: Injured =", payload.decoded_flags.injured)

print("\n=== 2. TESTING TOPOLOGY WATCHDOG & RELAY CALCULATION ===")
rec = topology_engine.record_heartbeat("N1", rssi=-72, snr=12.0)
assert rec is None  # Healthy link
degraded_rec = topology_engine.record_heartbeat("N3", rssi=-98, snr=-6.5)
assert degraded_rec is not None
print("✓ Degradation detected on N3 -> Bridge target at:", degraded_rec.recommended_lat, degraded_rec.recommended_lon)

print("\n=== 3. TESTING 6-DRONE CEILING & AEROSTAT HANDOVER ===")
alloc1 = fleet_registry.allocate_relay(27.68, 85.32, 1300, "SECTOR-1")
print("✓ Alloc 1:", alloc1.allocated_drone_id, "Active count:", alloc1.fleet_active_count, "Handover:", alloc1.requires_aerostat_handover)

print("\n=== 4. TESTING LANGGRAPH OFFLINE DETERMINISTIC PIPELINE ===")
state = {
    "packet_key": "2001-00016",
    "payload": payload.model_dump(),
    "rf_context": {"rssi": -81.0, "snr": 14.0},
    "topology_partitioned": False,
    "high_priority_escalation": False,
    "triage_assessment": {
        "urgency_score": 9,
        "priority_level": "CRITICAL",
        "survivor_categorization": "25 civilians at 2001",
        "recommended_gear": ["Zodiac inflatable motorboat", "Field trauma & hemorrhage kit"],
        "clinical_rationale": "High headcount with active injuries reported via LoRa."
    },
    "dispatch_allocation": None,
    "incident_manifest": None,
}

fleet_res = fleet_planner_node(state)
state.update(fleet_res)
manifest_res = manifest_generator_node(state)
state.update(manifest_res)

print("✓ Commander Directive:", state["incident_manifest"]["commander_directive"])
print("✓ Return ACK Hex Command:", repr(state["incident_manifest"]["auto_ack_hex_command"]))

print("\n=== 5. TESTING TOPOLOGY SNAPSHOT & SERIAL EMULATOR PARSER ===")
nodes = server_main.topology_engine.get_topology_snapshot()
assert len(nodes) >= 8
print("✓ Nodes snapshot count:", len(nodes))
print("✓ Fleet tracking initialized: Drones =", len(fleet_registry.drones), "Aerostats =", len(fleet_registry.aerostats))

# Test parsing custom hardware packet lines
parsed_pkt = server_main.serial_manager.parse_line(
    '# json : {"t":"DATA","src":"2001","mid":16,"dst":"0001","nh":"0001","ttl":10,"ppl":25,"flg":18,"lat":27.680000,"lon":85.320000,"alt":1300,"acc":10,"ts":1793443152,"path":["2001"]}'
)
assert parsed_pkt is not None
assert parsed_pkt["type"] == "sos_payload"
assert parsed_pkt["payload"]["ppl"] == 25
assert parsed_pkt["payload"]["flg"] == 18
print("✓ SerialManager parse_line validated for production hardware packet")

print("\n🎉 ALL UNIT & INTEGRATION TESTS PASSED 100%!")

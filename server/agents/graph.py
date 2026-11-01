import time
import uuid
from typing import Any, Dict, List
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

from server.config import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    MAX_DRONE_FLEET,
    BATTERY_HANDOVER_THRESHOLD,
)
from server.models.schemas import (
    TriageGraphState,
    TriageAssessment,
    DispatchAllocation,
    IncidentManifest,
    AerialAssetStatus,
    EmergencyFlags,
)
from server.agents.prompts import TRIAGE_SYSTEM_PROMPT, MANIFEST_SYSTEM_PROMPT


class FleetRegistry:
    """In-memory state manager enforcing the strict 6-drone ceiling & aerostat handovers."""
    def __init__(self) -> None:
        self.drones: List[AerialAssetStatus] = [
            AerialAssetStatus(
                asset_id=f"DRONE-0{i}",
                asset_type="DRONE_RELAY",
                status="IDLE",
                battery_pct=90 - (i * 12),  # Simulated staggered battery states
            )
            for i in range(1, MAX_DRONE_FLEET + 1)
        ]
        self.aerostats: List[AerialAssetStatus] = [
            AerialAssetStatus(
                asset_id=f"AEROSTAT-0{i}",
                asset_type="TETHERED_AEROSTAT",
                status="IDLE",
                battery_pct=100,
            )
            for i in range(1, 4)
        ]

    def allocate_relay(self, lat: float, lon: float, alt: float, sector_key: str) -> DispatchAllocation:
        active_count = sum(1 for d in self.drones if d.status != "IDLE")
        idle_drones = [d for d in self.drones if d.status == "IDLE"]

        # Check existing low-battery deployed drones or assign best available idle drone
        selected_drone = None
        if idle_drones and active_count < MAX_DRONE_FLEET:
            # Sort by highest battery first
            idle_drones.sort(key=lambda d: d.battery_pct, reverse=True)
            selected_drone = idle_drones[0]
            selected_drone.status = "DEPLOYED"
            selected_drone.assigned_sector = sector_key
            selected_drone.lat = lat
            selected_drone.lon = lon
            active_count += 1
            # Simulate battery drain on deployment
            selected_drone.battery_pct = max(15, selected_drone.battery_pct - 20)

        requires_handover = False
        handover_aerostat_id = None
        notes = ""

        if selected_drone is None:
            # Fleet ceiling (6 drones) reached; check for immediate Tethered Aerostat takeover
            requires_handover = True
            idle_aerostats = [a for a in self.aerostats if a.status == "IDLE"]
            if idle_aerostats:
                handover_aerostat_id = idle_aerostats[0].asset_id
                idle_aerostats[0].status = "DEPLOYED"
                idle_aerostats[0].assigned_sector = sector_key
            notes = f"6-Drone fleet ceiling reached ({active_count}/{MAX_DRONE_FLEET}). Assigned Tethered Aerostat {handover_aerostat_id}."
        elif selected_drone.battery_pct <= BATTERY_HANDOVER_THRESHOLD:
            requires_handover = True
            selected_drone.status = "HANDOVER_PENDING"
            idle_aerostats = [a for a in self.aerostats if a.status == "IDLE"]
            if idle_aerostats:
                handover_aerostat_id = idle_aerostats[0].asset_id
                idle_aerostats[0].status = "DEPLOYED"
                idle_aerostats[0].assigned_sector = sector_key
            notes = (
                f"{selected_drone.asset_id} battery critical ({selected_drone.battery_pct}%). "
                f"Initiating handover to Tethered Aerostat {handover_aerostat_id}."
            )
        else:
            notes = f"Dispatched {selected_drone.asset_id} ({selected_drone.battery_pct}% battery) to establish LoRa mesh bridge."

        return DispatchAllocation(
            allocated_drone_id=selected_drone.asset_id if selected_drone else None,
            requires_aerostat_handover=requires_handover,
            handover_aerostat_id=handover_aerostat_id,
            deployment_lat=lat,
            deployment_lon=lon,
            deployment_alt=alt + 120.0,  # 120m AGL optimal LoRa Fresnel zone clearance
            fleet_active_count=active_count,
            fleet_ceiling=MAX_DRONE_FLEET,
            allocation_notes=notes,
        )


fleet_registry = FleetRegistry()


def get_llm() -> ChatOllama:
    return ChatOllama(
        base_url=OLLAMA_BASE_URL,
        model=OLLAMA_MODEL,
        temperature=0.0,
        timeout=8.0,
    )


# ==========================================
# LANGGRAPH NODE FUNCTIONS
# ==========================================

def telemetry_node(state: TriageGraphState) -> Dict[str, Any]:
    """Validates RF health, decodes bitmask flags, and determines escalation routing."""
    payload = state["payload"]
    rf_context = state.get("rf_context", {})
    flags = EmergencyFlags(raw_bitmask=payload.get("flg", 0))

    rssi = rf_context.get("rssi", -80.0)
    snr = rf_context.get("snr", 10.0)
    rf_degraded = (rssi < -95.0) or (snr < -5.0)

    high_priority = (
        flags.is_critical
        or payload.get("ppl", 0) >= 10
        or state.get("topology_partitioned", False)
        or rf_degraded
    )

    return {
        "high_priority_escalation": high_priority,
        "rf_context": {
            **rf_context,
            "rf_degraded": rf_degraded,
            "decoded_flags": flags.model_dump(),
        },
    }


def route_after_telemetry(state: TriageGraphState) -> str:
    """Conditional routing edge based on priority flags or sector partition."""
    if state.get("high_priority_escalation"):
        return "immediate_escalation"
    return "standard_triage"


def triage_node(state: TriageGraphState) -> Dict[str, Any]:
    """Invokes local Ollama with strict Pydantic structured output for medical/gear triage."""
    payload = state["payload"]
    flags = EmergencyFlags(raw_bitmask=payload.get("flg", 0))

    user_prompt = (
        f"Packet Key: {state['packet_key']}\n"
        f"Source Node: {payload.get('src')}\n"
        f"People Headcount: {payload.get('ppl')}\n"
        f"Flags -> Trapped: {flags.trapped}, Injured: {flags.injured}, "
        f"Fire: {flags.fire}, Flood: {flags.flood}, Water/Food Needed: {flags.supplies_needed}\n"
        f"Coordinates: Lat {payload.get('lat')}, Lon {payload.get('lon')}, Alt {payload.get('alt')}m\n"
        f"Sector Partitioned: {state.get('topology_partitioned')}"
    )

    try:
        llm = get_llm()
        structured_llm = llm.with_structured_output(TriageAssessment)
        result: TriageAssessment = structured_llm.invoke([
            SystemMessage(content=TRIAGE_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ])
    except Exception:
        # Air-gapped deterministic fallback if local Ollama is cold-starting or unreachable
        gear = []
        if flags.flood:
            gear.extend(["Zodiac inflatable motorboat", "Life vests & throw bags"])
        if flags.injured:
            gear.extend(["Field trauma & hemorrhage kit", "Waterproof stretcher"])
        if flags.supplies_needed:
            gear.extend(["Potable water packs", "High-calorie emergency rations"])
        if flags.fire:
            gear.extend(["Class ABC extinguishers", "Burn trauma dressings"])
        if not gear:
            gear.append("Standard reconnaissance & first-aid pack")

        urgency = 9 if flags.is_critical else 5
        result = TriageAssessment(
            urgency_score=urgency,
            priority_level="CRITICAL" if urgency >= 8 else "MEDIUM",
            survivor_categorization=f"{payload.get('ppl', 1)} civilians at {payload.get('src')}",
            recommended_gear=gear,
            clinical_rationale="Deterministic rule-based triage executed (local LLM fallback).",
        )

    return {"triage_assessment": result.model_dump()}


def fleet_planner_node(state: TriageGraphState) -> Dict[str, Any]:
    """Enforces the 6-drone ceiling and manages drone battery -> tethered aerostat handovers."""
    payload = state["payload"]
    allocation = fleet_registry.allocate_relay(
        lat=float(payload.get("lat", 27.6800)),
        lon=float(payload.get("lon", 85.3200)),
        alt=float(payload.get("alt", 1300.0)),
        sector_key=state["packet_key"],
    )
    return {"dispatch_allocation": allocation.model_dump()}


def manifest_generator_node(state: TriageGraphState) -> Dict[str, Any]:
    """Synthesizes the official Incident Commander rescue dispatch order."""
    payload = state["payload"]
    triage = state["triage_assessment"]
    dispatch = state["dispatch_allocation"]
    src_node = payload.get("src", "2001").replace("0x", "")

    summary_input = (
        f"Incident {state['packet_key']}: {triage['survivor_categorization']}. "
        f"Priority: {triage['priority_level']} (Score {triage['urgency_score']}/10). "
        f"Gear: {', '.join(triage['recommended_gear'])}. "
        f"Aerial Relay: {dispatch['allocation_notes']}"
    )

    try:
        llm = get_llm()
        resp = llm.invoke([
            SystemMessage(content=MANIFEST_SYSTEM_PROMPT),
            HumanMessage(content=summary_input),
        ])
        directive = str(resp.content).strip()
    except Exception:
        directive = (
            f"IMMEDIATE DISPATCH AUTHORIZED for Sector {src_node} ({payload.get('ppl')} survivors). "
            f"Deploy {', '.join(triage['recommended_gear'])} and execute aerial relay plan: {dispatch['allocation_notes']}"
        )

    manifest = IncidentManifest(
        manifest_id=f"CMD-{uuid.uuid4().hex[:6].upper()}",
        incident_key=state["packet_key"],
        commander_directive=directive,
        urgency_level=triage["priority_level"],
        target_coordinates={
            "lat": float(payload.get("lat", 27.6800)),
            "lon": float(payload.get("lon", 85.3200)),
            "alt": float(payload.get("alt", 1300.0)),
        },
        allocated_physical_gear=triage["recommended_gear"],
        aerial_relay_assignment=dispatch["allocation_notes"],
        auto_ack_hex_command=f'@ACK,{src_node},{state["packet_key"]},DISPATCHED\n',
    )

    return {"incident_manifest": manifest.model_dump()}


def build_triage_graph():
    workflow = StateGraph(TriageGraphState)

    workflow.add_node("telemetry_node", telemetry_node)
    workflow.add_node("triage_node", triage_node)
    workflow.add_node("fleet_planner_node", fleet_planner_node)
    workflow.add_node("manifest_generator_node", manifest_generator_node)

    workflow.set_entry_point("telemetry_node")

    workflow.add_conditional_edges(
        "telemetry_node",
        route_after_telemetry,
        {
            "immediate_escalation": "triage_node",
            "standard_triage": "triage_node",
        },
    )

    workflow.add_edge("triage_node", "fleet_planner_node")
    workflow.add_edge("fleet_planner_node", "manifest_generator_node")
    workflow.add_edge("manifest_generator_node", END)

    return workflow.compile()


triage_agent_app = build_triage_graph()


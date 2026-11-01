from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, TypedDict
from pydantic import BaseModel, Field, computed_field


# ==========================================
# 1. HARDWARE SERIAL INGESTION CONTRACTS
# ==========================================

class EmergencyFlags(BaseModel):
    raw_bitmask: int = Field(..., description="8-bit integer flag from LoRa payload")

    @computed_field
    @property
    def trapped(self) -> bool:
        return bool(self.raw_bitmask & 1)

    @computed_field
    @property
    def injured(self) -> bool:
        return bool(self.raw_bitmask & 2)

    @computed_field
    @property
    def fire(self) -> bool:
        return bool(self.raw_bitmask & 4)

    @computed_field
    @property
    def flood(self) -> bool:
        return bool(self.raw_bitmask & 8)

    @computed_field
    @property
    def supplies_needed(self) -> bool:
        return bool(self.raw_bitmask & 16)

    @computed_field
    @property
    def is_critical(self) -> bool:
        # Critical if trapped, injured, fire, or flood bit is active
        return bool(self.raw_bitmask & (1 | 2 | 4 | 8))


class SerialTelemetryEvent(BaseModel):
    t: int = Field(..., description="Hardware uptime timestamp (ms)")
    node: str = Field(..., description="Reporting helper node address, e.g., 0x0001")
    ev: Literal[
        "ini_tx", "radio_rx", "data_decoded", "data_rx", 
        "delivered", "delivery_acked", "hello", "neighbor_lost"
    ]
    gps_fix: Optional[bool] = None
    len: Optional[int] = None
    first: Optional[int] = None
    rssi: Optional[float] = None
    snr: Optional[float] = None
    src: Optional[str] = None
    dst: Optional[str] = None
    nh: Optional[str] = None
    mid: Optional[int] = None
    key: Optional[str] = None
    from_node: Optional[str] = Field(default=None, alias="from")
    ttl: Optional[int] = None
    hops: Optional[int] = None
    path: Optional[List[str]] = None
    by: Optional[str] = None
    lost_node: Optional[str] = None


class CompactedLoRaPayload(BaseModel):
    t: Literal["DATA"] = "DATA"
    src: str = Field(..., description="Originating dongle ID, e.g., 2001 or 0x2001")
    mid: int = Field(..., description="Incremental message sequence ID")
    dst: str = Field(..., description="Destination helper ID, e.g., 0001")
    nh: str = Field(..., description="Next hop ID")
    ttl: int = Field(..., description="Time to live")
    ppl: int = Field(..., description="Headcount of trapped survivors")
    flg: int = Field(..., description="8-bit emergency bitmask")
    lat: float
    lon: float
    alt: float
    acc: float
    ts: int = Field(..., description="Unix epoch timestamp")
    path: List[str] = Field(default_factory=list)

    @property
    def normalized_src(self) -> str:
        return self.src if self.src.startswith("0x") else f"0x{self.src}"

    @property
    def packet_key(self) -> str:
        clean_src = self.src.replace("0x", "")
        return f"{clean_src}-{self.mid:05d}"

    @property
    def decoded_flags(self) -> EmergencyFlags:
        return EmergencyFlags(raw_bitmask=self.flg)


# ==========================================
# 2. TOPOLOGY & RF HEALTH CONTRACTS
# ==========================================

class NodeStatusEnum(str, Enum):
    ONLINE = "ONLINE"
    DEGRADED = "DEGRADED"
    SUBMERGED_UNREACHABLE = "SUBMERGED / UNREACHABLE"


class NodeState(BaseModel):
    node_id: str
    status: NodeStatusEnum = NodeStatusEnum.ONLINE
    last_seen_epoch: float
    has_reported: bool = False
    missed_heartbeats: int = 0
    avg_rssi: float = -75.0
    avg_snr: float = 10.0
    lat: float
    lon: float
    alt: float
    upstream_neighbors: List[str] = Field(default_factory=list)


class RelayRecommendation(BaseModel):
    target_sector_nodes: List[str]
    recommended_lat: float
    recommended_lon: float
    recommended_alt: float
    reason: str


# ==========================================
# 3. LANGGRAPH & OLLAMA STRUCTURED OUTPUTS
# ==========================================

class TriageAssessment(BaseModel):
    urgency_score: int = Field(..., ge=1, le=10, description="10 = Immediate life threat")
    priority_level: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    survivor_categorization: str = Field(..., description="Summary of headcount and medical condition")
    recommended_gear: List[str] = Field(
        ..., description="Specific physical rescue equipment, e.g., Zodiac motorboats, trauma kits, pediatric rations"
    )
    clinical_rationale: str = Field(..., description="Concise tactical reasoning for the score")


class AerialAssetStatus(BaseModel):
    asset_id: str
    asset_type: Literal["DRONE_RELAY", "TETHERED_AEROSTAT"]
    status: Literal["IDLE", "DEPLOYED", "RETURNING", "HANDOVER_PENDING"]
    battery_pct: int = Field(..., ge=0, le=100)
    assigned_sector: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class DispatchAllocation(BaseModel):
    allocated_drone_id: Optional[str]
    requires_aerostat_handover: bool
    handover_aerostat_id: Optional[str] = None
    deployment_lat: float
    deployment_lon: float
    deployment_alt: float
    fleet_active_count: int
    fleet_ceiling: int = 6
    allocation_notes: str


class IncidentManifest(BaseModel):
    manifest_id: str
    incident_key: str
    commander_directive: str
    urgency_level: str
    target_coordinates: Dict[str, float]
    allocated_physical_gear: List[str]
    aerial_relay_assignment: str
    auto_ack_hex_command: str


class TriageGraphState(TypedDict):
    packet_key: str
    payload: Dict[str, Any]
    rf_context: Dict[str, Any]
    topology_partitioned: bool
    high_priority_escalation: bool
    triage_assessment: Optional[Dict[str, Any]]
    dispatch_allocation: Optional[Dict[str, Any]]
    incident_manifest: Optional[Dict[str, Any]]


# ==========================================
# 4. WEBSOCKET & REST API CONTRACTS
# ==========================================

class AckRequest(BaseModel):
    target_node: str = Field(..., examples=["0x2001"])
    packet_key: str = Field(..., examples=["2001-00016"])
    commander_note: Optional[str] = "RESCUE DISPATCHED - HOLD POSITION"


class WSMessage(BaseModel):
    event_type: Literal[
        "live_packet",
        "node_status",
        "link_degradation_alert",
        "triage_alert",
        "drone_dispatch_order",
        "ack_dispatched"
    ]
    timestamp: float
    data: Dict[str, Any]


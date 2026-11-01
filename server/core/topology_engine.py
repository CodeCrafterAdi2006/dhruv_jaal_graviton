import asyncio
import time
from collections import deque
from typing import Deque, Dict, List, Optional

from server.config import (
    BASELINE_NODES,
    HEARTBEAT_INTERVAL_SEC,
    MAX_MISSED_HEARTBEATS,
    RSSI_DEGRADATION_THRESHOLD,
    SNR_DEGRADATION_THRESHOLD,
    RF_WINDOW_SIZE,
)
from server.models.schemas import NodeState, NodeStatusEnum, RelayRecommendation
from server.core.ws_manager import ws_manager


class TopologyEngine:
    def __init__(self) -> None:
        now = time.time()
        self.nodes: Dict[str, NodeState] = {}
        self.rssi_history: Dict[str, Deque[float]] = {}
        self.snr_history: Dict[str, Deque[float]] = {}

        for node_id, (lat, lon, alt) in BASELINE_NODES.items():
            self.nodes[node_id] = NodeState(
                node_id=node_id,
                status=NodeStatusEnum.ONLINE,
                last_seen_epoch=now,
                lat=lat,
                lon=lon,
                alt=alt,
            )
            self.rssi_history[node_id] = deque(maxlen=RF_WINDOW_SIZE)
            self.snr_history[node_id] = deque(maxlen=RF_WINDOW_SIZE)

    def record_heartbeat(
        self,
        node_id: str,
        rssi: Optional[float] = None,
        snr: Optional[float] = None,
        path: Optional[List[str]] = None,
    ) -> Optional[RelayRecommendation]:
        now = time.time()
        norm_id = node_id if node_id.startswith("0x") or node_id.startswith("N") else f"0x{node_id}"

        if norm_id not in self.nodes:
            self.nodes[norm_id] = NodeState(
                node_id=norm_id,
                status=NodeStatusEnum.ONLINE,
                last_seen_epoch=now,
                lat=27.6800,
                lon=85.3200,
                alt=1300.0,
            )
            self.rssi_history[norm_id] = deque(maxlen=RF_WINDOW_SIZE)
            self.snr_history[norm_id] = deque(maxlen=RF_WINDOW_SIZE)

        node = self.nodes[norm_id]
        node.last_seen_epoch = now
        node.has_reported = True
        node.missed_heartbeats = 0

        if path:
            node.upstream_neighbors = path
            for hop in path:
                if hop in self.nodes:
                    self.nodes[hop].last_seen_epoch = now
                    self.nodes[hop].missed_heartbeats = 0

        if rssi is not None:
            self.rssi_history[norm_id].append(rssi)
            node.avg_rssi = sum(self.rssi_history[norm_id]) / len(self.rssi_history[norm_id])

        if snr is not None:
            self.snr_history[norm_id].append(snr)
            node.avg_snr = sum(self.snr_history[norm_id]) / len(self.snr_history[norm_id])

        if node.avg_rssi < RSSI_DEGRADATION_THRESHOLD or node.avg_snr < SNR_DEGRADATION_THRESHOLD:
            node.status = NodeStatusEnum.DEGRADED
            return self.compute_bridge_coordinates([norm_id], "RF Link Degradation (Moving Avg threshold breached)")
        else:
            node.status = NodeStatusEnum.ONLINE
            return None

    def mark_neighbor_lost(self, reporter_id: str, lost_node_id: str) -> RelayRecommendation:
        if lost_node_id in self.nodes:
            self.nodes[lost_node_id].status = NodeStatusEnum.SUBMERGED_UNREACHABLE
            self.nodes[lost_node_id].missed_heartbeats = MAX_MISSED_HEARTBEATS
        return self.compute_bridge_coordinates(
            [reporter_id, lost_node_id],
            f"Upstream neighbor {reporter_id} reported link severance to {lost_node_id}",
        )

    def compute_bridge_coordinates(self, affected_nodes: List[str], reason: str) -> RelayRecommendation:
        coords = [self.nodes[n] for n in affected_nodes if n in self.nodes]
        base = self.nodes["0x0001"]
        if not coords:
            coords = [base]

        avg_lat = (sum(c.lat for c in coords) + base.lat) / (len(coords) + 1)
        avg_lon = (sum(c.lon for c in coords) + base.lon) / (len(coords) + 1)
        max_alt = max(c.alt for c in coords) + 120.0

        return RelayRecommendation(
            target_sector_nodes=affected_nodes,
            recommended_lat=round(avg_lat, 6),
            recommended_lon=round(avg_lon, 6),
            recommended_alt=round(max_alt, 1),
            reason=reason,
        )

    def has_partitioned_sector(self) -> bool:
        return any(n.status == NodeStatusEnum.SUBMERGED_UNREACHABLE for n in self.nodes.values())

    async def watchdog_loop(self) -> None:
        """Runs every 5 seconds to evaluate the 30-second Dead-Man's heartbeat window."""
        while True:
            await asyncio.sleep(5.0)
            now = time.time()
            for node_id, node in list(self.nodes.items()):
                # Local USB helper node and Base Camp N8 are SAFE GROUND HQ - NEVER SUBMERGED
                if node_id in ("0x0001", "0001", "N8"):
                    continue
                # Only check nodes that have actually reported into this session
                if not node.has_reported:
                    continue
                elapsed = now - node.last_seen_epoch
                missed = int(elapsed // HEARTBEAT_INTERVAL_SEC)
                if missed >= MAX_MISSED_HEARTBEATS and node.status != NodeStatusEnum.SUBMERGED_UNREACHABLE:
                    node.missed_heartbeats = missed
                    node.status = NodeStatusEnum.SUBMERGED_UNREACHABLE
                    rec = self.compute_bridge_coordinates(
                        [node_id],
                        f"Missed {missed} consecutive 30s heartbeats (Dead-Man's Switch triggered)",
                    )
                    await ws_manager.broadcast(
                        "node_status",
                        {
                            "node": node.model_dump(),
                            "relay_recommendation": rec.model_dump(),
                        },
                    )

    def get_topology_snapshot(self) -> Dict[str, dict]:
        return {k: v.model_dump() for k, v in self.nodes.items()}


topology_engine = TopologyEngine()


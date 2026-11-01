import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, List
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from server.config import OLLAMA_BASE_URL, OLLAMA_MODEL
from server.models.schemas import AckRequest, CompactedLoRaPayload
from server.core.ws_manager import ws_manager
from server.core.topology_engine import topology_engine
from server.core.serial_reader import SerialManager
from server.agents.graph import triage_agent_app, fleet_registry

event_queue: asyncio.Queue = asyncio.Queue()
serial_manager = SerialManager(event_queue=event_queue)
sos_ledger: List[Dict[str, Any]] = []


async def event_consumer_worker() -> None:
    """Consumes normalized events from SerialManager and routes to TopologyEngine & LangGraph."""
    while True:
        item = await event_queue.get()
        try:
            if item["type"] == "telemetry":
                evt = item["payload"]
                ev_name = evt.get("ev")

                if ev_name in ("radio_rx", "data_rx", "delivered", "hello"):
                    src_node = evt.get("from") or evt.get("src") or evt.get("node")
                    rec = topology_engine.record_heartbeat(
                        node_id=src_node,
                        rssi=evt.get("rssi"),
                        snr=evt.get("snr"),
                        path=evt.get("path"),
                    )
                    if rec:
                        await ws_manager.broadcast(
                            "link_degradation_alert",
                            {
                                "node_id": src_node,
                                "rssi": evt.get("rssi"),
                                "snr": evt.get("snr"),
                                "relay_recommendation": rec.model_dump(),
                            },
                        )

                elif ev_name == "neighbor_lost":
                    rec = topology_engine.mark_neighbor_lost(
                        reporter_id=evt.get("from", "N2"),
                        lost_node_id=evt.get("lost_node", "N3"),
                    )
                    await ws_manager.broadcast(
                        "node_status",
                        {
                            "topology": topology_engine.get_topology_snapshot(),
                            "relay_recommendation": rec.model_dump(),
                        },
                    )

                await ws_manager.broadcast("live_packet", evt)

            elif item["type"] == "sos_payload":
                payload = item["payload"]
                rf_context = item["rf_context"]
                packet_key = item["packet_key"]

                # Update topology heartbeat from payload path
                topology_engine.record_heartbeat(
                    node_id=payload["src"],
                    rssi=rf_context.get("rssi"),
                    snr=rf_context.get("snr"),
                    path=payload.get("path"),
                )

                # Broadcast immediate raw packet arrival to MapLibre GL JS
                await ws_manager.broadcast(
                    "live_packet",
                    {"packet_key": packet_key, "payload": payload, "rf_context": rf_context},
                )

                # Execute Local LangGraph Triage & Fleet Planning in background thread pool
                initial_state = {
                    "packet_key": packet_key,
                    "payload": payload,
                    "rf_context": rf_context,
                    "topology_partitioned": topology_engine.has_partitioned_sector(),
                    "high_priority_escalation": False,
                    "triage_assessment": None,
                    "dispatch_allocation": None,
                    "incident_manifest": None,
                }
                result_state = await asyncio.to_thread(triage_agent_app.invoke, initial_state)

                ledger_entry = {
                    "packet_key": packet_key,
                    "payload": payload,
                    "rf_context": rf_context,
                    "triage": result_state["triage_assessment"],
                    "dispatch": result_state["dispatch_allocation"],
                    "manifest": result_state["incident_manifest"],
                }
                sos_ledger.append(ledger_entry)

                await ws_manager.broadcast("triage_alert", ledger_entry)
                await ws_manager.broadcast(
                    "drone_dispatch_order",
                    {
                        "packet_key": packet_key,
                        "dispatch": result_state["dispatch_allocation"],
                        "manifest": result_state["incident_manifest"],
                    },
                )
        finally:
            event_queue.task_done()


@asynccontextmanager
async def lifespan(app: FastAPI):
    reader_task = asyncio.create_task(serial_manager.run_reader())
    watchdog_task = asyncio.create_task(topology_engine.watchdog_loop())
    consumer_task = asyncio.create_task(event_consumer_worker())
    yield
    reader_task.cancel()
    watchdog_task.cancel()
    consumer_task.cancel()


app = FastAPI(
    title="Dhruva Jaal Air-Gapped Disaster Mesh Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    ollama_online = False
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(0.8, connect=0.4)) as client:
            r = await asyncio.wait_for(client.get(f"{OLLAMA_BASE_URL}/api/tags"), timeout=1.0)
            ollama_online = r.status_code == 200
    except Exception:
        ollama_online = False

    return {
        "status": "ONLINE",
        "serial_mode": serial_manager.mode,
        "ollama_connected": ollama_online,
        "ollama_model": OLLAMA_MODEL,
        "active_drones": sum(1 for d in fleet_registry.drones if d.status != "IDLE"),
        "drone_ceiling": 6,
    }


@app.get("/nodes")
async def get_nodes() -> Dict[str, Any]:
    return {
        "nodes": topology_engine.get_topology_snapshot(),
        "fleet": {
            "drones": [d.model_dump() for d in fleet_registry.drones],
            "aerostats": [a.model_dump() for a in fleet_registry.aerostats],
        },
    }


@app.get("/sos")
async def get_sos_ledger() -> Dict[str, Any]:
    return {"count": len(sos_ledger), "incidents": sos_ledger}


@app.post("/ack")
async def send_lora_ack(req: AckRequest) -> Dict[str, Any]:
    clean_target = req.target_node.replace("0x", "")
    ack_frame = f"@ACK,{clean_target},{req.packet_key},{req.commander_note}\n"
    delivered = await serial_manager.write_ack(ack_frame)
    await ws_manager.broadcast(
        "ack_dispatched",
        {
            "target_node": req.target_node,
            "packet_key": req.packet_key,
            "ack_frame": ack_frame.strip(),
            "serial_sent": delivered,
        },
    )
    return {"status": "ACK_QUEUED", "frame": ack_frame.strip()}


@app.post("/inject_packet")
async def inject_custom_packet(payload: CompactedLoRaPayload) -> Dict[str, Any]:
    line = f'# json : {payload.model_dump_json()}'
    success = await serial_manager.inject_line(line)
    return {"status": "SUCCESS" if success else "FAILED", "packet_key": payload.packet_key}


@app.post("/inject_test_stream")
async def inject_test_stream() -> Dict[str, Any]:
    asyncio.create_task(serial_manager.run_synthetic_stream())
    return {"status": "STREAM_STARTED"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        # Push initial topology state immediately on connection
        await websocket.send_json({
            "event_type": "node_status",
            "timestamp": asyncio.get_running_loop().time(),
            "data": {"topology": topology_engine.get_topology_snapshot()},
        })
        while True:
            raw_msg = await websocket.receive_text()
            # Allow frontend to trigger ACKs directly over WebSocket
            if raw_msg.startswith("ACK:"):
                parts = raw_msg.split(":")
                if len(parts) >= 3:
                    ack_frame = f"@ACK,{parts[1]},{parts[2]},WS_COMMANDER_ACK\n"
                    await serial_manager.write_ack(ack_frame)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

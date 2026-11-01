import time
from typing import Any, Dict, List
from fastapi import WebSocket
from server.models.schemas import WSMessage


class WebSocketManager:
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event_type: str, data: Dict[str, Any]) -> None:
        msg = WSMessage(
            event_type=event_type,  # type: ignore
            timestamp=time.time(),
            data=data,
        ).model_dump()

        stale: List[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(msg)
            except Exception:
                stale.append(connection)

        for s in stale:
            self.disconnect(s)


ws_manager = WebSocketManager()


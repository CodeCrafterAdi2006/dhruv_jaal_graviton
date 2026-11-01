// Unified DataSource and Event Emitter Interface for Dhruva Jaal
// Allows seamless switching between scripted Scenario playback and live hardware WebSockets

export class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in listener for event "${event}":`, err);
        }
      });
    }
  }
}

/**
 * Base DataSource class
 */
export class DataSource extends EventEmitter {
  connect() {}
  disconnect() {}
}

/**
 * WebSocketSource stub for live hardware integration
 * Activated via URL query param: ?source=ws
 * Connects to Python bridge at ws://localhost:8765
 */
export class WebSocketSource extends DataSource {
  constructor(url = 'ws://localhost:8765') {
    super();
    this.url = url;
    this.ws = null;
    this.reconnectTimer = null;
  }

  connect() {
    console.log(`[WebSocketSource] Connecting to live hardware bridge at ${this.url}...`);
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocketSource] Connected to live hardware!');
        this.emit('source_status', { connected: true, live: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type) {
            this.emit(payload.type, payload);
          }
        } catch (e) {
          console.warn('[WebSocketSource] Non-JSON payload received:', event.data);
        }
      };

      this.ws.onclose = () => {
        console.warn('[WebSocketSource] Disconnected from hardware bridge.');
        this.emit('source_status', { connected: false, live: false });
        // Attempt reconnect every 4s
        this.reconnectTimer = setTimeout(() => this.connect(), 4000);
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocketSource] Error:', err);
      };
    } catch (err) {
      console.warn('[WebSocketSource] Could not initiate WebSocket:', err);
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}

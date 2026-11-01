/**
 * LiveTelemetryBridge.js — Real-Time WebSocket Bridge for Dhruva Jaal
 * Connects the Air-Gapped Local Application Server to the MapLibre GL JS digital twin.
 */

export class LiveTelemetryBridge {
  constructor(scenarioEngine, audioSynth, wsUrl = "ws://localhost:8000/ws") {
    this.engine = scenarioEngine;
    this.audio = audioSynth;
    this.wsUrl = wsUrl;
    this.socket = null;
    this.reconnectTimer = null;
    this.isConnected = false;
    this.onStatusChange = null;
  }

  connect() {
    try {
      this.socket = new WebSocket(this.wsUrl);
    } catch (e) {
      console.warn("[DhruvaJaal WS] Init failed:", e);
      return;
    }

    this.socket.onopen = () => {
      console.log("[DhruvaJaal WS] Connected to Air-Gapped Local Server");
      this.isConnected = true;
      if (this.onStatusChange) this.onStatusChange(true);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.routeEvent(msg);
      } catch (err) {
        console.error("[DhruvaJaal WS] Parse error:", err);
      }
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      if (this.onStatusChange) this.onStatusChange(false);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.socket.onerror = () => {
      this.isConnected = false;
      if (this.onStatusChange) this.onStatusChange(false);
    };
  }

  routeEvent(msg) {
    const { event_type, data } = msg;
    const isSandbox = this.engine?.activeMode === 'sandbox';

    switch (event_type) {
      case "live_packet": {
        if (data.payload) {
          this.audio?.playHop?.();
          const p = data.payload;
          const srcId = p.src ? (p.src.startsWith('0x') ? p.src : `0x${p.src}`) : '0x2001';
          
          // Only spawn live dynamic nodes onto the map canvas in Tactical Sandbox mode
          // (In Incident Replay mode, preserve the scripted historical timeline clean)
          if (isSandbox && p.lon && p.lat && this.engine) {
            const existing = this.engine.dynamicNodes?.get(srcId);
            if (!existing && this.engine.spawnDynamicNode) {
              this.engine.spawnDynamicNode(p.lon, p.lat, {
                id: srcId,
                label: `SURVIVOR · ${srcId}`,
                people: p.ppl || 1,
                role: 'dongle'
              });
            }
          }
        }
        break;
      }

      case "node_status": {
        // Only apply server watchdog node submergence in Tactical Sandbox mode
        // Never apply to Base Camp N8 (Safe Ground HQ)
        if (isSandbox && data.topology && this.engine) {
          Object.entries(data.topology).forEach(([nodeId, nState]) => {
            if (nodeId === 'N8' || nodeId === '0x0001' || nodeId === '0001') return;
            if (nState.status === "SUBMERGED / UNREACHABLE") {
              if (this.engine.manualKilledNodes && !this.engine.manualKilledNodes.has(nodeId)) {
                this.engine.manualKilledNodes.add(nodeId);
                const state = this.engine.reconstructStateAt(this.engine.currentTime);
                this.engine.emit('state_update', state);
              }
            }
          });
        }
        if (data.relay_recommendation) {
          const rec = data.relay_recommendation;
          console.warn(`[DhruvaJaal Watchdog] Relay Recommended at [${rec.recommended_lon}, ${rec.recommended_lat}]: ${rec.reason}`);
        }
        break;
      }

      case "link_degradation_alert": {
        this.audio?.playBeacon?.();
        const rec = data.relay_recommendation;
        console.warn(`[DhruvaJaal Watchdog] Link Degradation on Node ${data.node_id} (RSSI: ${data.rssi} dBm, SNR: ${data.snr} dB)`);
        
        // Only auto-dispatch bridging drones in Tactical Sandbox mode
        if (isSandbox && rec && this.engine?.dispatchDroneTo) {
          this.engine.dispatchDroneTo(rec.recommended_lon, rec.recommended_lat, {
            targetZone: rec.target_sector_nodes?.join(' ➔ ') || 'Degraded Link',
            label: 'DRONE (Degradation Bridge)'
          });
        }
        break;
      }

      case "triage_alert": {
        this.audio?.playDelivered?.();
        const p = data.payload || {};
        const triage = data.triage || {};
        const srcId = p.src ? (p.src.startsWith('0x') ? p.src : `0x${p.src}`) : '0x2001';

        // Only spawn pins in Tactical Sandbox mode
        if (isSandbox && p.lon && p.lat && this.engine?.spawnDynamicNode) {
          const existing = this.engine.dynamicNodes?.get(srcId);
          if (!existing) {
            this.engine.spawnDynamicNode(p.lon, p.lat, {
              id: srcId,
              label: `🚨 [${triage.priority_level || 'CRITICAL'}] ${srcId}`,
              people: p.ppl || 1,
              role: 'dongle'
            });
          }
        }

        // Always display incoming live triage cards in the telemetry log feed
        const logFeed = document.getElementById('log-feed');
        if (logFeed) {
          const item = document.createElement('div');
          item.className = 'log-item log-item-sos';
          item.innerHTML = `
            <div class="log-meta">
              <span class="log-time">LIVE LORA</span>
              <span class="log-tag" style="background:#ef444422;color:#ef4444;border:1px solid #ef4444">${triage.priority_level || 'P1'}</span>
            </div>
            <div class="log-detail" style="color:#ef4444;font-weight:700;">
              [AI TRIAGE] ${p.ppl || '?'} People at ${srcId}. Gear: ${(triage.recommended_gear || []).slice(0, 2).join(', ')}
            </div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">
              ${triage.clinical_rationale || ''}
            </div>
          `;
          logFeed.prepend(item);
        }
        break;
      }

      case "drone_dispatch_order": {
        const d = data.dispatch || {};
        const m = data.manifest || {};
        console.log(`[DhruvaJaal Fleet] Commander Directive: ${m.commander_directive}`);

        // Post commander directive to tactical log feed without interrupting user map sandbox
        const logFeed = document.getElementById('log-feed');
        if (logFeed && m.commander_directive) {
          const item = document.createElement('div');
          item.className = 'log-item';
          item.style.borderColor = '#00f0ff';
          item.innerHTML = `
            <div class="log-meta">
              <span class="log-time">AI FLEET DISPATCH</span>
              <span class="log-tag" style="background:#00f0ff22;color:#00f0ff;border:1px solid #00f0ff">${d.allocated_drone_id || 'FLEET'}</span>
            </div>
            <div class="log-detail" style="color:#00f0ff;font-weight:600;">
              ${m.commander_directive}
            </div>
          `;
          logFeed.prepend(item);
        }
        break;
      }

      case "ack_dispatched": {
        this.audio?.playAck?.();
        const target = data.target_node;
        console.log(`[DhruvaJaal ACK] Return ACK confirmed for ${target}: ${data.ack_frame}`);
        if (this.engine?.survivorBeacons?.has(target)) {
          const b = this.engine.survivorBeacons.get(target);
          b.isAcknowledged = true;
          this.engine.emit('state_update', this.engine.reconstructStateAt(this.engine.currentTime));
        }
        break;
      }
    }
  }

  async injectCustomPacket(payload) {
    try {
      const res = await fetch("http://localhost:8000/inject_packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (err) {
      console.warn("[DhruvaJaal] injectCustomPacket error:", err);
      return { status: "OFFLINE", error: String(err) };
    }
  }

  async sendHardwareAck(targetNode, packetKey, commanderNote = "RESCUE EN ROUTE") {
    try {
      const res = await fetch("http://localhost:8000/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_node: targetNode,
          packet_key: packetKey,
          commander_note: commanderNote,
        }),
      });
      return await res.json();
    } catch (err) {
      console.error("[DhruvaJaal] sendHardwareAck error:", err);
      return { status: "ERROR", error: String(err) };
    }
  }
}

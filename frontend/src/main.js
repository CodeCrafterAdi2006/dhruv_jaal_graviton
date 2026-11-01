import './hud.css';
import { MapManager }      from './map/MapManager.js';
import { ScenarioEngine }  from './engine/ScenarioEngine.js';
import { NodeLayer }       from './map/NodeLayer.js';
import { LinkPacketLayer } from './map/LinkPacketLayer.js';
import { BaseCampInbox }   from './ui/Inbox.js';
import { ModalsManager }   from './ui/Modals.js';
import { LiveTelemetryBridge } from './engine/LiveTelemetryBridge.js';
import { soundFx }         from './engine/AudioSynthesizer.js';

// ─── Engine & Map ──────────────────────────────────────────────────────────────
const mapManager = new MapManager('map');
const engine     = new ScenarioEngine();

window.mapManager = mapManager;
window.engine     = engine;

mapManager.init().then(map => {
  console.log('[Dhruva Jaal] Map engine ready.');

  // Phase 4: Ground, Tower & Aerial Markers
  const nodeLayer = new NodeLayer(map);
  nodeLayer.init();

  // Phase 5: Dynamic 60fps Links & SOS Pulses
  const linkPacketLayer = new LinkPacketLayer(map);
  linkPacketLayer.init();

  // Phase 6: Base Camp Inbox (HQ Message Dispatch)
  const inbox = new BaseCampInbox(map, nodeLayer);
  inbox.init();

  // Phase 7: Context & Response Plan Modal + Mission Summary Overlay + Honesty Footer
  const modals = new ModalsManager(engine, map);
  modals.init();

  window.nodeLayer       = nodeLayer;
  window.linkPacketLayer = linkPacketLayer;
  window.inbox           = inbox;
  window.modals          = modals;

  // Phase 8: Local Air-Gapped Application Server & Hardware Telemetry Bridge
  const telemetryBridge = new LiveTelemetryBridge(engine, soundFx);
  const hwBadge = document.getElementById('hw-server-badge');
  telemetryBridge.onStatusChange = (isOnline) => {
    if (hwBadge) {
      hwBadge.className = isOnline ? 'badge-hardware online' : 'badge-hardware offline';
      hwBadge.textContent = isOnline ? '● Local Server: Live (Air-Gapped)' : '● Local Server: Offline';
    }
  };
  telemetryBridge.connect();
  window.telemetryBridge = telemetryBridge;

  // Compass widget removed to prevent control blocking and UI clutter

  // ─── Alert Banner ──────────────────────────────────────────────────────────
  const alertBanner = document.getElementById('network-alert-banner');
  const updateAlert = (state) => {
    if (alertBanner) alertBanner.classList.toggle('visible', !state.towersOnline);
  };

  // ─── Right Sidebar: live updates ───────────────────────────────────────────
  const logFeed   = document.getElementById('log-feed');
  const nodesList = document.getElementById('nodes-list');
  const seenSos   = new Set();

  const defaultRssi = {
    N1: -68, N2: -72, N3: -78, N4: -87,
    N5: -82, N6: -76, N7: -70, N8: -69
  };

  const rssiToWidth = (dbm) => {
    return Math.max(5, Math.min(100, Math.round(((dbm + 120) / 60) * 100)));
  };
  const rssiToClass = (dbm) => dbm >= -80 ? 'strong' : dbm >= -100 ? 'medium' : 'weak';

  function updateSidebar(state) {
    // ── 1. Message Log
    if (logFeed && state.sosStates) {
      state.sosStates.forEach(sos => {
        const key = `${sos.id}-${sos.state}`;
        if (seenSos.has(key)) return;
        if (sos.state === 'QUEUED') return; // silent — don't clutter
        seenSos.add(key);

        const stateLabels = {
          STORED:       { cls: 'state-stored',    text: 'STORED' },
          TRANSMITTING: { cls: 'state-transit',   text: 'TRANSMIT' },
          SENT_TO_MESH: { cls: 'state-transit',   text: 'SENT_TO_MESH' },
          DELIVERED:    { cls: 'state-delivered', text: 'DELIVERED' },
          FAILED:       { cls: 'state-failed',    text: 'FAILED' }
        };
        const lbl = stateLabels[sos.state] || { cls: '', text: sos.state };

        const item = document.createElement('div');
        item.className = 'log-item' + (sos.state === 'DELIVERED' ? ' log-item-delivered' : '');
        item.innerHTML = `
          <div class="log-meta">
            <span class="log-time">${sos.simClock || state.simClock || '--'}</span>
            <span class="log-tag ${lbl.cls}">${lbl.text}</span>
          </div>
          <div class="log-detail">${sos.id} · From ${sos.from} → ${sos.path?.[sos.path.length-1] || 'N8'}</div>
        `;
        logFeed.prepend(item);
        while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
      });
    }

    // ── 2. RSSI Node Bars
    if (nodesList && state.nodes) {
      nodesList.innerHTML = '';
      const groundNodes = state.nodes.filter(n =>
        ['dongle','relay','helper'].includes(n.role) &&
        !['DR1','DR2','DR3','DR4','BL1','BL2'].includes(n.id)
      );
      const aerials = state.nodes.filter(n =>
        (n.role === 'drone' || n.role === 'balloon') && n.visible
      );

      [...groundNodes, ...aerials].forEach(n => {
        const raw  = defaultRssi[n.id] || -78;
        const jitter = (Math.sin(Date.now() * 0.0005 + n.id.charCodeAt(0)) * 1.5);
        const dbm  = n.status === 'online' ? Math.round(raw + jitter) : null;
        const cls  = dbm !== null ? rssiToClass(dbm) : 'offline';
        const w    = dbm !== null ? rssiToWidth(dbm) : 5;
        let rolePrefix = 'relay';
        let roleName = 'Relay';
        let detail = n.sublabel || n.place?.split(' ')?.[0] || 'Community';
        if (n.role === 'drone') {
          rolePrefix = 'drone';
          roleName = 'Drone';
          detail = n.sublabel || '80m Relay';
        } else if (n.role === 'balloon') {
          rolePrefix = 'balloon';
          roleName = 'Balloon';
          detail = n.sublabel || '100m Aerostat';
        } else if (n.role === 'helper') {
          rolePrefix = 'base';
          roleName = 'Base Camp';
          detail = 'Safe Ground HQ';
        } else if (n.role === 'dongle' || (n.isDynamic && n.role !== 'relay')) {
          rolePrefix = 'survivor';
          roleName = 'Survivor';
          detail = n.sublabel || 'Stranded';
        }
        const labelHtml = `<span class="badge-dot dot-${rolePrefix}"></span><span class="node-id-tag">${n.id}</span> · ${roleName} (${detail})`;
        const titleStr = `${n.id} · ${roleName} (${detail})`;
        const valStr = dbm !== null ? `${dbm} dBm` : '— OFFLINE';
        nodesList.innerHTML += `
          <div class="node-row ${n.status !== 'online' ? 'node-row-down' : ''}">
            <div class="node-row-header">
              <span class="node-name ${n.role}" title="${titleStr}">${labelHtml}</span>
              <span class="node-val">${valStr}</span>
            </div>
            <div class="meter-track"><div class="meter-fill ${cls}" style="width:${w}%"></div></div>
          </div>`;
      });
    }

    // ── 3. Network Stats
    const onlineCount  = state.nodes?.filter(n => n.status === 'online' && n.visible !== false).length ?? 0;
    const totalCount   = state.nodes?.filter(n => n.visible !== false).length ?? 0;
    const lastSos      = state.sosStates?.filter(s => s.state === 'DELIVERED').slice(-1)[0];

    const el = (id) => document.getElementById(id);
    if (el('stat-hops'))  el('stat-hops').textContent  = lastSos?.path ? lastSos.path.length - 1 : '—';
    if (el('stat-rate'))  el('stat-rate').textContent  = totalCount > 0 ? `${Math.round((onlineCount/totalCount)*100)}%` : '—';
    if (el('stat-rssi'))  el('stat-rssi').textContent  = '-77 dBm';
    if (el('stat-nodes')) el('stat-nodes').textContent = `${onlineCount} / ${totalCount}`;
  }

  function updateFleetStatus() {
    const fleetEl = document.getElementById('sb-fleet-status');
    if (!fleetEl) return;
    const droneCount = engine.dynamicDrones?.size || 0;
    const balloonCount = engine.dynamicBalloons?.size || 0;
    const maxDrones = engine.MAX_DRONES || 6;
    const isFull = droneCount >= maxDrones;
    fleetEl.textContent = `DRONES: ${droneCount}/${maxDrones}${isFull ? ' (MAX)' : ''} · BALLOONS: ${balloonCount}`;
    fleetEl.style.borderColor = isFull ? '#ffb020' : 'rgba(255,176,32,0.4)';
    fleetEl.style.background = isFull ? 'rgba(255,176,32,0.25)' : 'rgba(255,176,32,0.12)';
  }

  // ─── Engine Event Routing ──────────────────────────────────────────────────
  engine.on('state_update', (state) => {
    updateAlert(state);
    nodeLayer.update(state);
    linkPacketLayer.update(state);
    mapManager.updateFloodLevel(state.t || 0);
    updateSidebar(state);
    inbox.update(state);
    updateTimeline(state);
    updateFleetStatus();
  });

  engine.on('state_reset', (state) => {
    updateAlert(state);
    nodeLayer.update(state);
    linkPacketLayer.update(state);
    mapManager.updateFloodLevel(0);
    seenSos.clear();
    if (logFeed) logFeed.innerHTML = '';
    updateSidebar(state);
    inbox.reset();
    updateTimeline(state);
    updateFleetStatus();
  });

  // Real-time interactive packet transmission (animates live independent of timeline)
  engine.on('live_packet_launch', (packetConfig) => {
    linkPacketLayer.launchLivePacket(packetConfig);
  });

  engine.on('survivor_ack', (evt) => {
    if (logFeed) {
      const item = document.createElement('div');
      item.className = 'log-item log-item-delivered';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">TWO-WAY ACK</span>
          <span class="log-tag state-delivered" style="background:#10b981;color:#0b1220;font-weight:900">CONFIRMED</span>
        </div>
        <div class="log-detail" style="color:#10b981;font-weight:700">[ACK] ${evt.nodeId} received Base Camp Rescue ACK! Boat en route.</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    }
  });

  engine.on('sos_stored', (evt) => {
    if (logFeed) {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">STORE & FWD</span>
          <span class="log-tag state-stored">FLASH HOLD</span>
        </div>
        <div class="log-detail" style="color:#f5b942">[HOLD] Survivor ${evt.survivor.id} isolated · Held in flash (retrying every 16s)</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    }
  });

  engine.on('node_status', (evt) => {
    if (logFeed && evt.status === 'down') {
      const item = document.createElement('div');
      item.className = 'log-item log-item-down';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">${evt.simClock || 'ALERT'}</span>
          <span class="log-tag state-failed">DOWN</span>
        </div>
        <div class="log-detail" style="color:#ff6b6b">[ALERT] Node ${evt.id} DOWN · ${evt.reason || 'Flooded'}</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    }
  });

  engine.on('aerial', (evt) => {
    if (!logFeed) return;
    if (evt.type === 'drones_launch') {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">${evt.simClock || 'DISPATCH'}</span>
          <span class="log-tag" style="background:#00f0ff22;color:#00f0ff;border:1px solid #00f0ff">SCRAMBLE</span>
        </div>
        <div class="log-detail" style="color:#00f0ff">[DISPATCH] Base Camp scrambled ${evt.ids.join(', ')} to target station</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    } else if (evt.type === 'drones_online') {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">${evt.simClock || 'ACTIVE'}</span>
          <span class="log-tag" style="background:#00f0ff22;color:#00f0ff;border:1px solid #00f0ff">AERIAL LOCK</span>
        </div>
        <div class="log-detail" style="color:#00f0ff">[ACTIVE] ${evt.ids.join(', ')} hovering at 80m · RF bridge active</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    } else if (evt.type === 'drones_reposition') {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">${evt.simClock || 'REARRANGE'}</span>
          <span class="log-tag" style="background:#ffb02022;color:#ffb020;border:1px solid #ffb020">FLEET SHIFT</span>
        </div>
        <div class="log-detail" style="color:#ffb020">[OPTIMIZER] ${evt.ids.join(', ')} repositioning to cover priority gap within 6-drone limit</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    } else if (evt.type === 'auto_balloon_relief') {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">AUTO-RELIEF</span>
          <span class="log-tag" style="background:#00e5ff22;color:#00e5ff;border:1px solid #00e5ff">AEROSTAT ANCHOR</span>
        </div>
        <div class="log-detail" style="color:#00e5ff;font-weight:600">[RELIEF] ${evt.message || 'Deployed 100m Balloon to free drone for new mission'}</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    } else if (evt.type === 'balloons_launch') {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">${evt.simClock || 'ASCENT'}</span>
          <span class="log-tag" style="background:#00e5ff22;color:#00e5ff;border:1px solid #00e5ff">BALLOON</span>
        </div>
        <div class="log-detail" style="color:#00e5ff">[BALLOON] ${evt.ids.join(', ')} ascending to 100m tethered altitude</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    } else if (evt.type === 'drones_return') {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">${evt.simClock || 'HANDOVER'}</span>
          <span class="log-tag" style="background:#10b98122;color:#10b981;border:1px solid #10b981">HANDOVER</span>
        </div>
        <div class="log-detail" style="color:#10b981">[HANDOVER] ${evt.ids.join(', ')} station handed over to Aerostat · Drone freed</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    }
  });

  // ─── With / Without Mesh Toggle ────────────────────────────────────────────
  const btnWith    = document.getElementById('btn-with-mesh');
  const btnWithout = document.getElementById('btn-without-mesh');

  function setMeshMode(withMesh) {
    if (btnWith && btnWithout) {
      btnWith.classList.toggle('active', withMesh);
      btnWithout.classList.toggle('active', !withMesh);
    }
    engine.setWithMesh(withMesh);
  }

  if (btnWith && btnWithout) {
    btnWith.addEventListener('click', () => setMeshMode(true));
    btnWithout.addEventListener('click', () => setMeshMode(false));
  }

  // ─── Mode Switcher: Scripted Incident Replay vs Tactical Sandbox ──────────
  let activeMode = 'replay'; // 'replay' | 'sandbox'
  const btnReplay   = document.getElementById('btn-mode-replay');
  const btnSandbox  = document.getElementById('btn-mode-sandbox');
  const sourceBadge = document.getElementById('source-badge');

  function setMode(mode) {
    activeMode = mode;
    const timelineBar = document.getElementById('timeline-bar');
    const sandboxBar  = document.getElementById('sandbox-bar');

    // Complete simulation reset upon changing modes
    if (engine.isPlaying) {
      engine.pause();
    }
    engine.clearDynamicNodes();
    engine.manualKilledNodes.clear();
    engine.manualAerialDeployed.clear();
    engine.seek(0);
    engine.setActiveMode(mode);
    updatePlayBtn();
    setSandboxTool(null);

    if (logFeed) {
      logFeed.innerHTML = `
        <div class="log-item">
          <div class="log-meta">
            <span class="log-time">${mode === 'replay' ? 'REPLAY' : 'SANDBOX'}</span>
            <span class="log-tag state-queued">RESET</span>
          </div>
          <div class="log-detail" style="color:var(--text-secondary)">Simulation reset. Active mode: ${mode === 'replay' ? 'Incident Replay (Kathmandu Flood Timeline)' : 'Tactical Sandbox (Cell Grid Offline · Interactive Tools)'}</div>
        </div>
      `;
    }

    if (mode === 'replay') {
      if (btnReplay)  btnReplay.classList.add('active');
      if (btnSandbox) btnSandbox.classList.remove('active');
      if (timelineBar) timelineBar.classList.remove('hidden');
      if (sandboxBar)  sandboxBar.classList.add('hidden');
      if (sourceBadge) sourceBadge.textContent = 'Scenario';
    } else {
      if (btnReplay)  btnReplay.classList.remove('active');
      if (btnSandbox) btnSandbox.classList.add('active');
      if (timelineBar) timelineBar.classList.add('hidden');
      if (sandboxBar)  sandboxBar.classList.remove('hidden');
      if (sourceBadge) sourceBadge.textContent = 'Sandbox';
    }
    updateFleetStatus();
  }

  if (btnReplay)  btnReplay.addEventListener('click', () => setMode('replay'));
  if (btnSandbox) btnSandbox.addEventListener('click', () => setMode('sandbox'));

  // ─── Sidebar Action Buttons ────────────────────────────────────────────────
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    engine.restart();
    engine.clearDynamicNodes();
    engine.pause();
    updatePlayBtn();
  });

  // ─── Tactical Sandbox Tool State Machine ──────────────────────────────────
  let currentSandboxTool = null; // null | 'drop-survivor' | 'submerge-relay' | 'deploy-drone' | 'deploy-balloon'
  window.currentSandboxTool = null;

  const btnSpawn = document.getElementById('btn-spawn-node');
  const mapElement = document.getElementById('map');

  function setSandboxTool(tool) {
    if (currentSandboxTool === tool) {
      currentSandboxTool = null;
    } else {
      currentSandboxTool = tool;
    }
    window.currentSandboxTool = currentSandboxTool;
    window.setSandboxTool = setSandboxTool;

    const hintEl = document.querySelector('#sandbox-bar .sandbox-hint');
    const toolDefs = [
      { id: 'sb-drop-node', name: 'drop-survivor', label: 'Drop Survivor', hint: 'Click anywhere on map to deploy a stranded survivor node' },
      { id: 'sb-kill-node', name: 'submerge-relay', label: 'Remove Node', hint: 'Click any node on the map (relay, drone, balloon, or survivor) to remove it' },
      { id: 'sb-drone', name: 'deploy-drone', label: 'Deploy Drone', hint: 'Click anywhere on map to dispatch drone from Base Camp' },
      { id: 'sb-balloon', name: 'deploy-balloon', label: 'Deploy Balloon', hint: 'Click anywhere on map to launch 100m aerostat balloon' }
    ];

    toolDefs.forEach(t => {
      const btn = document.getElementById(t.id);
      if (btn) {
        const isActive = currentSandboxTool === t.name;
        btn.classList.toggle('active', isActive);
        btn.textContent = isActive ? `Cancel ${t.label.split(' ')[0]}` : t.label;
      }
    });

    if (btnSpawn) {
      const isDropActive = currentSandboxTool === 'drop-survivor';
      btnSpawn.classList.toggle('active', isDropActive);
      btnSpawn.textContent = isDropActive ? 'Cancel Drop' : 'Drop Survivor Node';
    }

    if (mapElement) {
      if (currentSandboxTool === 'submerge-relay') {
        mapElement.style.cursor = 'pointer';
      } else if (currentSandboxTool) {
        mapElement.style.cursor = 'crosshair';
      } else {
        mapElement.style.cursor = '';
      }
    }

    if (hintEl) {
      const activeDef = toolDefs.find(t => t.name === currentSandboxTool);
      hintEl.textContent = activeDef
        ? activeDef.hint
        : 'Interactive Mode: Select a tactical tool to test dynamic routing';
    }
  }

  if (btnSpawn) {
    btnSpawn.addEventListener('click', () => {
      if (activeMode !== 'sandbox') setMode('sandbox');
      setSandboxTool(currentSandboxTool === 'drop-survivor' ? null : 'drop-survivor');
    });
  }

  // Handle map click for all tactical sandbox tools
  map.on('click', (e) => {
    if (activeMode !== 'sandbox' || !currentSandboxTool) return;
    const { lng, lat } = e.lngLat;

    if (currentSandboxTool === 'drop-survivor') {
      const node = engine.spawnDynamicNode(lng, lat, { role: 'dongle' });
      setSandboxTool(null);

      if (logFeed) {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
          <div class="log-meta">
            <span class="log-time">MANUAL</span>
            <span class="log-tag" style="background:#00f0ff22;color:#00f0ff;border:1px solid #00f0ff">DEPLOY</span>
          </div>
          <div class="log-detail" style="color:#00f0ff">[DEPLOY] Dropped Survivor ${node.id} at (${lat.toFixed(3)}, ${lng.toFixed(3)})</div>
        `;
        logFeed.prepend(item);
      }

      setTimeout(() => {
        nodeLayer.openNodePopup(node.id, [lng, lat]);
      }, 120);

    } else if (currentSandboxTool === 'deploy-drone') {
      const drone = engine.dispatchDroneTo(lng, lat);
      setSandboxTool(null);

      if (logFeed) {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
          <div class="log-meta">
            <span class="log-time">AERIAL</span>
            <span class="log-tag" style="background:#ffb02022;color:#ffb020;border:1px solid #ffb020">DRONE</span>
          </div>
          <div class="log-detail" style="color:#ffb020">[AERIAL] Dispatched ${drone.id} to (${lat.toFixed(3)}, ${lng.toFixed(3)}) at 80m</div>
        `;
        logFeed.prepend(item);
      }

    } else if (currentSandboxTool === 'deploy-balloon') {
      const balloon = engine.dispatchBalloonTo(lng, lat);
      setSandboxTool(null);

      if (logFeed) {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
          <div class="log-meta">
            <span class="log-time">AEROSTAT</span>
            <span class="log-tag" style="background:#2ee66b22;color:#2ee66b;border:1px solid #2ee66b">BALLOON</span>
          </div>
          <div class="log-detail" style="color:#2ee66b">[AEROSTAT] Launched 100m Balloon ${balloon.id} at (${lat.toFixed(3)}, ${lng.toFixed(3)})</div>
        `;
        logFeed.prepend(item);
      }

    } else if (currentSandboxTool === 'submerge-relay') {
      // Find closest online node within 650 meters (relay, dongle, drone, balloon)
      const state = engine.reconstructStateAt(engine.currentTime);
      const onlineNodes = state.nodes.filter(n => n.status === 'online' && n.visible !== false);
      let closest = null;
      let minDist = Infinity;
      onlineNodes.forEach(n => {
        const d = engine.calculateDistanceMeters(lng, lat, n.lon, n.lat);
        if (d < minDist) {
          minDist = d;
          closest = n;
        }
      });
      if (closest && minDist <= 650) {
        engine.submergeRelay(closest.id);
        if (nodeLayer.aerialMarkers?.has(closest.id)) {
          nodeLayer.aerialMarkers.get(closest.id).marker.remove();
          nodeLayer.aerialMarkers.delete(closest.id);
        }
        if (nodeLayer.nodeMarkers?.has(closest.id)) {
          nodeLayer.nodeMarkers.get(closest.id).marker.remove();
          nodeLayer.nodeMarkers.delete(closest.id);
        }
        setSandboxTool(null);
      }
    }
  });

  // ─── Bottom Timeline & Sandbox Bars DOM Injection ─────────────────────────
  injectBottomBars();

  const timelineSlider = document.getElementById('tl-slider');
  const timeClock      = document.getElementById('tl-clock');
  const playBtn        = document.getElementById('tl-play');
  const headerPlayBtn  = document.getElementById('btn-header-play');
  const speedBtns      = document.querySelectorAll('.tl-speed-btn');
  let isScrubbing = false;

  function updatePlayBtn() {
    const isPlaying = engine.isPlaying;
    if (playBtn) playBtn.textContent = isPlaying ? '⏸' : '▶';
    if (headerPlayBtn) {
      headerPlayBtn.classList.toggle('playing', isPlaying);
      const icon = headerPlayBtn.querySelector('.header-play-icon');
      const label = headerPlayBtn.querySelector('.header-play-label');
      if (icon) icon.textContent = isPlaying ? '⏸' : '▶';
      if (label) label.textContent = isPlaying ? 'Pause Simulation' : 'Start Simulation';
    }
  }

  function updateTimeline(state) {
    if (isScrubbing) return;
    const pct = (state.t || 0) / engine.duration;
    if (timelineSlider) timelineSlider.value = Math.round(pct * 1000);
    if (timeClock) timeClock.textContent = state.simClock || `T+${Math.round(state.t || 0)}s`;
  }

  if (timelineSlider) {
    timelineSlider.addEventListener('mousedown', () => { isScrubbing = true; engine.pause(); updatePlayBtn(); });
    timelineSlider.addEventListener('touchstart', () => { isScrubbing = true; engine.pause(); updatePlayBtn(); });
    timelineSlider.addEventListener('input', () => {
      const t = (timelineSlider.value / 1000) * engine.duration;
      engine.seek(t);
    });
    timelineSlider.addEventListener('mouseup',  () => { isScrubbing = false; });
    timelineSlider.addEventListener('touchend', () => { isScrubbing = false; });
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (engine.isPlaying) { engine.pause(); } else { engine.play(); }
      updatePlayBtn();
    });
  }

  if (headerPlayBtn) {
    headerPlayBtn.addEventListener('click', () => {
      if (activeMode === 'sandbox') {
        setMode('replay');
      }
      if (engine.isPlaying) {
        engine.pause();
      } else {
        engine.play();
      }
      updatePlayBtn();
    });
  }

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      engine.setSpeed(parseFloat(btn.dataset.speed));
    });
  });

  // ─── Tactical Sandbox Bar Tool Actions ────────────────────────────────────
  document.getElementById('sb-drop-node')?.addEventListener('click', () => {
    setSandboxTool('drop-survivor');
  });

  document.getElementById('sb-kill-node')?.addEventListener('click', () => {
    setSandboxTool('submerge-relay');
  });

  document.getElementById('sb-drone')?.addEventListener('click', () => {
    setSandboxTool('deploy-drone');
  });

  document.getElementById('sb-balloon')?.addEventListener('click', () => {
    setSandboxTool('deploy-balloon');
  });

  document.getElementById('sb-auto')?.addEventListener('click', () => {
    const res = engine.autoBridgeGaps();
    const hint = document.querySelector('.sandbox-hint');
    if (hint) {
      if (res.needed > 0) {
        hint.textContent = `AI Optimizer (6-Drone Max): ${res.message || 'Optimized mesh topology'}`;
        hint.style.color = '#00f0ff';
      } else {
        hint.textContent = `AI Mesh Optimizer: Mesh fully connected. All live nodes have active routes to Base Camp N8.`;
        hint.style.color = '#10b981';
      }
      setTimeout(() => {
        if (hint) {
          hint.textContent = 'Interactive Mode: Select a tactical tool to test dynamic routing';
          hint.style.color = '';
        }
      }, 5500);
    }
    if (logFeed) {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="log-meta">
          <span class="log-time">OPTIMIZER</span>
          <span class="log-tag" style="background:#00f0ff22;color:#00f0ff;border:1px solid #00f0ff">6-DRONE FLEET</span>
        </div>
        <div class="log-detail" style="color:#00f0ff">${res.message || 'Scanned network topology.'}</div>
      `;
      logFeed.prepend(item);
      while (logFeed.children.length > 8) logFeed.removeChild(logFeed.lastChild);
    }
    updateFleetStatus();
  });

  document.getElementById('sb-reset')?.addEventListener('click', () => {
    engine.restart();
    engine.clearDynamicNodes();
    setSandboxTool(null);
    engine.pause();
    updatePlayBtn();
  });

  // ─── Phase Dots Direct Navigation ──────────────────────────────────────────
  const phaseTimes = { P1: 0, P2: 18, P3: 30, P4: 46, P5: 68 };
  document.querySelectorAll('.tl-phase-dot').forEach(dot => {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = dot.textContent.trim();
      if (phaseTimes[p] !== undefined) {
        engine.seek(phaseTimes[p]);
      }
    });
  });

  // ─── Keyboard Shortcuts (Step 7.4) ────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (activeMode === 'sandbox') setMode('replay');
      if (engine.isPlaying) engine.pause(); else engine.play();
      updatePlayBtn();
    } else if (e.key === 'k' || e.key === 'K') {
      if (activeMode === 'sandbox') {
        setSandboxTool('submerge-relay');
      } else {
        engine.killNextNode();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      engine.restart();
      engine.pause();
      updatePlayBtn();
    } else if (e.key === 'd' || e.key === 'D') {
      // Jump to Drones launch (t=30s in Part 3)
      if (activeMode === 'sandbox') {
        setSandboxTool('deploy-drone');
      } else {
        engine.seek(30);
        engine.play();
      }
      updatePlayBtn();
    } else if (e.key === 'b' || e.key === 'B') {
      // Jump to Balloons rise (t=46s in Part 4)
      if (activeMode === 'sandbox') {
        setSandboxTool('deploy-balloon');
      } else {
        engine.seek(46);
        engine.play();
      }
      updatePlayBtn();
    } else if (e.key === 'm' || e.key === 'M') {
      // Toggle With/Without Mesh
      setMeshMode(!engine.withMesh);
    } else if (e.key === 'f' || e.key === 'F') {
      // Toggle Fullscreen
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    } else if (e.key === 'c' || e.key === 'C' || e.key === 'i' || e.key === 'I') {
      // Toggle Context & Response Plan Modal
      if (modals.contextModal && !modals.contextModal.classList.contains('hidden')) {
        modals.hideContextModal();
      } else {
        modals.showContextModal();
      }
    }
  });

  // ─── Boot ─────────────────────────────────────────────────────────────────
  engine.init(); // seek(0) → emits state_reset
  // Start PAUSED — user or demo-runner presses Play
  updatePlayBtn();

  engine.on('play_state', updatePlayBtn);
});

// ─── Inject Bottom Bars: Incident Timeline & Tactical Sandbox ───────────────
function injectBottomBars() {
  const viewport = document.getElementById('map-viewport');
  if (!viewport) return;

  if (!document.getElementById('timeline-bar')) {
    const bar = document.createElement('div');
    bar.id = 'timeline-bar';
    bar.innerHTML = `
      <div class="tl-left">
        <button id="tl-play" class="tl-play-btn" title="Play / Pause (Space)">▶</button>
        <span id="tl-clock" class="tl-clock">Fri 27 Sep, 22:00</span>
      </div>
      <div class="tl-center">
        <div class="tl-phase-dots">
          <span class="tl-phase-dot" style="left:0%"    title="P1: Baseline Relay Health (t=0s)">P1</span>
          <span class="tl-phase-dot" style="left:18%"   title="P2: Relay Submerged & Route Blocked (t=18s)">P2</span>
          <span class="tl-phase-dot" style="left:30%"   title="P3: Drone Dispatched to Gap (t=30s)">P3</span>
          <span class="tl-phase-dot" style="left:46%"   title="P4: Balloon Handover & Balloon ACK (t=46s)">P4</span>
          <span class="tl-phase-dot" style="left:68%"   title="P5: Mission Verified (t=68s)">P5</span>
        </div>
        <input type="range" id="tl-slider" class="tl-slider" min="0" max="1000" value="0" step="1">
      </div>
      <div class="tl-right">
        <button class="tl-speed-btn" data-speed="0.5">0.5×</button>
        <button class="tl-speed-btn active" data-speed="1" style="opacity:1;font-weight:700">1×</button>
        <button class="tl-speed-btn" data-speed="2">2×</button>
      </div>
    `;
    viewport.appendChild(bar);
  }

  if (!document.getElementById('sandbox-bar')) {
    const sb = document.createElement('div');
    sb.id = 'sandbox-bar';
    sb.className = 'hidden';
    sb.innerHTML = `
      <div class="sandbox-left">
        <span class="sandbox-badge">TACTICAL SANDBOX</span>
        <span class="sandbox-fleet-badge" id="sb-fleet-status" style="margin-left:8px;font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,176,32,0.15);border:1px solid rgba(255,176,32,0.4);color:#ffb020;font-family:monospace;letter-spacing:0.5px;">DRONES: 0/6 · BALLOONS: 0</span>
        <span class="sandbox-hint">Interactive Mode: Select a tactical tool to test dynamic routing</span>
      </div>
      <div class="sandbox-tools">
        <button class="sb-tool-btn" id="sb-drop-node" title="Click anywhere on the map to drop a survivor node">
          Drop Survivor
        </button>
        <button class="sb-tool-btn" id="sb-kill-node" title="Click any node on the map (relay, drone, balloon, or survivor) to remove or submerge it">
          Remove Node
        </button>
        <button class="sb-tool-btn" id="sb-drone" title="Dispatch aerial drone (Fleet limit 6 · Auto-promotes stationed drone to balloon if exceeded)">
          Deploy Drone
        </button>
        <button class="sb-tool-btn" id="sb-balloon" title="Anchor high-altitude 100m aerostat balloon (Unlimited count)">
          Deploy Balloon
        </button>
        <button class="sb-tool-btn" id="sb-auto" title="Run MeshOptimizer to dynamically rearrange drones within 6-drone limit & auto-place relief balloons">
          Auto Gap-Bridge
        </button>
        <button class="sb-tool-btn" id="sb-reset" title="Clear dynamic nodes & reset network">
          Reset Sandbox
        </button>
      </div>
    `;
    viewport.appendChild(sb);
  }
}
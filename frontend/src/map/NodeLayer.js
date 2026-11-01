import scenarioData from '../data/scenario.json';
import { estimateDistanceMeters } from '../config.js';

const getMapLibre = () => window.maplibregl;

export class NodeLayer {
  constructor(map) {
    this.map = map;
    this.scenario = scenarioData;
    this.towerMarkers = new Map();
    this.nodeMarkers = new Map();
    this.aerialMarkers = new Map();
    this.activePopup = null;
    this.selectedNodeId = null;
    this.latestState = null;
  }

  init() {
    this.renderCellTowers();
    this.renderGroundNodes();
    this.renderAerialNodes();
  }

  /**
   * Step 4.1: Render Cell Towers T1, T2, T3
   */
  renderCellTowers() {
    const ML = getMapLibre();
    if (!ML || !this.map) return;

    this.scenario.cellTowers.forEach(tower => {
      const el = document.createElement('div');
      el.className = 'cell-tower-marker online';
      el.id = `tower-${tower.id}`;

      el.innerHTML = `
        <div class="tower-beacon">
          <div class="tower-wave wave-1"></div>
          <div class="tower-wave wave-2"></div>
          <div class="tower-icon-box">
            <svg class="tower-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M4.93 4.93l4.24 4.24M19.07 4.93l-4.24 4.24M2 12h20M4.93 19.07l4.24-4.24M19.07 19.07l-4.24-4.24"/>
            </svg>
            <div class="tower-down-badge">✕</div>
          </div>
        </div>
        <div class="tower-info">
          <div class="tower-name">${tower.name}</div>
          <div class="tower-status online-text">● 4G/LTE Online</div>
        </div>
      `;

      const marker = new ML.Marker({
        element: el,
        anchor: 'center'
      })
        .setLngLat([tower.lon, tower.lat])
        .addTo(this.map);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openNodePopup(tower.id, [tower.lon, tower.lat]);
      });

      this.towerMarkers.set(tower.id, { marker, element: el, data: tower });
    });
  }

  /**
   * Step 4.2: Render Ground Mesh Nodes (N1 - N8)
   */
  renderGroundNodes() {
    const ML = getMapLibre();
    if (!ML || !this.map) return;

    const defaultRssi = {
      N1: -68, N2: -72, N3: -78, N4: -87,
      N5: -82, N6: -76, N7: -70, N8: -69
    };

    const groundNodes = this.scenario.nodes.filter(n => !n.hidden);

    groundNodes.forEach(node => {
      const el = document.createElement('div');
      el.className = `mesh-node-marker role-${node.role} online`;
      el.id = `node-marker-${node.id}`;

      let iconHtml = '';
      if (node.role === 'dongle') {
        iconHtml = `<svg class="node-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      } else if (node.role === 'helper') {
        iconHtml = `<svg class="node-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h6M9 14h6M9 18h6"/></svg>`;
      } else {
        iconHtml = `<svg class="node-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/></svg>`;
      }

      const info = this.getNodeDisplayInfo(node, true, false, false);
      el.title = `${node.id} (${node.label}) · ${node.place}`;

      el.innerHTML = `
        <div class="node-beacon">
          <div class="node-wave wave-1"></div>
          <div class="node-wave wave-2"></div>
          <div class="node-core">
            ${iconHtml}
            <div class="node-down-badge">⚠</div>
          </div>
        </div>
        <div class="node-tag">
          <div class="node-label">${info.primary}</div>
          <div class="node-sub">${info.sub}</div>
        </div>
      `;

      const marker = new ML.Marker({
        element: el,
        anchor: 'center'
      })
        .setLngLat([node.lon, node.lat])
        .addTo(this.map);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.currentSandboxTool === 'submerge-relay') {
          window.engine?.submergeRelay(node.id);
          window.setSandboxTool?.(null);
          return;
        }
        this.openNodePopup(node.id, [node.lon, node.lat]);
      });

      this.nodeMarkers.set(node.id, { marker, element: el, data: node });
    });
  }

  /**
   * Step 4.3: Render Aerial Relays (Drones DR1, DR2 & Tethered Balloons BL1, BL2)
   */
  renderAerialNodes() {
    const ML = getMapLibre();
    if (!ML || !this.map) return;

    this.aerialMarkers = new Map();
    const baseCamp = this.scenario.nodes.find(n => n.id === 'N8');
    const baseCampPos = [baseCamp.lon, baseCamp.lat];

    const aerialNodes = this.scenario.nodes.filter(n => n.role === 'drone' || n.role === 'balloon');

    aerialNodes.forEach(node => {
      const el = document.createElement('div');
      el.className = `aerial-marker role-${node.role}`;
      el.id = `aerial-marker-${node.id}`;
      el.style.display = 'none'; // Hidden until launched

      if (node.role === 'drone') {
        el.innerHTML = `
          <div class="drone-marker-inner">
            <div class="drone-rotor rotor-tl"></div>
            <div class="drone-rotor rotor-tr"></div>
            <div class="drone-rotor rotor-bl"></div>
            <div class="drone-rotor rotor-br"></div>
            <svg class="drone-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M2 12h20M7 7l10 10M17 7L7 17"/>
              <circle cx="12" cy="12" r="3.5" fill="#ffb020"/>
            </svg>
          </div>
          <div class="drone-shadow"></div>
          <div class="node-tag drone-tag">
            <div class="node-label drone-name">${node.id} · 80m</div>
            <div class="node-sub drone-sub">Deploying...</div>
          </div>
        `;
      } else {
        // Tethered Balloon
        el.innerHTML = `
          <div class="balloon-container">
            <div class="balloon-aerostat">
              <svg class="balloon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M12 2a7 7 0 0 0-7 7c0 4.5 5 10 7 11 2-1 7-6.5 7-11a7 7 0 0 0-7-7z" fill="rgba(0, 229, 255, 0.25)"/>
                <circle cx="12" cy="9" r="2.5" fill="#00e5ff"/>
              </svg>
            </div>
            <div class="balloon-tether"></div>
            <div class="balloon-ground-anchor"></div>
          </div>
          <div class="node-tag balloon-tag">
            <div class="node-label balloon-name">${node.id} · 100m</div>
            <div class="node-sub balloon-sub">Rising...</div>
          </div>
        `;
      }

      const marker = new ML.Marker({
        element: el,
        anchor: 'center'
      })
        .setLngLat([node.lon, node.lat])
        .addTo(this.map);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.currentSandboxTool === 'submerge-relay') {
          window.engine?.submergeRelay(node.id);
          window.setSandboxTool?.(null);
          return;
        }
        const currentLngLat = marker.getLngLat();
        this.openNodePopup(node.id, [currentLngLat.lng, currentLngLat.lat]);
      });

      this.aerialMarkers.set(node.id, {
        marker,
        element: el,
        data: node,
        basePos: baseCampPos,
        targetPos: [node.lon, node.lat]
      });
    });
  }

  /**
   * Synchronize tower and node visual states with ScenarioEngine tick snapshot
   */
  update(state) {
    if (!state) return;

    // 1. Update Cell Towers (Online at t < 6s, Down at t >= 6s)
    const towersOnline = state.towersOnline;
    this.towerMarkers.forEach(({ element }) => {
      if (towersOnline) {
        if (!element.classList.contains('online')) {
          element.classList.remove('offline');
          element.classList.add('online');
          const statusText = element.querySelector('.tower-status');
          if (statusText) {
            statusText.textContent = '● 4G/LTE Online';
            statusText.className = 'tower-status online-text';
          }
        }
      } else {
        if (!element.classList.contains('offline')) {
          element.classList.remove('online');
          element.classList.add('offline');
          const statusText = element.querySelector('.tower-status');
          if (statusText) {
            statusText.textContent = '✕ OFFLINE (Power cut)';
            statusText.className = 'tower-status offline-text';
          }
        }
      }
    });

    // 2. Update Ground Nodes (N1 - N8 + Dynamic Nodes) & Store-and-Forward on N2/N5
    if (state.nodes) {
      // Clean up deleted dynamic ground markers (exclude aerials)
      const currentActiveIds = new Set(state.nodes.filter(n => n.role !== 'drone' && n.role !== 'balloon').map(n => n.id));
      this.nodeMarkers.forEach((markerObj, id) => {
        if (markerObj.data.isDynamic && !currentActiveIds.has(id)) {
          markerObj.marker.remove();
          this.nodeMarkers.delete(id);
        }
      });

      state.nodes.forEach(nodeState => {
        // Skip aerial relays (they are managed in Section 3)
        if (nodeState.role === 'drone' || nodeState.role === 'balloon') return;

        let markerObj = this.nodeMarkers.get(nodeState.id);
        if (!markerObj) {
          if (nodeState.isDynamic) {
            markerObj = this.renderDynamicNodeMarker(nodeState);
          } else {
            return;
          }
        }

        const { element, data } = markerObj;
        const isOnline = nodeState.status === 'online';
        const isAck = Boolean(nodeState.isAcknowledged);
        // Fix: isHoldingSos is true ONLY for the node that is actually storing the message (e.g. N2 flash or isolated dynamic node)
        const isHoldingSos = Boolean(nodeState.storedInFlash) || state.sosStates?.some(
          s => (s.storedAtNode ? s.storedAtNode === nodeState.id : (s.from === nodeState.id && !s.storedAtNode)) && s.state === 'STORED'
        );

        const labelEl = element.querySelector('.node-label');
        const subEl = element.querySelector('.node-sub');

        element.classList.remove('down', 'waiting-for-mesh', 'acknowledged');

        if (isAck) {
          element.classList.add('online', 'acknowledged');
          if (labelEl) labelEl.textContent = data.role === 'dongle' || data.isDynamic ? `SURVIVOR · ${data.id}` : data.id;
          if (subEl) subEl.innerHTML = `<span style="color:#10b981;font-weight:700">RESCUE CONFIRMED</span>`;
        } else if (isHoldingSos) {
          element.classList.add('online', 'waiting-for-mesh');
          if (labelEl) labelEl.textContent = `${nodeState.id} · STORED IN FLASH`;
          if (subEl) subEl.innerHTML = `<span class="stored-text">Holding SOS · Awaiting aerial bridge</span>`;
        } else if (isOnline) {
          element.classList.add('online');
          const info = this.getNodeDisplayInfo(data, true, false, false);
          if (labelEl) labelEl.textContent = info.primary;
          if (subEl) subEl.textContent = info.sub;
        } else {
          element.classList.add('down');
          if (labelEl) labelEl.textContent = `${data.id} DOWN`;
          if (subEl) subEl.innerHTML = `<span class="down-text">Submerged in flood</span>`;
        }
      });
    }

    // 3. Update Aerial Relays (DR1, DR2 Drones & BL1, BL2 Balloons + Dynamic Aerials)
    if (state.nodes) {
      // Clean up recalled/deleted dynamic aerial markers
      const currentActiveIds = new Set(state.nodes.map(n => n.id));
      this.aerialMarkers.forEach((markerObj, id) => {
        const nodeState = state.nodes.find(n => n.id === id);
        if (!currentActiveIds.has(id)) {
          markerObj.marker.remove();
          this.aerialMarkers.delete(id);
        } else if (nodeState && (nodeState.status === 'down' || nodeState.visible === false)) {
          markerObj.element.style.display = 'none';
          if (markerObj.data?.isDynamic || id.startsWith('DR-') || id.startsWith('BL-')) {
            markerObj.marker.remove();
            this.aerialMarkers.delete(id);
          }
        }
      });

      const allAerials = state.nodes.filter(n => n.role === 'drone' || n.role === 'balloon');
      allAerials.forEach(nodeState => {
        let markerObj = this.aerialMarkers.get(nodeState.id);
        if (!markerObj) {
          markerObj = this.renderDynamicAerialMarker(nodeState);
        }
        if (!markerObj) return;

        if (nodeState.basePos) markerObj.basePos = nodeState.basePos;
        if (nodeState.targetPos) markerObj.targetPos = nodeState.targetPos;

        const { marker, element, data, basePos, targetPos } = markerObj;
        const isVisible = nodeState.visible && nodeState.flightProgress > 0 && nodeState.status !== 'down';

        if (isVisible) {
          element.style.display = 'flex';
          const p = nodeState.flightProgress;

          if (data.role === 'drone') {
            // Smooth geographic arc from Base Camp N8 to target station
            const curLon = basePos[0] + p * (targetPos[0] - basePos[0]);
            const curLat = basePos[1] + p * (targetPos[1] - basePos[1]);
            marker.setLngLat([curLon, curLat]);

            const subEl = element.querySelector('.drone-sub');
            if (nodeState.batteryStatus && nodeState.batteryStatus.includes('LOW')) {
              element.classList.add('battery-low');
              if (subEl) subEl.textContent = '⚠ Low battery · Returning';
            } else {
              element.classList.remove('battery-low');
              if (subEl) subEl.textContent = p < 1 ? 'Deploying to station...' : 'Agile aerial relay';
            }
          } else if (data.role === 'balloon') {
            // Tethered balloon rises vertically over target anchor
            marker.setLngLat(targetPos);
            const aerostatEl = element.querySelector('.balloon-aerostat');
            const tetherEl = element.querySelector('.balloon-tether');
            const liftPx = Math.round(p * 46); // 0 to 46px lift
            if (aerostatEl) aerostatEl.style.transform = `translateY(-${liftPx}px)`;
            if (tetherEl) tetherEl.style.height = `${liftPx}px`;

            const subEl = element.querySelector('.balloon-sub');
            if (subEl) subEl.textContent = p < 1 ? `Ascending (${Math.round(p * 100)}m)...` : '100m tethered aerostat';
          }
        } else {
          element.style.display = 'none';
        }
      });
    }

    this.latestState = state;

    // Refresh active popup if currently open during playback
    if (this.activePopup && this.selectedNodeId) {
      const container = this.activePopup.getElement().querySelector('.tactical-popup-container');
      if (container) {
        container.innerHTML = this.buildPopupHtml(this.selectedNodeId);
      }
    }
  }

  /**
   * Helper to resolve clean tactical label and subtext for any node
   */
  getNodeDisplayInfo(node, isOnline = true, isHoldingSos = false, isAck = false) {
    const defaultRssi = {
      N1: -68, N2: -72, N3: -78, N4: -87,
      N5: -82, N6: -76, N7: -70, N8: -69
    };
    const rssi = defaultRssi[node.id] || -75;

    if (node.role === 'drone') {
      return {
        primary: `🚁 DRONE · ${node.id}`,
        sub: '80m Agile Aerial Relay',
        roleClass: 'role-drone'
      };
    }

    if (node.role === 'balloon') {
      return {
        primary: `🎈 BALLOON · ${node.id}`,
        sub: '100m Tethered Aerostat',
        roleClass: 'role-balloon'
      };
    }

    if (node.role === 'helper') {
      return {
        primary: '🟢 BASE CAMP · N8',
        sub: 'Rescue Command HQ',
        roleClass: 'role-helper'
      };
    }

    if (node.role === 'dongle' || (node.isDynamic && node.role !== 'relay')) {
      const primary = `🔴 SURVIVOR · ${node.id}`;
      let sub = node.sublabel || (node.isDynamic ? 'Live Survivor' : 'Balkhu Rooftop');
      if (isAck) {
        sub = '✅ Rescue Confirmed!';
      } else if (isHoldingSos) {
        sub = '⏳ Stored in Flash (Retrying)';
      } else if (!isOnline) {
        sub = '⚠ Disconnected';
      }
      return { primary, sub, roleClass: 'role-dongle' };
    }

    if (node.role === 'relay') {
      const primary = `🔵 RELAY · ${node.id}`;
      let sub = `${node.sublabel || node.place?.split(' ')?.[0] || 'Community'} · ${rssi} dBm`;
      if (!isOnline) {
        sub = '⚠ Flooded (Down)';
      } else if (isHoldingSos) {
        sub = '⏳ Stored · Waiting Link';
      }
      return { primary, sub, roleClass: 'role-relay' };
    }

    return {
      primary: node.id,
      sub: `${rssi} dBm`,
      roleClass: 'role-relay'
    };
  }

  /**
   * Render dynamic node marker on map
   */
  renderDynamicNodeMarker(node) {
    const ML = getMapLibre();
    if (!ML || !this.map) return null;

    const el = document.createElement('div');
    el.className = `mesh-node-marker role-dongle dynamic-node online`;
    el.id = `node-marker-${node.id}`;

    const iconHtml = `<svg class="node-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    el.title = `${node.id} · Stranded Survivor (Live Beacon)`;

    el.innerHTML = `
      <div class="node-beacon">
        <div class="node-wave wave-1"></div>
        <div class="node-wave wave-2"></div>
        <div class="node-core">
          ${iconHtml}
          <div class="node-down-badge">⚠</div>
        </div>
      </div>
      <div class="node-tag">
        <div class="node-label">🔴 SURVIVOR · ${node.id}</div>
        <div class="node-sub">Live Distress Beacon</div>
      </div>
    `;

    const marker = new ML.Marker({
      element: el,
      anchor: 'center'
    })
      .setLngLat([node.lon, node.lat])
      .addTo(this.map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.currentSandboxTool === 'submerge-relay') {
        window.engine?.submergeRelay(node.id);
        window.setSandboxTool?.(null);
        return;
      }
      this.openNodePopup(node.id, [node.lon, node.lat]);
    });

    const markerObj = { marker, element: el, data: node };
    this.nodeMarkers.set(node.id, markerObj);
    return markerObj;
  }

  /**
   * Render dynamic aerial marker on map (Drones & Balloons)
   */
  renderDynamicAerialMarker(node) {
    const ML = getMapLibre();
    if (!ML || !this.map) return null;

    const baseCamp = this.scenario.nodes.find(n => n.id === 'N8') || { lon: 85.3160, lat: 27.7020 };
    const basePos = node.basePos || [baseCamp.lon, baseCamp.lat];
    const targetPos = node.targetPos || [node.lon, node.lat];

    const el = document.createElement('div');
    el.className = `aerial-marker role-${node.role}`;
    el.id = `aerial-marker-${node.id}`;

    if (node.role === 'drone') {
      el.innerHTML = `
        <div class="drone-marker-inner">
          <div class="drone-rotor rotor-tl"></div>
          <div class="drone-rotor rotor-tr"></div>
          <div class="drone-rotor rotor-bl"></div>
          <div class="drone-rotor rotor-br"></div>
          <svg class="drone-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v20M2 12h20M7 7l10 10M17 7L7 17"/>
            <circle cx="12" cy="12" r="3.5" fill="#ffb020"/>
          </svg>
        </div>
        <div class="drone-shadow"></div>
        <div class="node-tag drone-tag">
          <div class="node-label drone-name">${node.id} · 80m</div>
          <div class="node-sub drone-sub">Airborne Relay</div>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="balloon-container">
          <div class="balloon-aerostat">
            <svg class="balloon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M12 2a7 7 0 0 0-7 7c0 4.5 5 10 7 11 2-1 7-6.5 7-11a7 7 0 0 0-7-7z" fill="rgba(0, 229, 255, 0.25)"/>
              <circle cx="12" cy="9" r="2.5" fill="#00e5ff"/>
            </svg>
          </div>
          <div class="balloon-tether"></div>
          <div class="balloon-ground-anchor"></div>
        </div>
        <div class="node-tag balloon-tag">
          <div class="node-label balloon-name">${node.id} · 100m</div>
          <div class="node-sub balloon-sub">100m Aerostat</div>
        </div>
      `;
    }

    const marker = new ML.Marker({
      element: el,
      anchor: 'center'
    })
      .setLngLat(targetPos)
      .addTo(this.map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.currentSandboxTool === 'submerge-relay') {
        window.engine?.submergeRelay(node.id);
        marker.remove();
        this.aerialMarkers.delete(node.id);
        window.setSandboxTool?.(null);
        return;
      }
      const currentLngLat = marker.getLngLat();
      this.openNodePopup(node.id, [currentLngLat.lng, currentLngLat.lat]);
    });

    const markerObj = {
      marker,
      element: el,
      data: node,
      basePos,
      targetPos
    };
    this.aerialMarkers.set(node.id, markerObj);
    return markerObj;
  }

  /**
   * Step 4.4: Open tactical inspection popover on node click
   */
  openNodePopup(nodeId, lngLat) {
    const ML = getMapLibre();
    if (!ML || !this.map) return;

    if (this.activePopup) {
      this.activePopup.remove();
    }

    this.selectedNodeId = nodeId;

    const popupContent = document.createElement('div');
    popupContent.className = 'tactical-popup-container';
    popupContent.innerHTML = this.buildPopupHtml(nodeId);

    // Dynamic Live LoRa Packet updates
    const activeObj = this.latestState?.nodes?.find(n => n.id === nodeId) || this.scenario.nodes.find(n => n.id === nodeId);
    const nodeLat = activeObj ? (activeObj.lat ?? 27.680000) : 27.680000;
    const nodeLon = activeObj ? (activeObj.lon ?? 85.320000) : 85.320000;
    const cleanSrc = (nodeId.startsWith('0x') ? nodeId.slice(2) : nodeId).toLowerCase();

    const getFormValues = () => {
      const ppl = parseInt(popupContent.querySelector('#input-sos-ppl')?.value || '1', 10);
      const trapped = popupContent.querySelector('#chk-flag-trapped')?.checked ? 1 : 0;
      const injured = popupContent.querySelector('#chk-flag-injured')?.checked ? 2 : 0;
      const fire = popupContent.querySelector('#chk-flag-fire')?.checked ? 4 : 0;
      const flood = popupContent.querySelector('#chk-flag-flood')?.checked ? 8 : 0;
      const food = popupContent.querySelector('#chk-flag-food')?.checked ? 16 : 0;
      const flg = trapped | injured | fire | flood | food;
      const msg = popupContent.querySelector('#input-sos-msg')?.value.trim() || ('EMERGENCY at ' + nodeId);
      return { ppl, flg, msg, trapped, injured, fire, flood, food };
    };

    const updatePreview = () => {
      const { ppl, flg } = getFormValues();
      const previewEl = popupContent.querySelector('#lora-frame-preview');
      if (previewEl) {
        const payload = {
          t: 'DATA',
          src: cleanSrc,
          mid: 16,
          dst: '0001',
          nh: '0001',
          ttl: 10,
          ppl,
          flg,
          lat: Number(Number(nodeLat).toFixed(6)),
          lon: Number(Number(nodeLon).toFixed(6)),
          alt: 1300,
          acc: 10,
          ts: Math.floor(Date.now() / 1000),
          path: [cleanSrc]
        };
        previewEl.textContent = JSON.stringify(payload);
      }
    };

    const pplInput = popupContent.querySelector('#input-sos-ppl');
    const msgInput = popupContent.querySelector('#input-sos-msg');
    const checkboxes = popupContent.querySelectorAll('.chk-lora-flag');
    pplInput?.addEventListener('input', updatePreview);
    msgInput?.addEventListener('input', updatePreview);
    checkboxes.forEach(cb => cb.addEventListener('change', updatePreview));

    popupContent.addEventListener('click', (e) => {
      if (e.target.closest('.popup-close-btn')) {
        this.activePopup?.remove();
        this.activePopup = null;
        this.selectedNodeId = null;
      }
      if (e.target.closest('#btn-dyn-send-sos')) {
        const btn = popupContent.querySelector('#btn-dyn-send-sos');
        const { ppl, flg, msg, injured } = getFormValues();
        if (btn) {
          btn.innerHTML = '📡 TRANSMITTING...';
          btn.style.opacity = '0.7';
          btn.disabled = true;
        }

        if (window.engine) {
          window.engine.sendDynamicSos(nodeId, msg, {
            people: ppl,
            flg: flg,
            need: injured ? 'MEDICAL' : 'RESCUE'
          });
        }

        const mid = Math.floor(Math.random() * 900) + 10;
        const ts = Math.floor(Date.now() / 1000);
        const packetPayload = {
          t: 'DATA',
          src: cleanSrc,
          mid: mid,
          dst: '0001',
          nh: '0001',
          ttl: 10,
          ppl: ppl,
          flg: flg,
          lat: Number(Number(nodeLat).toFixed(6)),
          lon: Number(Number(nodeLon).toFixed(6)),
          alt: 1300.0,
          acc: 10.0,
          ts: ts,
          path: [cleanSrc]
        };

        if (window.telemetryBridge) {
          window.telemetryBridge.injectCustomPacket(packetPayload)
            .then(res => {
              if (btn) {
                btn.innerHTML = '✓ AI TRIAGED';
                btn.style.background = '#10b981';
                btn.style.opacity = '1';
                btn.disabled = false;
              }
            })
            .catch(() => {
              if (btn) {
                btn.innerHTML = '✓ TRANSMITTED';
                btn.style.background = '#10b981';
                btn.style.opacity = '1';
                btn.disabled = false;
              }
            });
        } else {
          if (btn) {
            btn.innerHTML = '✓ TRANSMITTED';
            btn.style.background = '#10b981';
            btn.style.opacity = '1';
            btn.disabled = false;
          }
        }
      }
      if (e.target.closest('#btn-dyn-remove') || e.target.closest('#btn-aerial-remove')) {
        if (window.engine) {
          window.engine.submergeRelay(nodeId);
          window.engine.removeDynamicNode(nodeId);
        }
        if (this.nodeMarkers.has(nodeId)) {
          this.nodeMarkers.get(nodeId).marker.remove();
          this.nodeMarkers.delete(nodeId);
        }
        if (this.aerialMarkers.has(nodeId)) {
          this.aerialMarkers.get(nodeId).marker.remove();
          this.aerialMarkers.delete(nodeId);
        }
        this.activePopup?.remove();
        this.activePopup = null;
        this.selectedNodeId = null;
      }
    });

    // Smart anchor & auto-pan: Ensure popup opens fully inside viewport
    const point = this.map.project(lngLat);
    const containerHeight = this.map.getContainer().clientHeight;
    // If node is in lower 60% of viewport, anchor to bottom so popup extends UPWARD into open map space
    const preferredAnchor = point.y > containerHeight * 0.4 ? 'bottom' : 'top';

    // Smoothly pan map to center the popup comfortably away from top header and bottom sandbox bar
    this.map.easeTo({
      center: lngLat,
      offset: preferredAnchor === 'bottom' ? [0, 110] : [0, -90],
      duration: 350
    });

    this.activePopup = new ML.Popup({
      offset: 18,
      anchor: preferredAnchor,
      closeButton: false,
      closeOnClick: true,
      className: 'tactical-map-popup'
    })
      .setLngLat(lngLat)
      .setDOMContent(popupContent)
      .addTo(this.map);

    this.activePopup.on('close', () => {
      this.activePopup = null;
      this.selectedNodeId = null;
    });
  }

  buildPopupHtml(nodeId) {
    // 1. Check if Cell Tower
    const tower = this.scenario.cellTowers.find(t => t.id === nodeId);
    if (tower) {
      const isOnline = this.latestState ? this.latestState.towersOnline : true;
      return `
        <div class="popup-header">
          <div class="popup-badge badge-tower">CELL TOWER</div>
          <div class="popup-title">${tower.name}</div>
          <button class="popup-close-btn" title="Close">✕</button>
        </div>
        <div class="popup-body">
          <div class="popup-row">
            <span class="popup-label">COORDINATES</span>
            <span class="popup-val">${tower.lat.toFixed(4)}° N, ${tower.lon.toFixed(4)}° E</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">NETWORK STATUS</span>
            <span class="popup-val ${isOnline ? 'val-online' : 'val-down'}">${isOnline ? '● 4G/LTE Active' : '✕ OFFLINE (Power & Fiber Severed)'}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">INFRASTRUCTURE</span>
            <span class="popup-val">Macro Cellular Base Station</span>
          </div>
          <div class="popup-notice ${isOnline ? 'notice-info' : 'notice-alert'}">
            ${isOnline ? 'Serving standard civilian smartphones. Vulnerable to flood-induced power cuts.' : 'Flooding severed municipal power grid and terrestrial fiber backhaul.'}
          </div>
        </div>
      `;
    }

    // Dynamic Aerial Drone or Balloon
    const dynamicAerial = this.latestState?.nodes?.find(n => n.id === nodeId && (n.role === 'drone' || n.role === 'balloon'));
    if (dynamicAerial) {
      const isDrone = dynamicAerial.role === 'drone';
      const badgeText = isDrone ? 'AERIAL DRONE (80m)' : 'AEROSTAT BALLOON (100m)';
      const badgeClass = isDrone ? 'badge-drone' : 'badge-balloon';
      const edges = (this.latestState?.edges || []).filter(e => e.a === nodeId || e.b === nodeId);
      const peersText = edges.length > 0
        ? edges.map(e => e.a === nodeId ? e.b : e.a).join(', ')
        : 'None (searching)';

      return `
        <div class="popup-header">
          <div class="popup-badge ${badgeClass}">${badgeText}</div>
          <div class="popup-title">${dynamicAerial.label || dynamicAerial.id}</div>
          <button class="popup-close-btn" title="Close">✕</button>
        </div>
        <div class="popup-body">
          <div class="popup-row">
            <span class="popup-label">ALTITUDE</span>
            <span class="popup-val" style="color:#ffb020;font-weight:700;">${isDrone ? '80m Hover' : '100m Tethered'}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">COORDINATES</span>
            <span class="popup-val">${dynamicAerial.lat.toFixed(4)}° N, ${dynamicAerial.lon.toFixed(4)}° E</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">RF BRIDGED PEERS</span>
            <span class="popup-val" style="color:#00f0ff;font-weight:700;">${peersText}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">STATUS</span>
            <span class="popup-val val-online">● Airborne Relay Active</span>
          </div>
          <div class="popup-notice notice-info" style="margin-top:8px;font-size:11px;">
            ${isDrone ? 'Agile RF bridge forming LoRa mesh links across flooded sectors.' : 'Persistent elevated aerostat relay overcoming urban terrain shadowing.'}
          </div>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
            <button id="btn-dyn-remove" style="background:#ef4444;color:white;border:none;padding:7px 10px;border-radius:4px;font-weight:700;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;gap:6px;">
              ✕ ${isDrone ? 'Recall & Remove Drone' : 'Deflate & Remove Balloon'}
            </button>
          </div>
        </div>
      `;
    }

    // Survivor Node (Dynamic Survivor OR N1/Dongle)
    const dynamicNode = this.latestState?.nodes?.find(n => n.id === nodeId && n.isDynamic);
    const staticNode = this.scenario.nodes.find(n => n.id === nodeId);
    const isSurvivorDongle = Boolean(dynamicNode || (staticNode && staticNode.role === 'dongle'));

    if (isSurvivorDongle) {
      const activeObj = dynamicNode || staticNode;
      const path = window.engine ? window.engine.findShortestPath(nodeId, 'N8', this.latestState) : null;
      const pathText = path ? path.join(' ➔ ') : 'NO ROUTE (Stored in Flash)';
      const hopsCount = path ? `${path.length - 1} hops` : 'ISOLATED';
      const isAck = Boolean(dynamicNode?.isAcknowledged || this.latestState?.sosStates?.some(s => s.from === nodeId && s.state === 'ACKNOWLEDGED'));

      const cleanSrc = (nodeId.startsWith('0x') ? nodeId.slice(2) : nodeId).toLowerCase();
      const defaultPeople = dynamicNode?.people || 25;
      const defaultMsg = dynamicNode?.label 
        ? `${dynamicNode.label}: Flood water rising. Need urgent evacuation.` 
        : `BALKHU ROOFTOP: 25 people sheltering. Injured present, water depleted.`;
      const lat = activeObj.lat ?? 27.680000;
      const lon = activeObj.lon ?? 85.320000;
      const defaultFlg = 18; // 2 (injured) | 16 (water/food)

      return `
        <div class="popup-header">
          <div class="popup-badge" style="background:rgba(239,68,68,0.25);color:#ef4444;border:1px solid #ef4444">SURVIVOR DONGLE</div>
          <div class="popup-title">${activeObj.label || activeObj.id}</div>
          <button class="popup-close-btn" title="Close">✕</button>
        </div>
        <div class="popup-body">
          <!-- Compact Status Bar -->
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(15,23,42,0.6);padding:4px 8px;border-radius:4px;border:1px solid #1e293b;font-size:10px;">
            <span style="color:${isAck ? '#10b981' : '#ef4444'};font-weight:700;">
              ${isAck ? '● ACK CONFIRMED' : '● DISTRESS ACTIVE'}
            </span>
            <span style="color:#00f0ff;font-weight:700;">${hopsCount}</span>
            <span style="color:#94a3b8;font-family:monospace;font-size:9px;">${Number(lat).toFixed(4)}°, ${Number(lon).toFixed(4)}°</span>
          </div>

          <div style="font-size:10px;color:#38bdf8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${pathText}">
            <span style="color:#64748b;">Route:</span> ${pathText}
          </div>

          <!-- Packet Constructor -->
          <div style="display:flex;flex-direction:column;gap:5px;background:rgba(10,16,28,0.85);padding:6px 8px;border-radius:6px;border:1px solid #334155;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:10px;font-weight:700;color:#38bdf8;">LORA PACKET PARAMS</span>
              <div style="display:flex;align-items:center;gap:4px;">
                <label style="font-size:10px;color:#94a3b8;">ppl:</label>
                <input id="input-sos-ppl" type="number" min="1" max="999" value="${defaultPeople}" style="width:50px;background:#1e293b;border:1px solid #475569;color:#f8fafc;padding:2px 4px;border-radius:4px;font-size:11px;font-weight:700;text-align:right;" />
              </div>
            </div>

            <!-- Bitmask checkboxes -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:10px;">
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#fca5a5;">
                <input type="checkbox" id="chk-flag-injured" class="chk-lora-flag" checked style="cursor:pointer;" /> 🩹 Injured (+2)
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#fed7aa;">
                <input type="checkbox" id="chk-flag-trapped" class="chk-lora-flag" style="cursor:pointer;" /> ⛓️ Trapped (+1)
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#93c5fd;">
                <input type="checkbox" id="chk-flag-food" class="chk-lora-flag" checked style="cursor:pointer;" /> 🥫 Water/Food (+16)
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#67e8f9;">
                <input type="checkbox" id="chk-flag-flood" class="chk-lora-flag" style="cursor:pointer;" /> 🌊 Flood (+8)
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#fde047;">
                <input type="checkbox" id="chk-flag-fire" class="chk-lora-flag" style="cursor:pointer;" /> 🔥 Fire (+4)
              </label>
            </div>

            <!-- Distress Message -->
            <input id="input-sos-msg" type="text" value="${defaultMsg}" style="background:#1e293b;border:1px solid #475569;color:#e2e8f0;padding:3px 6px;border-radius:4px;font-size:10px;font-family:inherit;width:100%;box-sizing:border-box;" placeholder="Distress message..." />

            <!-- Frame preview -->
            <div id="lora-frame-preview" style="font-family:monospace;font-size:9px;color:#a5f3fc;background:#050913;padding:4px;border-radius:4px;word-break:break-all;line-height:1.2;max-height:48px;overflow-y:auto;border:1px solid #1e293b;">
              {"t":"DATA","src":"${cleanSrc}","mid":16,"dst":"0001","nh":"0001","ttl":10,"ppl":${defaultPeople},"flg":${defaultFlg},"lat":${Number(lat).toFixed(6)},"lon":${Number(lon).toFixed(6)},"alt":1300,"acc":10,"ts":${Math.floor(Date.now()/1000)},"path":["${cleanSrc}"]}
            </div>
          </div>

          <!-- Action Buttons Bar (Always completely visible!) -->
          <div style="margin-top:6px;display:flex;gap:6px;">
            <button id="btn-dyn-send-sos" style="flex:1;background:linear-gradient(135deg, #ef4444, #dc2626);color:white;border:none;padding:7px 10px;border-radius:4px;font-weight:700;cursor:pointer;font-size:11px;letter-spacing:0.5px;box-shadow:0 0 10px rgba(239,68,68,0.35);display:flex;align-items:center;justify-content:center;gap:4px;">
              🚨 TRANSMIT SOS
            </button>
            ${dynamicNode || window.engine?.activeMode === 'sandbox' ? `
              <button id="btn-dyn-remove" style="background:rgba(239,68,68,0.18);color:#fca5a5;border:1px solid #ef4444;padding:7px 10px;border-radius:4px;font-weight:700;cursor:pointer;font-size:11px;white-space:nowrap;display:flex;align-items:center;gap:4px;" title="Remove this survivor node from the map">
                ✕ Remove
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }

    // 2. Mesh Node or Aerial Relay
    const node = this.scenario.nodes.find(n => n.id === nodeId);
    if (!node) return '<div class="popup-body">Node not found</div>';

    const nodeState = this.latestState?.nodes?.find(n => n.id === nodeId);
    const isOnline = nodeState ? nodeState.status === 'online' : true;
    const isHoldingSos = this.latestState?.sosStates?.some(s => s.from === nodeId && s.state === 'STORED');
    const isLowBattery = nodeState?.batteryStatus?.includes('LOW');

    // Role badge
    let badgeClass = 'badge-relay';
    let badgeText = 'RELAY';
    if (node.role === 'dongle') { badgeClass = 'badge-dongle'; badgeText = 'DONGLE (SURVIVOR)'; }
    else if (node.role === 'helper') { badgeClass = 'badge-helper'; badgeText = 'BASE CAMP (HQ)'; }
    else if (node.role === 'drone') { badgeClass = 'badge-drone'; badgeText = 'AERIAL DRONE (80m)'; }
    else if (node.role === 'balloon') { badgeClass = 'badge-balloon'; badgeText = 'AEROSTAT BALLOON (100m)'; }

    // Status text
    let statusText = '● Online (433 MHz SF10)';
    let statusClass = 'val-online';
    if (isHoldingSos) {
      statusText = '⏳ STORED IN DONGLE (Waiting for mesh)';
      statusClass = 'val-stored';
    } else if (!isOnline) {
      statusText = '⚠ NODE DOWN (Submerged in Flood)';
      statusClass = 'val-down';
    } else if (isLowBattery) {
      statusText = '⚠ Low Battery · Returning to Base';
      statusClass = 'val-warn';
    }

    // Connected RF neighbors
    const edges = this.scenario.edges.filter(e => e.a === nodeId || e.b === nodeId);
    const isElevated = node.role === 'drone' || node.role === 'balloon';

    const peersHtml = edges.map(edge => {
      const peerId = edge.a === nodeId ? edge.b : edge.a;
      const peerNode = this.scenario.nodes.find(n => n.id === peerId);
      const isPeerElevated = peerNode?.role === 'drone' || peerNode?.role === 'balloon';
      const dist = estimateDistanceMeters(edge.rssi_dbm, isElevated || isPeerElevated);

      let rssiClass = 'rssi-strong';
      if (edge.rssi_dbm < -100) rssiClass = 'rssi-weak';
      else if (edge.rssi_dbm < -80) rssiClass = 'rssi-medium';

      return `
        <div class="popup-peer-item">
          <span class="peer-id">➔ ${peerId} (${peerNode?.label || 'Peer'})</span>
          <span class="peer-dist">~${dist}m est.</span>
          <span class="peer-rssi ${rssiClass}">${edge.rssi_dbm} dBm</span>
        </div>
      `;
    }).join('') || '<div class="popup-no-peers">No peer links configured</div>';

    return `
      <div class="popup-header">
        <div class="popup-badge ${badgeClass}">${badgeText}</div>
        <div class="popup-title">${node.id} · ${node.label}</div>
        <button class="popup-close-btn" title="Close">✕</button>
      </div>
      <div class="popup-body">
        <div class="popup-row">
          <span class="popup-label">LOCATION</span>
          <span class="popup-val">${node.place || 'Patrol Sector'}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">COORDINATES</span>
          <span class="popup-val">${node.lat.toFixed(4)}° N, ${node.lon.toFixed(4)}° E · Alt: ${node.alt_m}m</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">OPERATIONAL STATUS</span>
          <span class="popup-val ${statusClass}">${statusText}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">HARDWARE SPECS</span>
          <span class="popup-val">ESP32-C3 · SX1278 @ 433MHz · SF10 / 125kHz</span>
        </div>
        <div class="popup-divider"></div>
        <div class="popup-section-title">CALIBRATED RF NEIGHBORS (${edges.length})</div>
        <div class="popup-peers-list">
          ${peersHtml}
        </div>
        ${window.engine?.activeMode === 'sandbox' && node.id !== 'N8' ? `
          <div style="margin-top:10px;">
            <button id="btn-dyn-remove" style="width:100%;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;padding:6px 10px;border-radius:4px;font-weight:600;cursor:pointer;font-size:11px;">
              ✕ ${node.role === 'drone' ? 'Recall & Remove Drone' : node.role === 'balloon' ? 'Deflate & Remove Balloon' : 'Submerge / Remove Node'}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }
}



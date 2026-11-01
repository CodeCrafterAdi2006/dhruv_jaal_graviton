/**
 * Inbox.js — Step 6.4: Base Camp Inbox (HQ Message Dispatch Table)
 * Displays incoming survivor SOS messages delivered to Base Camp (N8).
 * Provides interactive click-to-pan/zoom to survivor coordinates and popover inspection.
 */

import scenarioData from '../data/scenario.json';

export class BaseCampInbox {
  constructor(map, nodeLayer) {
    this.map = map;
    this.nodeLayer = nodeLayer;
    this.scenario = scenarioData;
    this.container = null;
    this.countEl = null;
    this.renderedSosIds = new Set();
  }

  init() {
    this.container = document.getElementById('inbox-list');
    this.countEl = document.getElementById('inbox-count');
  }

  update(state) {
    if (!this.container) return;

    // In Without-Mesh mode: cell towers down, no messages ever arrive
    if (!state.withMesh) {
      if (this.countEl) this.countEl.textContent = '0 DELIVERED';
      this.container.innerHTML = `
        <div class="inbox-empty inbox-blackout">
          <div class="blackout-icon">⚠</div>
          <div class="blackout-title">CELLULAR GRID DOWN</div>
          <div class="blackout-desc">Zero messages delivered. Trapped survivors have no communications route.</div>
        </div>
      `;
      this.renderedSosIds.clear();
      return;
    }

    const delivered = state.deliveredSos || [];

    if (this.countEl) {
      this.countEl.textContent = `${delivered.length} DELIVERED`;
    }

    if (delivered.length === 0) {
      this.container.innerHTML = `
        <div class="inbox-empty">
          <div class="inbox-waiting-pulse"></div>
          <div>Awaiting incoming mesh dispatches...</div>
        </div>
      `;
      this.renderedSosIds.clear();
      return;
    }

    // Check if list needs re-rendering
    const currentIds = delivered.map(s => s.id).join(',');
    const prevIds = Array.from(this.renderedSosIds).join(',');

    if (currentIds !== prevIds) {
      this.renderList(delivered);
    }
  }

  renderList(delivered) {
    this.container.innerHTML = '';
    this.renderedSosIds = new Set(delivered.map(s => s.id));

    // Render newest delivered on top
    const reversed = [...delivered].reverse();

    reversed.forEach((sos, index) => {
      // Find origin node coordinates (scenario nodes or dynamic survivors)
      const dynNode = window.engine?.dynamicNodes?.get(sos.from);
      const originNode = this.scenario.nodes.find(n => n.id === sos.from)
        || dynNode
        || { lat: 27.6840, lon: 85.2970, place: 'Kathmandu' };

      const needClass = sos.need === 'MEDICAL' ? 'need-medical'
                      : sos.need === 'RESCUE'  ? 'need-rescue'
                      : 'need-food';

      const battClass = sos.battery <= 10 ? 'batt-critical'
                      : sos.battery <= 20 ? 'batt-low'
                      : 'batt-ok';

      const hops = sos.path ? sos.path.length - 1 : 4;
      const isNewest = index === 0;

      const card = document.createElement('div');
      card.className = `inbox-card ${isNewest ? 'inbox-card-new' : ''}`;
      card.id = `inbox-card-${sos.id}`;
      card.title = 'Click to focus survivor coordinates on map';

      card.innerHTML = `
        <div class="inbox-card-top">
          <div class="inbox-id-badge">
            <span class="inbox-dot">●</span>
            <span class="inbox-id">${sos.id}</span>
            <span class="inbox-from">${sos.from} (${originNode.place.split(' ')[0]})</span>
          </div>
          <span class="need-badge ${needClass}">${sos.need}</span>
        </div>

        <div class="inbox-text">"${sos.text || 'EMERGENCY ASSISTANCE REQUIRED'}"</div>

        <div class="inbox-meta-grid">
          <div class="inbox-meta-item">
            <span class="meta-label">PEOPLE</span>
            <span class="meta-val highlight">👥 ${sos.people || 1}</span>
          </div>
          <div class="inbox-meta-item">
            <span class="meta-label">BATTERY</span>
            <span class="meta-val ${battClass}">⚡ ${sos.battery}%</span>
          </div>
          <div class="inbox-meta-item">
            <span class="meta-label">ROUTE</span>
            <span class="meta-val">🔗 ${hops} hops</span>
          </div>
          <div class="inbox-meta-item">
            <span class="meta-label">GPS</span>
            <span class="meta-val mono">${originNode.lat.toFixed(4)}, ${originNode.lon.toFixed(4)}</span>
          </div>
        </div>

        <div class="inbox-card-footer">
          <span class="inbox-clock">🕒 ${sos.simClock || 'Delivered'}</span>
          <span class="inbox-target-link">Target on Map ↗</span>
        </div>
      `;

      // Click to focus and pan map to survivor
      card.addEventListener('click', () => {
        this.focusSurvivor(sos, originNode);
      });

      this.container.appendChild(card);
    });
  }

  focusSurvivor(sos, node) {
    if (!this.map) return;

    // Fly smoothly to survivor position
    this.map.easeTo({
      center: [node.lon, node.lat],
      zoom: 15.6,
      pitch: 45,
      duration: 1000
    });

    // Open tactical popover
    if (this.nodeLayer) {
      setTimeout(() => {
        this.nodeLayer.openNodePopup(node.id, [node.lon, node.lat]);
      }, 500);
    }

    // Highlight row
    document.querySelectorAll('.inbox-card').forEach(c => c.classList.remove('inbox-active-focus'));
    const targetCard = document.getElementById(`inbox-card-${sos.id}`);
    if (targetCard) targetCard.classList.add('inbox-active-focus');
  }

  reset() {
    this.renderedSosIds.clear();
    if (this.container) {
      this.container.innerHTML = `
        <div class="inbox-empty">
          <div class="inbox-waiting-pulse"></div>
          <div>Awaiting incoming mesh dispatches...</div>
        </div>
      `;
    }
    if (this.countEl) this.countEl.textContent = '0 DELIVERED';
  }
}

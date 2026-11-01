/**
 * Modals.js — Tactical Context, Response Plan & End-of-Run Summary Overlays
 * Strict adherence to September 2024 Kathmandu Floods verified ground truth.
 */

export class ModalsManager {
  constructor(engine, map) {
    this.engine = engine;
    this.map = map;
    this.contextModal = null;
    this.summaryModal = null;
    this.summaryShownForRun = false;
  }

  init() {
    this.injectModalsDom();
    this.injectHonestyFooter();
    this.bindEvents();
  }

  injectHonestyFooter() {
    if (document.getElementById('map-honesty-footer')) return;
    const footer = document.createElement('div');
    footer.id = 'map-honesty-footer';
    footer.className = 'map-honesty-footer';
    footer.innerHTML = `
      <span>⚠ Simulation. Scripted scenario based on public reports of the Sep 2024 Kathmandu floods. Device positions, flood zone &amp; times are illustrative, not measured.</span>
    `;
    const viewport = document.getElementById('map-viewport');
    if (viewport) viewport.appendChild(footer);
  }

  injectModalsDom() {
    // 1. Context & Response Plan Modal
    if (!document.getElementById('context-modal')) {
      const modal = document.createElement('div');
      modal.id = 'context-modal';
      modal.className = 'tactical-modal-backdrop hidden';
      modal.innerHTML = `
        <div class="tactical-modal-card">
          <div class="modal-header">
            <div class="modal-title-group">
              <span class="modal-badge">DISASTER CONTEXT &amp; RESPONSE PLAN</span>
              <h2 class="modal-title">Kathmandu Valley Floods (27–29 September 2024)</h2>
              <p class="modal-subtitle">What if a low-power LoRa mesh was already deployed when the cellular grid collapsed?</p>
            </div>
            <button class="modal-close-btn" id="btn-close-context" title="Close (Esc)">✕</button>
          </div>

          <div class="modal-body">
            <!-- Section 1: Verified Facts -->
            <div class="modal-section-title">
              <span>VERIFIED HISTORICAL GROUND TRUTH</span>
              <span class="source-tag">Official Sources &amp; Humanitarian Reports</span>
            </div>

            <div class="facts-grid">
              <div class="fact-card">
                <div class="fact-icon">🌧️</div>
                <div class="fact-content">
                  <div class="fact-head">Record Extreme Rainfall</div>
                  <div class="fact-desc">Rain pounded Kathmandu starting Friday night, 27 Sep. Nine stations recorded the highest 24-hr rainfall since Nepal's measurement began in 1970 (240–322 mm in ~24 hours).</div>
                  <div class="fact-source">Source: Nepal Dept. of Hydrology &amp; Meteorology / Reuters</div>
                </div>
              </div>

              <div class="fact-card">
                <div class="fact-icon">🌊</div>
                <div class="fact-content">
                  <div class="fact-head">Valley Inundation &amp; Stranded Citizens</div>
                  <div class="fact-desc">Southern Kathmandu and the Bagmati river basin were largely inundated. Residents retreated to upper floors and rooftops. Police reported 1,053 rescues across Kathmandu by Saturday morning via boats and an army helicopter.</div>
                  <div class="fact-source">Source: Nepal Police / Associated Press (AP)</div>
                </div>
              </div>

              <div class="fact-card">
                <div class="fact-icon">⚡</div>
                <div class="fact-content">
                  <div class="fact-head">Power Grid &amp; Cellular Blackout</div>
                  <div class="fact-desc">Nepal Telecom confirmed mobile towers lost power due to municipal grid failure and severed terrestrial fiber backhaul links. Emergency flood warning SMS messages failed to reach civilians in blackout areas.</div>
                  <div class="fact-source">Source: Nepal Telecom / Kantipur National Daily</div>
                </div>
              </div>

              <div class="fact-card">
                <div class="fact-icon">🚧</div>
                <div class="fact-content">
                  <div class="fact-head">Capital Valley Completely Isolated</div>
                  <div class="fact-desc">All three arterial highways connecting the Kathmandu Valley to the rest of the nation were blocked by severe landslides, cutting off ground reinforcements for the entire weekend.</div>
                  <div class="fact-source">Source: Associated Press (AP) / Nepal Police</div>
                </div>
              </div>

              <div class="fact-card">
                <div class="fact-icon">🚁</div>
                <div class="fact-content">
                  <div class="fact-head">Delayed Aerial Window &amp; Toll</div>
                  <div class="fact-desc">Toll reached 236 nationally (34+ in Kathmandu). Army helicopters were grounded during peak storm hours and could only deploy after weather cleared Saturday afternoon. Communications restoration was listed as primary humanitarian priority.</div>
                  <div class="fact-source">Source: ACAPS Humanitarian Analysis / AP</div>
                </div>
              </div>
            </div>

            <!-- Section 2: Our Response Plan -->
            <div class="modal-section-title" style="margin-top: 24px;">
              <span>OUR DHRUVA JAAL RESPONSE PLAN</span>
              <span class="source-tag">Tactical Two-Tier Aerial Relay Strategy</span>
            </div>

            <div class="plan-table">
              <div class="plan-row">
                <div class="plan-role role-drone">
                  <span class="plan-icon">🛸</span>
                  <span>DRONES (Tier 1)</span>
                </div>
                <div class="plan-text">
                  <strong>Fastest to deploy.</strong> Launch from safe ground HQ, scout the communication gap, and bridge links immediately. Limited battery endurance.
                </div>
              </div>

              <div class="plan-row">
                <div class="plan-role role-balloon">
                  <span class="plan-icon">🎈</span>
                  <span>BALLOONS (Tier 2)</span>
                </div>
                <div class="plan-text">
                  <strong>Persistent backbone.</strong> Tethered on safe open ground, rise to ~100m, stay up for days at low running cost. Slower to inflate and fixed in position.
                </div>
              </div>

              <div class="plan-row highlight-row">
                <div class="plan-role role-together">
                  <span class="plan-icon">🤝</span>
                  <span>TOGETHER</span>
                </div>
                <div class="plan-text">
                  <strong>Seamless handoff &amp; zero responder risk.</strong> Drones provide the immediate first link; tethered balloons take over as the permanent backbone; drones are recalled. <em>Responders set up all relays from safe ground without wading into contaminated flood waters.</em>
                </div>
              </div>
            </div>

            <div class="modal-honesty-box">
              <strong>Honesty &amp; Transparency Policy:</strong> Scripted simulation for hackathon demonstration. We do not claim dongles, drones, or balloons were used in the real event, nor do we claim a specific number of lives saved. Physical positions and flood boundaries are illustrative.
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      this.contextModal = modal;
    }

    // 2. Mission Summary Modal (t=96s)
    if (!document.getElementById('summary-modal')) {
      const summaryModal = document.createElement('div');
      summaryModal.id = 'summary-modal';
      summaryModal.className = 'tactical-modal-backdrop hidden';
      summaryModal.innerHTML = `
        <div class="tactical-modal-card summary-card">
          <div class="modal-header">
            <div class="modal-title-group">
              <span class="modal-badge badge-success">MISSION SIMULATION COMPLETE · T+76s</span>
              <h2 class="modal-title">Operational Outcome Comparison</h2>
              <p class="modal-subtitle">Evaluating survivable connectivity during severe municipal infrastructure collapse</p>
            </div>
            <button class="modal-close-btn" id="btn-close-summary" title="Close (Esc)">✕</button>
          </div>

          <div class="modal-body">
            <div class="comparison-grid">
              <!-- Column A: With Mesh -->
              <div class="comparison-col col-mesh">
                <div class="col-header">
                  <span class="col-pill pill-mesh">WITH DHRUVA JAAL MESH</span>
                  <div class="col-stat-huge">2 / 2</div>
                  <div class="col-stat-sub">Emergency SOS Messages Successfully Delivered</div>
                </div>

                <div class="col-features">
                  <div class="feat-item">
                    <span class="feat-check">✓</span>
                    <span><strong>100% Rescue Confirmation:</strong> Trapped survivor distress calls reached Base Camp HQ, and cryptographic ACK returned to the survivor handset.</span>
                  </div>
                  <div class="feat-item">
                    <span class="feat-check">✓</span>
                    <span><strong>Flash Store-and-Forward:</strong> When Relay N3 (Teku Ward) submerged under 3.2m floodwaters, Relay N2 held SOS2 in flash memory.</span>
                  </div>
                  <div class="feat-item">
                    <span class="feat-check">✓</span>
                    <span><strong>Targeted Aerial Bridge:</strong> Base Camp scrambled Drone DR1 to bridge the severed Balkhu–Kalimati corridor.</span>
                  </div>
                  <div class="feat-item">
                    <span class="feat-check">✓</span>
                    <span><strong>Seamless Balloon Handover:</strong> 100m Tethered Aerostat BL1 took over persistent coverage, allowing Drone DR1 to return safely to base.</span>
                  </div>
                  <div class="feat-item">
                    <span class="feat-check">✓</span>
                    <span><strong>Two-Way Return ACK:</strong> Rescue ACK returned via aerostat balloon to Balkhu rooftop survivor, confirming rescue boat dispatch.</span>
                  </div>
                </div>
              </div>

              <!-- Column B: Without Mesh -->
              <div class="comparison-col col-nomesh">
                <div class="col-header">
                  <span class="col-pill pill-nomesh">WITHOUT MESH (CELLULAR ONLY)</span>
                  <div class="col-stat-huge down">0 / 2</div>
                  <div class="col-stat-sub">Messages Delivered to Rescue Teams</div>
                </div>

                <div class="col-features">
                  <div class="feat-item">
                    <span class="feat-cross">✕</span>
                    <span><strong>Total Cellular Blackout:</strong> Cell towers collapsed at t=19s from power failure and severed fiber backhauls.</span>
                  </div>
                  <div class="feat-item">
                    <span class="feat-cross">✕</span>
                    <span><strong>0 / 2 Delivered:</strong> Trapped citizens on tin roofs had zero signal. Emergency calls failed and packets dropped.</span>
                  </div>
                  <div class="feat-item">
                    <span class="feat-cross">✕</span>
                    <span><strong>No Store-and-Forward:</strong> Commercial mobile handsets have no mesh retransmission, leaving packets permanently lost.</span>
                  </div>
                  <div class="feat-item">
                    <span class="feat-cross">✕</span>
                    <span><strong>Blind Search:</strong> Rescue crews forced to search flooded alleys randomly without survivor GPS or trapped headcounts.</span>
                  </div>
                  <div class="feat-item">
                    <span class="feat-cross">✕</span>
                    <span><strong>High Responder Risk:</strong> Responders deployed into dangerous, contaminated flood currents without tactical network support.</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="summary-actions">
              <button class="btn btn-primary" id="btn-summary-replay">
                <span>↺</span> Replay Simulation
              </button>
              <button class="btn btn-secondary" id="btn-summary-dismiss">
                Dismiss &amp; Inspect Map
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(summaryModal);
      this.summaryModal = summaryModal;
    }
  }

  bindEvents() {
    // 1. Header Context Button
    const btnContext = document.getElementById('btn-context');
    if (btnContext) {
      btnContext.addEventListener('click', () => this.showContextModal());
    }

    // Close Context Modal
    const btnCloseContext = document.getElementById('btn-close-context');
    if (btnCloseContext) {
      btnCloseContext.addEventListener('click', () => this.hideContextModal());
    }

    // Close Summary Modal
    const btnCloseSummary = document.getElementById('btn-close-summary');
    const btnSummaryDismiss = document.getElementById('btn-summary-dismiss');
    if (btnCloseSummary) {
      btnCloseSummary.addEventListener('click', () => this.hideSummaryModal());
    }
    if (btnSummaryDismiss) {
      btnSummaryDismiss.addEventListener('click', () => this.hideSummaryModal());
    }

    // Replay from Summary
    const btnSummaryReplay = document.getElementById('btn-summary-replay');
    if (btnSummaryReplay) {
      btnSummaryReplay.addEventListener('click', () => {
        this.hideSummaryModal();
        this.engine.restart();
        this.engine.play();
      });
    }

    // Backdrop click dismiss
    this.contextModal?.addEventListener('click', (e) => {
      if (e.target === this.contextModal) this.hideContextModal();
    });
    this.summaryModal?.addEventListener('click', (e) => {
      if (e.target === this.summaryModal) this.hideSummaryModal();
    });

    // Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideContextModal();
        this.hideSummaryModal();
      }
    });

    // Engine summary listener: fire at t>=76s exclusively during Incident Replay
    this.engine.on('state_update', (state) => {
      if (state.t >= 76 && !this.summaryShownForRun && this.engine.isPlaying && this.engine.activeMode === 'replay') {
        this.summaryShownForRun = true;
        this.showSummaryModal();
      }
    });

    this.engine.on('state_reset', () => {
      this.summaryShownForRun = false;
    });
  }

  showContextModal() {
    if (this.contextModal) this.contextModal.classList.remove('hidden');
  }

  hideContextModal() {
    if (this.contextModal) this.contextModal.classList.add('hidden');
  }

  showSummaryModal() {
    if (this.summaryModal) this.summaryModal.classList.remove('hidden');
  }

  hideSummaryModal() {
    if (this.summaryModal) this.summaryModal.classList.add('hidden');
  }
}

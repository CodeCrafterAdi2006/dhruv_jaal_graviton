// Deterministic 100-Second Scenario Playback Engine (Production Refinement)
// Sourced from scenario.json, simulation_plan.md, and master_execution_plan.md

import { DataSource } from './DataSource.js';
import scenarioData from '../data/scenario.json';
import { MeshOptimizer } from './MeshOptimizer.js';

export class ScenarioEngine extends DataSource {
  constructor() {
    super();
    this.scenario = scenarioData;
    this.duration = 100; // 100s full scenario run
    this.currentTime = 0;
    this.speed = 1.0;
    this.isPlaying = false;
    this.withMesh = true; // Toggle for With Mesh vs Without Mesh pitch comparison

    this.rafId = null;
    this.lastTimestamp = null;
    this.processedEvents = new Set();

    // Manual overrides for interactive judge Q&A (Simulate Disaster / Keyboard shortcuts)
    this.manualKilledNodes = new Set();
    this.manualAerialDeployed = new Set();
    this.manualAerialTrigger = null; // 'drones' | 'balloons'

    // Algorithmic Gap Optimizer
    this.meshOptimizer = new MeshOptimizer(this.scenario.nodes);

    // Dynamic Survivor & Relay Node Injection (Interactive Sandbox)
    this.dynamicNodes = new Map();
    this.dynamicDrones = new Map();
    this.dynamicBalloons = new Map();
    this.dynamicEdges = [];
    this.dynamicSosList = [];
    this.MAX_DRONES = 6; // Maximum drone fleet capacity
    this.droneCounter = 0;

    // Active Operational Mode: 'replay' (scripted 5-phase flood) or 'sandbox' (interactive tactical disaster)
    this.activeMode = 'replay';

    // Periodic Survivor Distress Beacon Loop (N1 & Dynamic Survivors)
    this.survivorBeacons = new Map();
    this.beaconTimerId = null;
  }

  setActiveMode(mode) {
    this.activeMode = mode;
    if (mode === 'replay') {
      this.manualKilledNodes.clear();
      this.dynamicNodes.clear();
      this.dynamicDrones.clear();
      this.dynamicBalloons.clear();
      this.dynamicEdges = [];
      this.dynamicSosList = [];
    } else if (mode === 'sandbox') {
      const n1Beacon = this.survivorBeacons.get('N1');
      if (n1Beacon) {
        n1Beacon.isAcknowledged = false;
        n1Beacon.storedInFlash = false;
        n1Beacon.lastBeaconTimestamp = 0;
        n1Beacon.beaconAttempts = 0;
      }
    }
    this.emit('mode_changed', { mode });
    this.emit('state_update', this.reconstructStateAt(this.currentTime));
  }

  init() {
    // Register initial trapped rooftop survivor (N1)
    this.registerSurvivorBeacon('N1', {
      people: 4,
      need: 'RESCUE',
      battery: 18,
      text: 'BALKHU ROOFTOP: Water rising above 2.8m. 4 people trapped on tin roof. Immediate boat rescue needed.'
    });
    this.ensureBeaconLoop();
    this.seek(0);
    this.emit('loaded', this.scenario);
  }

  setWithMesh(enabled) {
    this.withMesh = enabled;
    this.emit('mode_change', { withMesh: this.withMesh });
    this.seek(this.currentTime);
  }

  setSpeed(newSpeed) {
    this.speed = Math.max(0.25, Math.min(newSpeed, 4.0));
    this.emit('speed_change', { speed: this.speed });
  }

  play() {
    if (this.isPlaying) return;
    if (this.currentTime >= this.duration) {
      this.seek(0);
    }
    this.isPlaying = true;
    this.lastTimestamp = performance.now();
    this.emit('play_state', { isPlaying: true });
    this.loop();
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.emit('play_state', { isPlaying: false });
  }

  restart() {
    this.pause();
    this.manualKilledNodes.clear();
    this.manualAerialDeployed.clear();
    this.manualAerialTrigger = null;
    this.dynamicNodes.clear();
    this.dynamicDrones.clear();
    this.dynamicBalloons.clear();
    this.dynamicEdges = [];
    this.dynamicSosList = [];
    this.survivorBeacons.clear();
    this.registerSurvivorBeacon('N1', {
      people: 4,
      need: 'RESCUE',
      battery: 18,
      text: 'BALKHU ROOFTOP: Water rising above 2.8m. 4 people trapped on tin roof. Immediate boat rescue needed.'
    });
    const n1Beacon = this.survivorBeacons.get('N1');
    if (n1Beacon) {
      n1Beacon.isAcknowledged = false;
      n1Beacon.storedInFlash = false;
      n1Beacon.lastBeaconTimestamp = 0;
      n1Beacon.beaconAttempts = 0;
    }
    this.dynamicNodeCounter = 0;
    this.droneCounter = 0;
    this.seek(0);
    this.play();
  }

  /**
   * Tactical Sandbox: Submerge or Remove Node on Click
   * Handles ground relays, survivors, drones, and aerostat balloons.
   */
  submergeRelay(nodeId) {
    if (!nodeId) return null;

    // 1. Dynamic Drone removal
    if (this.dynamicDrones.has(nodeId)) {
      this.dynamicDrones.delete(nodeId);
      this.dynamicEdges = this.dynamicEdges.filter(e => e.a !== nodeId && e.b !== nodeId);
      this.manualKilledNodes.add(nodeId);
      this.emit('aerial', {
        type: 'drones_return',
        ids: [nodeId],
        simClock: 'RECALLED'
      });
      this.emit('node_status', {
        id: nodeId,
        status: 'down',
        reason: 'Recalled / Removed from network'
      });
      this.checkSurvivorBeacons(true);
      const updatedState = this.reconstructStateAt(this.currentTime);
      this.emit('state_update', updatedState);
      return nodeId;
    }

    // 2. Dynamic Balloon removal
    if (this.dynamicBalloons.has(nodeId)) {
      this.dynamicBalloons.delete(nodeId);
      this.dynamicEdges = this.dynamicEdges.filter(e => e.a !== nodeId && e.b !== nodeId);
      this.manualKilledNodes.add(nodeId);
      this.emit('node_status', {
        id: nodeId,
        status: 'down',
        reason: 'Deflated / Removed from network'
      });
      this.checkSurvivorBeacons(true);
      const updatedState = this.reconstructStateAt(this.currentTime);
      this.emit('state_update', updatedState);
      return nodeId;
    }

    // 3. Dynamic Survivor / Relay removal
    if (this.dynamicNodes.has(nodeId)) {
      this.dynamicNodes.delete(nodeId);
      this.survivorBeacons.delete(nodeId);
      this.dynamicEdges = this.dynamicEdges.filter(e => e.a !== nodeId && e.b !== nodeId);
      this.manualKilledNodes.add(nodeId);
      this.emit('node_status', {
        id: nodeId,
        status: 'down',
        reason: 'Removed from network'
      });
      this.checkSurvivorBeacons(true);
      const updatedState = this.reconstructStateAt(this.currentTime);
      this.emit('state_update', updatedState);
      return nodeId;
    }

    // 4. Static node (Relay, Dongle, Helper, or Static Aerial DR1/DR2/BL1/BL2)
    this.manualKilledNodes.add(nodeId);
    this.emit('node_status', {
      id: nodeId,
      status: 'down',
      reason: 'Submerged / Disabled by operator'
    });

    // Re-check all active survivor beacons to see if routes are broken or need re-routing
    const state = this.reconstructStateAt(this.currentTime);
    this.survivorBeacons.forEach(survivor => {
      const isSandboxN1 = this.activeMode === 'sandbox' && survivor.id === 'N1';
      if ((survivor.id !== 'N1' || isSandboxN1) && !survivor.isAcknowledged) {
        const path = this.findShortestPath(survivor.id, 'N8', state);
        if (!path) {
          survivor.storedInFlash = true;
        }
      }
    });

    const updatedState = this.reconstructStateAt(this.currentTime);
    this.emit('state_update', updatedState);
    return nodeId;
  }

  /**
   * Interactive "Simulate Disaster" Button / 'K' Keyboard shortcut
   */
  killNextNode() {
    const candidates = ['N3', 'N6', 'N2', 'N4', 'N7', 'N5'];
    const state = this.reconstructStateAt(this.currentTime);
    const nextTarget = candidates.find(id => {
      const n = state.nodes.find(node => node.id === id);
      return n && n.status === 'online';
    });

    if (nextTarget) {
      return this.submergeRelay(nextTarget);
    }
    return null;
  }

  /**
   * Tactical Sandbox: Deploy Airborne Drone to precise clicked [lon, lat] coordinates
   * Enforces 6-Drone Fleet Limit with automatic Aerostat Balloon relief handover.
   */
  dispatchDroneTo(lon, lat, options = {}) {
    // 1. Enforce 6-Drone Fleet Limit
    // "if the network is not getting built we will free the drone automatically by setting a balloon there."
    if (this.dynamicDrones.size >= this.MAX_DRONES) {
      const oldestDrone = Array.from(this.dynamicDrones.values())[0];
      if (oldestDrone) {
        this.dispatchBalloonTo(oldestDrone.lon, oldestDrone.lat, {
          label: `BALLOON (Auto-Relief ${oldestDrone.id})`
        });
        this.emit('aerial', {
          type: 'auto_balloon_relief',
          message: `Fleet limit reached (6/6): Promoted ${oldestDrone.id} to 100m Balloon to free drone for new mission!`,
          droneId: oldestDrone.id
        });
      }
    }

    this.droneCounter = (this.droneCounter || 0) + 1;
    const count = this.droneCounter;
    const id = options.id || `DR-${count}`;
    const baseCamp = this.scenario.nodes.find(n => n.id === 'N8') || { lon: 85.3160, lat: 27.7020 };

    const drone = {
      id,
      role: 'drone',
      label: options.label || `DRONE ${count}`,
      sublabel: options.targetZone || 'Airborne Relay',
      place: `Airborne (80m) at ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      lat,
      lon,
      alt_m: 80,
      status: 'online',
      visible: true,
      flightProgress: 0,
      isDynamic: true,
      takeoffTime: performance.now(),
      basePos: [baseCamp.lon, baseCamp.lat],
      targetPos: [lon, lat]
    };

    this.dynamicDrones.set(id, drone);

    // Form aerial links: ONLY connect to nearest living nodes with good signal strength (max 2 links, range <= 850m)
    const state = this.reconstructStateAt(this.currentTime);
    const liveGroundNodes = [
      ...this.scenario.nodes.filter(n => n.role !== 'drone' && n.role !== 'balloon'),
      ...Array.from(this.dynamicNodes.values())
    ].filter(n => {
      if (this.manualKilledNodes.has(n.id)) return false;
      const liveNode = state.nodes.find(sn => sn.id === n.id);
      return liveNode && liveNode.status === 'online';
    });

    let targets = [];
    if (options.linkedNodeIds && options.linkedNodeIds.length > 0) {
      targets = liveGroundNodes.filter(n => options.linkedNodeIds.includes(n.id));
    }
    if (targets.length === 0) {
      const candidates = liveGroundNodes.map(neighbor => ({
        node: neighbor,
        dist: this.calculateDistanceMeters(lon, lat, neighbor.lon, neighbor.lat)
      })).filter(c => c.dist <= 850);

      candidates.sort((a, b) => a.dist - b.dist);
      targets = candidates.slice(0, 2).map(c => c.node);
    }

    targets.forEach(neighbor => {
      const dist = this.calculateDistanceMeters(lon, lat, neighbor.lon, neighbor.lat);
      const rawRssi = -60 - 20 * Math.log10(Math.max(10, dist) / 100);
      const baseRssi = Math.max(-98, Math.min(-62, Math.round(rawRssi)));
      this.dynamicEdges.push({
        a: id,
        b: neighbor.id,
        baseRssi,
        droneLink: true,
        isDynamic: true
      });
    });

    this.emit('aerial', {
      type: 'drones_launch',
      ids: [id],
      simClock: 'SANDBOX DISPATCH'
    });

    // Animate flight progress from Base Camp to target
    const startTime = performance.now();
    const duration = 1200; // 1.2s smooth tactical flight
    const animateFlight = (now) => {
      const p = Math.min(1, (now - startTime) / duration);
      drone.flightProgress = p;
      if (p < 1) {
        requestAnimationFrame(animateFlight);
      } else {
        drone.flightProgress = 1;
        this.emit('aerial', {
          type: 'drones_online',
          ids: [id],
          simClock: 'SANDBOX ACTIVE'
        });
        this.checkSurvivorBeacons(true);
      }
      this.emit('state_update', this.reconstructStateAt(this.currentTime));
    };
    requestAnimationFrame(animateFlight);

    return drone;
  }

  /**
   * Tactical Sandbox: Rearrange / Reposition existing drone to a new optimal station
   */
  repositionDrone(droneId, newLon, newLat, options = {}) {
    const drone = this.dynamicDrones.get(droneId);
    if (!drone) return null;

    const oldLon = drone.lon;
    const oldLat = drone.lat;

    drone.basePos = [oldLon, oldLat];
    drone.targetPos = [newLon, newLat];
    drone.lon = newLon;
    drone.lat = newLat;
    drone.sublabel = options.targetZone || drone.sublabel;
    drone.place = `Airborne (80m) at ${newLat.toFixed(4)}, ${newLon.toFixed(4)}`;
    drone.flightProgress = 0;
    drone.status = 'online';

    // Clear previous edges for this drone
    this.dynamicEdges = this.dynamicEdges.filter(e => e.a !== droneId && e.b !== droneId);

    // Form new aerial links at the new station
    const state = this.reconstructStateAt(this.currentTime);
    const liveGroundNodes = [
      ...this.scenario.nodes.filter(n => n.role !== 'drone' && n.role !== 'balloon'),
      ...Array.from(this.dynamicNodes.values())
    ].filter(n => {
      if (this.manualKilledNodes.has(n.id)) return false;
      const liveNode = state.nodes.find(sn => sn.id === n.id);
      return liveNode && liveNode.status === 'online';
    });

    let targets = [];
    if (options.linkedNodeIds && options.linkedNodeIds.length > 0) {
      targets = liveGroundNodes.filter(n => options.linkedNodeIds.includes(n.id));
    }
    if (targets.length === 0) {
      const candidates = liveGroundNodes.map(neighbor => ({
        node: neighbor,
        dist: this.calculateDistanceMeters(newLon, newLat, neighbor.lon, neighbor.lat)
      })).filter(c => c.dist <= 850);

      candidates.sort((a, b) => a.dist - b.dist);
      targets = candidates.slice(0, 2).map(c => c.node);
    }

    targets.forEach(neighbor => {
      const dist = this.calculateDistanceMeters(newLon, newLat, neighbor.lon, neighbor.lat);
      const rawRssi = -60 - 20 * Math.log10(Math.max(10, dist) / 100);
      const baseRssi = Math.max(-98, Math.min(-62, Math.round(rawRssi)));
      this.dynamicEdges.push({
        a: droneId,
        b: neighbor.id,
        baseRssi,
        droneLink: true,
        isDynamic: true
      });
    });

    this.emit('aerial', {
      type: 'drones_reposition',
      ids: [droneId],
      from: [oldLon, oldLat],
      to: [newLon, newLat],
      simClock: 'REARRANGING'
    });

    const startTime = performance.now();
    const duration = 1200;
    const animateFlight = (now) => {
      const p = Math.min(1, (now - startTime) / duration);
      drone.flightProgress = p;
      if (p < 1) {
        requestAnimationFrame(animateFlight);
      } else {
        drone.flightProgress = 1;
        this.emit('aerial', {
          type: 'drones_online',
          ids: [droneId],
          simClock: 'SANDBOX ACTIVE'
        });
        this.checkSurvivorBeacons(true);
      }
      this.emit('state_update', this.reconstructStateAt(this.currentTime));
    };
    requestAnimationFrame(animateFlight);

    return drone;
  }

  /**
   * Tactical Sandbox: Deploy Tethered Aerostat Balloon to precise clicked [lon, lat] coordinates
   * If a drone is stationed at/near this spot, recall that drone to Base Camp!
   */
  dispatchBalloonTo(lon, lat, options = {}) {
    const count = this.dynamicBalloons.size + 1;
    const id = options.id || `BL-${count}`;

    // Check if any drone is within 600m of this spot -> Handover & Recall drone!
    this.dynamicDrones.forEach((drone, droneId) => {
      const d = this.calculateDistanceMeters(lon, lat, drone.lon, drone.lat);
      if (d <= 600 && drone.status === 'online') {
        drone.status = 'recalling';
        this.emit('aerial', {
          type: 'drones_recall',
          ids: [droneId],
          simClock: 'HANDOVER COMPLETE'
        });
        setTimeout(() => {
          this.dynamicDrones.delete(droneId);
          this.dynamicEdges = this.dynamicEdges.filter(e => e.a !== droneId && e.b !== droneId);
          this.emit('state_update', this.reconstructStateAt(this.currentTime));
        }, 1500);
      }
    });

    const balloon = {
      id,
      role: 'balloon',
      label: options.label || `BALLOON ${count}`,
      sublabel: '100m Aerostat',
      place: `Tethered Aerostat (100m) at ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      lat,
      lon,
      alt_m: 100,
      tethered: true,
      status: 'online',
      visible: true,
      flightProgress: 0,
      isDynamic: true
    };

    this.dynamicBalloons.set(id, balloon);

    // Form high-altitude balloon links: connect ONLY to nearest 2 living nodes within 950m
    const state = this.reconstructStateAt(this.currentTime);
    const liveGroundNodes = [
      ...this.scenario.nodes.filter(n => n.role !== 'drone' && n.role !== 'balloon'),
      ...Array.from(this.dynamicNodes.values())
    ].filter(n => {
      if (this.manualKilledNodes.has(n.id)) return false;
      const liveNode = state.nodes.find(sn => sn.id === n.id);
      return liveNode && liveNode.status === 'online';
    });

    let targets = [];
    if (options.linkedNodeIds && options.linkedNodeIds.length > 0) {
      targets = liveGroundNodes.filter(n => options.linkedNodeIds.includes(n.id));
    }
    if (targets.length === 0) {
      const candidates = liveGroundNodes.map(neighbor => ({
        node: neighbor,
        dist: this.calculateDistanceMeters(lon, lat, neighbor.lon, neighbor.lat)
      })).filter(c => c.dist <= 950);

      candidates.sort((a, b) => a.dist - b.dist);
      targets = candidates.slice(0, 2).map(c => c.node);
    }

    targets.forEach(neighbor => {
      const dist = this.calculateDistanceMeters(lon, lat, neighbor.lon, neighbor.lat);
      const rawRssi = -58 - 20 * Math.log10(Math.max(10, dist) / 100);
      const baseRssi = Math.max(-95, Math.min(-60, Math.round(rawRssi)));
      this.dynamicEdges.push({
        a: id,
        b: neighbor.id,
        baseRssi,
        balloonLink: true,
        isDynamic: true
      });
    });

    this.emit('aerial', {
      type: 'balloons_launch',
      ids: [id],
      simClock: 'SANDBOX ASCENT'
    });

    // Animate balloon vertical rise
    const startTime = performance.now();
    const duration = 1500;
    const animateRise = (now) => {
      const p = Math.min(1, (now - startTime) / duration);
      balloon.flightProgress = p;
      if (p < 1) {
        requestAnimationFrame(animateRise);
      } else {
        balloon.flightProgress = 1;
        this.emit('aerial', {
          type: 'balloons_online',
          ids: [id],
          simClock: 'AEROSTAT ONLINE'
        });
        this.checkSurvivorBeacons(true);
      }
      this.emit('state_update', this.reconstructStateAt(this.currentTime));
    };
    requestAnimationFrame(animateRise);

    return balloon;
  }

  /**
   * Tactical Sandbox: Algorithmic Gap Detection, Rearrangement, & Auto-Bridge
   * Enforces 6-Drone Fleet Limit with automatic Aerostat Balloon relief handover.
   */
  autoBridgeGaps() {
    const state = this.reconstructStateAt(this.currentTime);
    const gaps = this.meshOptimizer.detectAllCoverageGaps(state.nodes, state.edges, 'N8');

    if (!gaps || gaps.length === 0) {
      return { 
        needed: 0, 
        drones: [],
        balloons: [],
        message: 'Mesh topology fully connected. All live nodes have active routes to Base Camp N8.' 
      };
    }

    const currentDrones = Array.from(this.dynamicDrones.values());
    const plan = this.meshOptimizer.computeRearrangementPlan(currentDrones, gaps, this.MAX_DRONES || 6);

    const executedActions = {
      repositioned: [],
      dispatchedDrones: [],
      deployedBalloons: []
    };

    // 1. Deploy Aerostat Balloons to relieve and free drones
    plan.balloonsToDeploy.forEach(b => {
      const balloon = this.dispatchBalloonTo(b.lon, b.lat, {
        label: b.replacesDroneId ? `BALLOON (Relief ${b.replacesDroneId})` : `BALLOON (Aerostat Anchor)`
      });
      executedActions.deployedBalloons.push({ balloon, planItem: b });
    });

    // 2. Rearrange existing drones to their newly assigned bridge positions
    plan.dronesToReposition.forEach(r => {
      const drone = this.repositionDrone(r.droneId, r.to[0], r.to[1], {
        targetZone: r.targetZone,
        linkedNodeIds: r.linkedNodeIds
      });
      if (drone) executedActions.repositioned.push({ drone, planItem: r });
    });

    // 3. Dispatch new drones (or freed drones) to remaining gaps within 6-drone limit
    plan.dronesToDispatch.forEach(d => {
      const drone = this.dispatchDroneTo(d.lon, d.lat, {
        label: `DRONE ${(this.droneCounter || this.dynamicDrones.size) + 1}`,
        targetZone: d.targetZone,
        linkedNodeIds: d.linkedNodeIds
      });
      if (drone) executedActions.dispatchedDrones.push({ drone, planItem: d });
    });

    this.checkSurvivorBeacons(true);

    return { 
      needed: gaps.length, 
      plan,
      actions: executedActions,
      message: plan.summary 
    };
  }

  /**
   * Tactical Sandbox: Legacy deploy helper
   */
  deployAerial(type = 'drone') {
    if (type === 'drone') {
      const targetLon = 85.3060;
      const targetLat = 27.6950;
      return [this.dispatchDroneTo(targetLon, targetLat)];
    } else {
      const targetLon = 85.3060;
      const targetLat = 27.6950;
      return [this.dispatchBalloonTo(targetLon, targetLat)];
    }
  }

  /**
   * Helper: calculate spherical distance in meters between two [lon, lat] coordinates
   */
  calculateDistanceMeters(lon1, lat1, lon2, lat2) {
    const R = 6371e3; // Earth radius in meters
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Drop / Spawn Dynamic Survivor or Relay Node anywhere on map
   */
  spawnDynamicNode(lon, lat, options = {}) {
    this.dynamicNodeCounter = (this.dynamicNodeCounter || 0) + 1;
    const id = options.id || `DYN-${this.dynamicNodeCounter}`;
    const role = options.role || 'dongle';

    const node = {
      id,
      role: 'dongle',
      label: `🔴 SURVIVOR · ${id}`,
      sublabel: 'Live Survivor',
      place: `GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      lat,
      lon,
      alt_m: 6,
      status: 'online',
      visible: true,
      flightProgress: 1,
      isDynamic: true,
      isAcknowledged: false,
      storedInFlash: false
    };

    this.dynamicNodes.set(id, node);

    // Form physically realistic radio links to living nodes within range (<= 850m for ground, <= 1200m for active aerials)
    const state = this.reconstructStateAt(this.currentTime);
    const liveNeighbors = state.nodes.filter(n =>
      n.id !== id &&
      n.status === 'online' &&
      n.visible &&
      !this.manualKilledNodes.has(n.id)
    );

    liveNeighbors.forEach(neighbor => {
      const dist = this.calculateDistanceMeters(lon, lat, neighbor.lon, neighbor.lat);
      const isAerial = neighbor.role === 'drone' || neighbor.role === 'balloon';
      const maxRange = isAerial ? (neighbor.role === 'balloon' ? 1200 : 850) : 850;

      if (dist <= maxRange) {
        // Physical log-distance path loss
        const rawRssi = isAerial
          ? -60 - 20 * Math.log10(Math.max(10, dist) / 100)
          : -68 - 32 * Math.log10(Math.max(10, dist) / 100);
        const baseRssi = Math.max(-105, Math.min(-62, Math.round(rawRssi)));

        this.dynamicEdges.push({
          a: id,
          b: neighbor.id,
          baseRssi,
          droneLink: neighbor.role === 'drone',
          balloonLink: neighbor.role === 'balloon',
          isDynamic: true
        });
      }
    });

    // Register fresh survivor beacon as UNACKNOWLEDGED (RED)
    const survivor = {
      id,
      isAcknowledged: false,
      lastBeaconTimestamp: 0,
      beaconIntervalSeconds: 12,
      beaconAttempts: 0,
      people: options.people || 2,
      need: options.need || 'RESCUE',
      battery: 88,
      text: options.text || `EMERGENCY: Stranded survivor at ${id} (${lat.toFixed(4)}, ${lon.toFixed(4)}). Immediate rescue required.`,
      storedInFlash: false
    };
    this.survivorBeacons.set(id, survivor);
    this.ensureBeaconLoop();

    // Trigger initial distress beacon flight
    this.fireSurvivorBeacon(id);

    const updatedState = this.reconstructStateAt(this.currentTime);
    this.emit('state_update', updatedState);
    this.emit('node_spawned', { node, state: updatedState });
    return node;
  }

  /**
   * Register a survivor node for periodic distress beacons until ACK
   */
  registerSurvivorBeacon(nodeId, config = {}) {
    if (this.survivorBeacons.has(nodeId)) {
      const s = this.survivorBeacons.get(nodeId);
      if (config.forceReset) {
        s.isAcknowledged = false;
        s.storedInFlash = false;
        s.lastBeaconTimestamp = 0;
        s.beaconAttempts = 0;
      }
      if (config.text) s.text = config.text;
      return s;
    }

    const survivor = {
      id: nodeId,
      isAcknowledged: false,
      lastBeaconTimestamp: 0,
      beaconIntervalSeconds: 12, // 12s LoRa distress beacon interval
      beaconAttempts: 0,
      people: config.people || 2,
      need: config.need || 'RESCUE',
      battery: config.battery || 85,
      text: config.text || `EMERGENCY: Stranded survivor at ${nodeId}. Immediate rescue required.`,
      storedInFlash: false
    };

    this.survivorBeacons.set(nodeId, survivor);
    this.ensureBeaconLoop();
    return survivor;
  }

  ensureBeaconLoop() {
    if (this.beaconTimerId) return;
    this.beaconTimerId = setInterval(() => {
      this.checkSurvivorBeacons();
    }, 2500);
  }

  checkSurvivorBeacons(force = false) {
    const now = performance.now();
    this.survivorBeacons.forEach(survivor => {
      // In Replay mode, N1 is controlled deterministically by scenario timeline
      if (this.activeMode === 'replay' && survivor.id === 'N1') return;
      if (survivor.isAcknowledged) return;

      const elapsed = (now - survivor.lastBeaconTimestamp) / 1000;
      if (force || survivor.lastBeaconTimestamp === 0 || elapsed >= survivor.beaconIntervalSeconds) {
        this.fireSurvivorBeacon(survivor.id);
      }
    });
  }

  fireSurvivorBeacon(nodeId) {
    const survivor = this.survivorBeacons.get(nodeId);
    if (!survivor || survivor.isAcknowledged) return;

    survivor.lastBeaconTimestamp = performance.now();
    survivor.beaconAttempts++;

    const state = this.reconstructStateAt(this.currentTime);

    if (!this.withMesh) {
      this.emit('sos_failed', {
        id: `SOS-${nodeId}-B${survivor.beaconAttempts}`,
        reason: 'Cellular grid DOWN. Zero LoRa mesh coverage in Without-Mesh mode.',
        from: nodeId
      });
      return;
    }

    const path = this.findShortestPath(nodeId, 'N8', state);

    if (!path) {
      // Mesh isolated or bridge drowned — store in flash memory
      survivor.storedInFlash = true;
      const sosItem = {
        id: `SOS-${nodeId}-B${survivor.beaconAttempts}`,
        from: nodeId,
        path: [nodeId],
        people: survivor.people,
        need: survivor.need,
        battery: survivor.battery,
        text: survivor.text,
        state: 'STORED',
        statusText: `STORED IN DONGLE FLASH · Retrying beacon #${survivor.beaconAttempts} every 16s...`,
        isDynamic: true
      };
      this.emit('sos_stored', { survivor, sosItem, reason: 'No active route to Base Camp. Held in flash memory.' });
      this.emit('state_update', this.reconstructStateAt(this.currentTime));
      return;
    }

    // Active path found — transmit packet across mesh!
    survivor.storedInFlash = false;
    const sosItem = {
      id: `SOS-${nodeId}-B${survivor.beaconAttempts}`,
      from: nodeId,
      path,
      people: survivor.people,
      need: survivor.need,
      battery: survivor.battery,
      text: survivor.text,
      state: 'TRANSMITTING',
      isDynamic: true,
      deliveredAt: null,
      simClock: state.simClock || 'LIVE'
    };

    this.dynamicSosList.push(sosItem);

    // Launch real-time packet flight across nodes
    this.emit('live_packet_launch', {
      id: sosItem.id,
      from: nodeId,
      path,
      text: sosItem.text,
      isAck: false,
      onHop: (from, to, hopIdx) => {
        this.emit('packet_hop', { id: sosItem.id, from, to, hopIdx });
      },
      onDelivered: () => {
        // 1. Deliver to Base Camp
        sosItem.state = 'DELIVERED';
        sosItem.deliveredAt = this.currentTime;
        this.emit('sos_delivered', { sosItem, state: this.reconstructStateAt(this.currentTime) });
        this.emit('state_update', this.reconstructStateAt(this.currentTime));

        // 2. Base Camp immediately dispatches return ACK packet
        const reversePath = [...path].reverse();
        const ackId = `ACK-${sosItem.id}`;

        this.emit('live_packet_launch', {
          id: ackId,
          from: 'N8',
          path: reversePath,
          text: `CONFIRMED: Rescue boat dispatched to ${nodeId}. Stay above water line.`,
          isAck: true,
          onHop: (from, to, hopIdx) => {
            this.emit('ack_hop', { id: ackId, from, to, hopIdx });
          },
          onDelivered: () => {
            // 3. Survivor receives two-way ACK
            survivor.isAcknowledged = true;
            this.emit('survivor_ack', {
              nodeId,
              sosId: sosItem.id,
              ackId,
              text: `Rescue confirmation received by ${nodeId}!`
            });
            this.emit('state_update', this.reconstructStateAt(this.currentTime));
          }
        });
      }
    });

    this.emit('sos_beacon_sent', { survivor, sosItem, path });
    this.emit('state_update', this.reconstructStateAt(this.currentTime));
  }

  /**
   * Remove a dynamic node, drone, balloon, or relay and its attached edges
   */
  removeDynamicNode(nodeId) {
    if (!nodeId) return;

    if (this.dynamicDrones.has(nodeId)) {
      this.dynamicDrones.delete(nodeId);
      this.emit('aerial', {
        type: 'drones_return',
        ids: [nodeId],
        simClock: 'RECALLED'
      });
      this.emit('node_status', {
        id: nodeId,
        status: 'down',
        reason: 'Recalled / Removed from network'
      });
    }

    if (this.dynamicBalloons.has(nodeId)) {
      this.dynamicBalloons.delete(nodeId);
      this.emit('node_status', {
        id: nodeId,
        status: 'down',
        reason: 'Deflated / Removed from network'
      });
    }

    this.dynamicNodes.delete(nodeId);
    this.manualKilledNodes.add(nodeId);
    this.survivorBeacons.delete(nodeId);
    this.dynamicEdges = this.dynamicEdges.filter(e => e.a !== nodeId && e.b !== nodeId);
    this.dynamicSosList = this.dynamicSosList.filter(s => s.from !== nodeId);
    this.checkSurvivorBeacons(true);
    const state = this.reconstructStateAt(this.currentTime);
    this.emit('state_update', state);
  }

  /**
   * Clear all dynamic nodes, aerials, and reset survivor beacons
   */
  clearDynamicNodes() {
    this.dynamicNodes.clear();
    this.dynamicDrones.clear();
    this.dynamicBalloons.clear();
    this.dynamicEdges = [];
    this.dynamicSosList = [];
    this.survivorBeacons.clear();
    this.registerSurvivorBeacon('N1', {
      people: 4,
      need: 'RESCUE',
      battery: 18,
      text: 'BALKHU ROOFTOP: Water rising above 2.8m. 4 people trapped on tin roof. Immediate boat rescue needed.'
    });
    const n1Beacon = this.survivorBeacons.get('N1');
    if (n1Beacon) {
      n1Beacon.isAcknowledged = false;
      n1Beacon.storedInFlash = false;
      n1Beacon.lastBeaconTimestamp = 0;
      n1Beacon.beaconAttempts = 0;
    }
    this.dynamicNodeCounter = 0;
    this.droneCounter = 0;
    const state = this.reconstructStateAt(this.currentTime);
    this.emit('state_update', state);
  }

  /**
   * Dijkstra / BFS Shortest Path through living mesh edges to Base Camp N8
   */
  findShortestPath(fromId, toId = 'N8', state) {
    if (!state) state = this.reconstructStateAt(this.currentTime);

    const activeEdges = state.edges.filter(e => e.active);
    const adj = new Map();

    activeEdges.forEach(e => {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push(e.b);
      adj.get(e.b).push(e.a);
    });

    const queue = [[fromId]];
    const visited = new Set([fromId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];

      if (curr === toId) return path;

      const neighbors = adj.get(curr) || [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }

    return null; // Partitioned / No route
  }

  /**
   * Live SOS Transmission from any dynamic or ground node with custom packet parameters
   */
  sendDynamicSos(fromId, customText, options = {}) {
    let survivor = this.survivorBeacons.get(fromId);
    if (!survivor) {
      survivor = this.registerSurvivorBeacon(fromId, {
        text: customText,
        people: options.people || 4,
        need: options.need || (options.flg && (options.flg & 2) ? 'MEDICAL' : 'RESCUE')
      });
    } else {
      survivor.isAcknowledged = false;
      if (customText) survivor.text = customText;
      if (options.people) survivor.people = options.people;
      if (options.need) survivor.need = options.need;
    }
    survivor.lastBeaconTimestamp = 0; // Force immediate broadcast
    this.fireSurvivorBeacon(fromId);
    return { success: true, survivor };
  }

  loop() {
    if (!this.isPlaying) return;

    const now = performance.now();
    const deltaSeconds = ((now - this.lastTimestamp) / 1000) * this.speed;
    this.lastTimestamp = now;

    const nextTime = Math.min(this.duration, this.currentTime + deltaSeconds);
    this.advanceTo(nextTime);

    if (this.currentTime >= this.duration) {
      this.pause();
      this.emit('completed', { currentTime: this.duration });
      return;
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  /**
   * Advance playback forward and trigger newly crossed timeline events
   */
  advanceTo(newTime) {
    const prevTime = this.currentTime;
    this.currentTime = newTime;

    // Check timeline items that trigger in the window
    this.scenario.timeline.forEach((item, index) => {
      const eventKey = `${index}-${item.t}`;
      const isInitialZero = prevTime === 0 && item.t === 0;
      if (((item.t > prevTime && item.t <= newTime) || isInitialZero) && !this.processedEvents.has(eventKey)) {
        this.processedEvents.add(eventKey);
        this.dispatchEvent(item);
      }
    });

    const state = this.reconstructStateAt(this.currentTime);
    this.emit('state_update', state);
    this.emit('tick', {
      time: this.currentTime,
      duration: this.duration,
      progress: this.currentTime / this.duration,
      simClock: state.simClock,
      state
    });
  }

  /**
   * Scrub directly to any point in time t, reconstructing the exact world state
   */
  seek(targetTime) {
    this.currentTime = Math.max(0, Math.min(targetTime, this.duration));
    this.processedEvents.clear();

    const stateAtTime = this.reconstructStateAt(this.currentTime);

    // Mark passed events (strictly less than currentTime)
    this.scenario.timeline.forEach((item, index) => {
      if (item.t < this.currentTime) {
        this.processedEvents.add(`${index}-${item.t}`);
      }
    });

    this.emit('state_reset', stateAtTime);
    this.emit('tick', {
      time: this.currentTime,
      duration: this.duration,
      progress: this.currentTime / this.duration,
      simClock: stateAtTime.simClock,
      state: stateAtTime
    });
  }

  /**
   * Compute exact SOS lifecycle state at any timestamp t
   * States: QUEUED -> STORED -> TRANSMITTING -> SENT_TO_MESH -> DELIVERED (or FAILED)
   * With two-way ACK flight tracking: isAckInFlight, ackFromNode, ackToNode, ackHopProgress, ackDeliveredAt
   */
  getSosStateAt(sosItem, t) {
    if (t < sosItem.t) return null;

    if (!this.withMesh) {
      return {
        ...sosItem,
        state: 'FAILED',
        hopsCompleted: 0,
        deliveredAt: null,
        isAckInFlight: false,
        isAckDelivered: false,
        reason: 'Cellular grid DOWN. Zero LoRa mesh coverage in Without-Mesh mode.'
      };
    }

    const hopSeconds = this.scenario.meta.hopSeconds || 1.2;

    // ── SPECIFIC NARRATIVE TIMELINE: SOS1 (Part 1: Baseline Health) ─────────────
    if (sosItem.id === 'SOS1') {
      const qEnd = 2.0 + 0.35; // 2.35
      const sEnd = 2.0 + 1.05; // 3.05
      const fwdTotalHops = 4; // N1->N2->N3->N4->N8
      const fwdDeliveredAt = sEnd + fwdTotalHops * hopSeconds; // 3.05 + 4.8 = 7.85
      const ackPath = sosItem.ackPath || ['N8', 'N4', 'N3', 'N2', 'N1'];
      const ackTotalHops = ackPath.length - 1; // 4
      const ackDeliveredAt = fwdDeliveredAt + ackTotalHops * hopSeconds; // 7.85 + 4.8 = 12.65

      if (t < qEnd) {
        return {
          ...sosItem,
          state: 'QUEUED',
          hopsCompleted: 0,
          progress: 0,
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: 'QUEUED IN APP · Preparing packet'
        };
      }
      if (t < sEnd) {
        return {
          ...sosItem,
          state: 'STORED',
          hopsCompleted: 0,
          progress: 0,
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: 'STORED IN DONGLE FLASH · Preamble broadcast'
        };
      }
      if (t < fwdDeliveredAt) {
        const elapsed = t - sEnd;
        const hopFloat = elapsed / hopSeconds;
        const hopIdx = Math.min(fwdTotalHops - 1, Math.floor(hopFloat));
        return {
          ...sosItem,
          state: 'SENT_TO_MESH',
          hopsCompleted: hopIdx,
          currentHopIndex: hopIdx,
          fromNode: sosItem.path[hopIdx],
          toNode: sosItem.path[hopIdx + 1],
          hopProgress: hopFloat % 1,
          deliveredAt: fwdDeliveredAt,
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: `SENT_TO_MESH · Via ${sosItem.path[hopIdx]} → ${sosItem.path[hopIdx + 1]}`
        };
      }
      if (t < ackDeliveredAt) {
        const ackElapsed = t - fwdDeliveredAt;
        const ackHopFloat = ackElapsed / hopSeconds;
        const ackHopIdx = Math.min(ackTotalHops - 1, Math.floor(ackHopFloat));
        return {
          ...sosItem,
          state: 'DELIVERED',
          hopsCompleted: fwdTotalHops,
          progress: 1,
          deliveredAt: fwdDeliveredAt,
          ackDeliveredAt,
          isAckInFlight: true,
          isAckDelivered: false,
          ackFromNode: ackPath[ackHopIdx],
          ackToNode: ackPath[ackHopIdx + 1],
          ackHopProgress: ackHopFloat % 1,
          statusText: `DELIVERED TO HQ · ACK returning via relay (${ackPath[ackHopIdx]} → ${ackPath[ackHopIdx + 1]})`
        };
      }
      return {
        ...sosItem,
        state: 'DELIVERED',
        hopsCompleted: fwdTotalHops,
        progress: 1,
        deliveredAt: fwdDeliveredAt,
        ackDeliveredAt,
        isAckInFlight: false,
        isAckDelivered: true,
        statusText: 'DELIVERED & ACKNOWLEDGED · Two-way rescue confirmed'
      };
    }

    // ── SPECIFIC NARRATIVE TIMELINE: SOS2 (Parts 2-4: Flood, Drone, Balloon ACK) ─
    if (sosItem.id === 'SOS2') {
      const qEnd = 24.0 + 0.35; // 24.35
      const sEnd = 24.0 + 1.05; // 25.05
      const hop0End = sEnd + 1 * hopSeconds; // 25.05 + 1.2 = 26.25 (N1 -> N2)
      const droneBridgeStart = 38.0; // Drone online, releases stored message from N2
      const bridgeHops = 3; // N2->DR1->N4->N8
      const fwdDeliveredAt = droneBridgeStart + bridgeHops * hopSeconds; // 38.0 + 3.6 = 41.6
      const balloonAckStart = 54.0; // After Balloon BL1 ascends to 100m (t=52) and DR1 returns
      const ackPath = sosItem.ackPath || ['N8', 'N4', 'BL1', 'N2', 'N1'];
      const ackTotalHops = ackPath.length - 1; // 4
      const ackDeliveredAt = balloonAckStart + ackTotalHops * hopSeconds; // 54.0 + 4.8 = 58.8

      if (t < qEnd) {
        return {
          ...sosItem,
          state: 'QUEUED',
          hopsCompleted: 0,
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: 'QUEUED IN APP · Periodic beacon #2'
        };
      }
      if (t < sEnd) {
        return {
          ...sosItem,
          state: 'STORED',
          hopsCompleted: 0,
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: 'STORED IN DONGLE FLASH · Transmitting to N2'
        };
      }
      if (t < hop0End) {
        const p = (t - sEnd) / hopSeconds;
        return {
          ...sosItem,
          state: 'SENT_TO_MESH',
          hopsCompleted: 0,
          fromNode: 'N1',
          toNode: 'N2',
          hopProgress: p,
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: 'SENT_TO_MESH · N1 → N2 (Balkhu Market)'
        };
      }
      if (t < droneBridgeStart) {
        // HELD AT N2 BECAUSE N3 IS SUBMERGED!
        return {
          ...sosItem,
          state: 'STORED',
          hopsCompleted: 1,
          storedAtNode: 'N2',
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: 'STORED IN RELAY N2 FLASH · Bridge submerged, awaiting aerial drone'
        };
      }
      if (t < fwdDeliveredAt) {
        const elapsed = t - droneBridgeStart;
        const hopFloat = elapsed / hopSeconds;
        const hopOffset = Math.min(bridgeHops - 1, Math.floor(hopFloat));
        const currentHopIdx = 1 + hopOffset; // 1: N2->DR1, 2: DR1->N4, 3: N4->N8
        return {
          ...sosItem,
          state: 'SENT_TO_MESH',
          hopsCompleted: currentHopIdx,
          currentHopIndex: currentHopIdx,
          fromNode: sosItem.path[currentHopIdx],
          toNode: sosItem.path[currentHopIdx + 1],
          hopProgress: hopFloat % 1,
          deliveredAt: fwdDeliveredAt,
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: `SENT_TO_MESH · Aerial bridge (${sosItem.path[currentHopIdx]} → ${sosItem.path[currentHopIdx + 1]})`
        };
      }
      if (t < balloonAckStart) {
        // DELIVERED TO HQ, AWAITING BALLOON HANDOVER BEFORE TRANSMITTING ACK!
        return {
          ...sosItem,
          state: 'DELIVERED',
          hopsCompleted: 4,
          progress: 1,
          deliveredAt: fwdDeliveredAt,
          isAckInFlight: false,
          isAckDelivered: false,
          statusText: 'DELIVERED TO HQ · Awaiting aerostat balloon handover before ACK'
        };
      }
      if (t < ackDeliveredAt) {
        // ACK TRANSMITTED THROUGH BALLOON BACKBONE!
        const ackElapsed = t - balloonAckStart;
        const ackHopFloat = ackElapsed / hopSeconds;
        const ackHopIdx = Math.min(ackTotalHops - 1, Math.floor(ackHopFloat));
        return {
          ...sosItem,
          state: 'DELIVERED',
          hopsCompleted: 4,
          progress: 1,
          deliveredAt: fwdDeliveredAt,
          ackDeliveredAt,
          isAckInFlight: true,
          isAckDelivered: false,
          ackFromNode: ackPath[ackHopIdx],
          ackToNode: ackPath[ackHopIdx + 1],
          ackHopProgress: ackHopFloat % 1,
          statusText: `HQ DELIVERED · ACK returning via balloon backbone (${ackPath[ackHopIdx]} → ${ackPath[ackHopIdx + 1]})`
        };
      }
      return {
        ...sosItem,
        state: 'DELIVERED',
        hopsCompleted: 4,
        progress: 1,
        deliveredAt: fwdDeliveredAt,
        ackDeliveredAt,
        isAckInFlight: false,
        isAckDelivered: true,
        statusText: 'DELIVERED & ACKNOWLEDGED · Two-way rescue confirmed via balloon'
      };
    }

    // ── FALLBACK FOR GENERIC / DYNAMIC SOS ────────────────────────────────────
    const qEnd = sosItem.t + 0.35;
    const sEnd = sosItem.t + 0.70;
    const totalHops = sosItem.path.length - 1;
    const transitStart = sEnd;
    const deliveredAt = transitStart + totalHops * hopSeconds;
    const ackPath = sosItem.ackPath || [...sosItem.path].reverse();
    const ackHops = ackPath.length - 1;
    const ackDeliveredAt = deliveredAt + ackHops * hopSeconds;

    if (t < qEnd) {
      return { ...sosItem, state: 'QUEUED', hopsCompleted: 0, isAckInFlight: false, isAckDelivered: false };
    }
    if (t < sEnd) {
      return { ...sosItem, state: 'STORED', hopsCompleted: 0, isAckInFlight: false, isAckDelivered: false };
    }
    if (t < deliveredAt) {
      const elapsed = t - transitStart;
      const hopFloat = elapsed / hopSeconds;
      const hopIdx = Math.min(totalHops - 1, Math.floor(hopFloat));
      return {
        ...sosItem,
        state: 'SENT_TO_MESH',
        hopsCompleted: hopIdx,
        fromNode: sosItem.path[hopIdx],
        toNode: sosItem.path[hopIdx + 1],
        hopProgress: hopFloat % 1,
        deliveredAt,
        isAckInFlight: false,
        isAckDelivered: false
      };
    }
    if (t < ackDeliveredAt) {
      const ackElapsed = t - deliveredAt;
      const ackHopFloat = ackElapsed / hopSeconds;
      const ackHopIdx = Math.min(ackHops - 1, Math.floor(ackHopFloat));
      return {
        ...sosItem,
        state: 'DELIVERED',
        hopsCompleted: totalHops,
        deliveredAt,
        ackDeliveredAt,
        isAckInFlight: true,
        isAckDelivered: false,
        ackFromNode: ackPath[ackHopIdx],
        ackToNode: ackPath[ackHopIdx + 1],
        ackHopProgress: ackHopFloat % 1
      };
    }
    return {
      ...sosItem,
      state: 'DELIVERED',
      hopsCompleted: totalHops,
      deliveredAt,
      ackDeliveredAt,
      isAckInFlight: false,
      isAckDelivered: true
    };
  }

  /**
   * Reconstruct clean snapshot of all nodes, towers, aerials, edges, and SOS at time t
   */
  reconstructStateAt(t) {
    const activeNodes = new Map();
    this.scenario.nodes.forEach(n => {
      activeNodes.set(n.id, {
        ...n,
        status: 'online',
        visible: !n.hidden,
        flightProgress: n.hidden ? 0 : 1,
        batteryStatus: 'Nominal (illustrative)'
      });
    });

    let towersOnline = this.activeMode === 'sandbox' ? false : true;
    let currentPhase = this.scenario.timeline[0];
    let simClock = this.activeMode === 'sandbox' ? 'SANDBOX ACTIVE' : this.scenario.timeline[0].simClock;
    const activeAerials = { drones: 'idle', balloons: 'idle' };

    this.scenario.timeline.forEach(item => {
      if (item.t <= t) {
        if (item.simClock && this.activeMode !== 'sandbox') simClock = item.simClock;
        if (item.type === 'phase') currentPhase = item;
        if (this.activeMode === 'sandbox') {
          towersOnline = false;
        } else if (item.type === 'towers' && item.status === 'offline') {
          towersOnline = false;
        }

        if (item.type === 'node_status' && activeNodes.has(item.id)) {
          activeNodes.get(item.id).status = item.status;
          activeNodes.get(item.id).reason = item.reason;
        }

        // Aerial lifecycle handling in With-Mesh mode
        if (this.withMesh) {
          if (item.type === 'drones_launch') {
            const p = Math.min(1, Math.max(0, (t - item.t) / (item.flightSeconds || 6)));
            activeAerials.drones = p < 1 ? 'launching' : 'online';
            item.ids.forEach(id => {
              if (activeNodes.has(id)) {
                activeNodes.get(id).visible = true;
                activeNodes.get(id).flightProgress = p;
              }
            });
          }

          if (item.type === 'drones_online') {
            activeAerials.drones = 'online';
            item.ids.forEach(id => {
              if (activeNodes.has(id)) {
                activeNodes.get(id).visible = true;
                activeNodes.get(id).flightProgress = 1;
              }
            });
          }

          if (item.type === 'balloons_launch') {
            const p = Math.min(1, Math.max(0, (t - item.t) / (item.riseSeconds || 8)));
            activeAerials.balloons = p < 1 ? 'rising' : 'online';
            item.ids.forEach(id => {
              if (activeNodes.has(id)) {
                activeNodes.get(id).visible = true;
                activeNodes.get(id).flightProgress = p;
              }
            });
          }

          if (item.type === 'balloons_online') {
            activeAerials.balloons = 'online';
            item.ids.forEach(id => {
              if (activeNodes.has(id)) {
                activeNodes.get(id).visible = true;
                activeNodes.get(id).flightProgress = 1;
              }
            });
          }

          if (item.type === 'drones_recall') {
            const p = Math.min(1, Math.max(0, (t - item.t) / (item.flightSeconds || 5)));
            activeAerials.drones = p < 1 ? 'recalling' : 'landed';
            item.ids.forEach(id => {
              if (activeNodes.has(id)) {
                activeNodes.get(id).visible = p < 1;
                activeNodes.get(id).flightProgress = 1 - p;
              }
            });
          }
        }
      }
    });

    // Drone Low-Battery Warning (t=74s to t=83s) before recall
    if (this.withMesh) {
      ['DR1', 'DR2', 'DR3', 'DR4'].forEach(id => {
        if (activeNodes.has(id) && t >= 74 && t <= 83) {
          activeNodes.get(id).batteryStatus = 'LOW (illustrative — returning to base)';
        }
      });
    }

    // Apply dynamic geographic flood inundation rule (from scenario)
    if (activeNodes.has('N3') && t >= 21.0) {
      activeNodes.get('N3').status = 'down';
      activeNodes.get('N3').reason = 'Submerged by Bagmati flash surge (3.2m water)';
    }

    // Apply manual aerial deployments (Tactical Sandbox)
    this.manualAerialDeployed.forEach(id => {
      if (activeNodes.has(id)) {
        activeNodes.get(id).visible = true;
        activeNodes.get(id).status = 'online';
        activeNodes.get(id).flightProgress = 1;
      }
    });

    // Merge dynamically injected nodes (Tactical Sandbox)
    this.dynamicNodes.forEach((dynNode, id) => {
      if (!this.manualKilledNodes.has(id)) {
        const beacon = this.survivorBeacons.get(id);
        activeNodes.set(id, {
          ...dynNode,
          isAcknowledged: Boolean(beacon?.isAcknowledged),
          storedInFlash: Boolean(beacon?.storedInFlash),
          beaconAttempts: beacon?.beaconAttempts || 0
        });
      }
    });

    // Merge dynamically injected drones and balloons (Tactical Sandbox)
    this.dynamicDrones.forEach((drone, id) => {
      if (!this.manualKilledNodes.has(id)) {
        activeNodes.set(id, { ...drone });
      }
    });
    this.dynamicBalloons.forEach((balloon, id) => {
      if (!this.manualKilledNodes.has(id)) {
        activeNodes.set(id, { ...balloon });
      }
    });

    // Apply manual user overrides (Simulate Disaster / 'K' key / Submerge Relay Tool)
    this.manualKilledNodes.forEach(id => {
      if (activeNodes.has(id)) {
        const nodeObj = activeNodes.get(id);
        nodeObj.status = 'down';
        nodeObj.reason = 'Manual disaster trigger';
        if (nodeObj.role === 'drone' || nodeObj.role === 'balloon') {
          nodeObj.visible = false;
        }
      }
    });

    // N1 survivor distress cycles across timeline parts:
    // - In sandbox mode: determined dynamically by survivorBeacons ACK receipt
    // - In replay mode:
    //   - t < 12.65: Active distress before SOS1 ACK arrives (RED)
    //   - 12.65 <= t < 18.0: SOS1 confirmed by ACK arrival at N1 (GREEN)
    //   - 18.0 <= t < 58.8: Reset to RED for Part 2! Message gets stuck at N2, drone bridges, balloon takes over
    //   - t >= 58.8: Balloon ACK arrives at N1! Confirmed (GREEN)
    if (activeNodes.has('N1')) {
      let isN1Ack = false;
      const n1Beacon = this.survivorBeacons.get('N1');
      if (this.activeMode === 'sandbox') {
        isN1Ack = Boolean(n1Beacon?.isAcknowledged);
      } else if (this.withMesh) {
        if (t >= 12.65 && t < 18.0) {
          isN1Ack = true;
        } else if (t >= 58.8) {
          isN1Ack = true;
        }
      }
      activeNodes.get('N1').isAcknowledged = isN1Ack;
      activeNodes.get('N1').storedInFlash = Boolean(n1Beacon?.storedInFlash);
      activeNodes.get('N1').beaconAttempts = n1Beacon?.beaconAttempts || 0;
    }

    // Compute active edges for Map and Sidebar (static edges + dynamic edges)
    const allEdges = [...this.scenario.edges, ...this.dynamicEdges];
    const activeEdges = allEdges.map(edge => {
      const nodeA = activeNodes.get(edge.a);
      const nodeB = activeNodes.get(edge.b);
      const endpointsOnline =
        nodeA && nodeB &&
        nodeA.visible && nodeB.visible &&
        nodeA.status === 'online' && nodeB.status === 'online' &&
        nodeA.flightProgress >= 1 && nodeB.flightProgress >= 1;

      return {
        ...edge,
        active: this.withMesh && Boolean(endpointsOnline)
      };
    });

    // Evaluate all SOS messages up to t (scenario timeline + dynamic user SOS)
    const sosStates = [];
    const deliveredSos = [];
    const allSos = this.activeMode === 'sandbox'
      ? [...this.dynamicSosList]
      : [
          ...this.scenario.timeline.filter(item => item.type === 'sos'),
          ...this.dynamicSosList
        ];
    allSos.forEach(sosItem => {
      if (sosItem.isDynamic) {
        sosStates.push(sosItem);
        if (sosItem.state === 'DELIVERED') deliveredSos.push(sosItem);
      } else {
        const s = this.getSosStateAt(sosItem, t);
        if (s) {
          sosStates.push(s);
          if (s.state === 'DELIVERED') deliveredSos.push(s);
        }
      }
    });

    return {
      t,
      simClock,
      phase: currentPhase,
      towersOnline,
      nodes: Array.from(activeNodes.values()),
      edges: activeEdges,
      aerials: activeAerials,
      sosStates,
      deliveredSos,
      withMesh: this.withMesh
    };
  }

  /**
   * Dispatch single timeline event to listeners
   */
  dispatchEvent(item) {
    if (!this.withMesh) {
      if (item.type === 'sos') {
        this.emit('sos_failed', {
          id: item.id,
          reason: 'Phone network DOWN. No cellular or internet route available.',
          simClock: item.simClock
        });
        return;
      }
      if (item.type === 'drones_launch' || item.type === 'balloons_launch') {
        return;
      }
    }

    switch (item.type) {
      case 'phase':
        this.emit('phase', item);
        break;
      case 'towers':
        this.emit('towers', item);
        break;
      case 'node_status':
        this.emit('node_status', item);
        break;
      case 'sos':
        this.emit('sos', item);
        break;
      case 'drones_launch':
      case 'drones_online':
      case 'drones_recall':
      case 'balloons_launch':
      case 'balloons_online':
        this.emit('aerial', item);
        break;
      case 'summary':
        this.emit('summary', item);
        break;
      default:
        this.emit(item.type, item);
    }
  }
}

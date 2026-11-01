// Algorithmic RF Mesh Optimizer & Dynamic Aerial Dispatcher
// Analyzes live network topology, detects signal voids caused by submerged nodes,
// and computes optimal 3D coordinates for Aerial Drones and Tethered Balloons.
// Enforces 6-Drone fleet limit and automatic Aerostat Balloon relief handover.

export class MeshOptimizer {
  constructor(scenarioNodes) {
    this.scenarioNodes = scenarioNodes || [];
    this.MAX_DRONES = 6;
  }

  /**
   * Spherical distance in meters between two [lon, lat] coordinates
   */
  distanceMeters(lon1, lat1, lon2, lat2) {
    const R = 6371e3; // Earth radius in meters
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Partition online nodes into reachable component from Base Camp (N8)
   * and disconnected clusters that require aerial bridging.
   */
  findClusters(activeNodes, activeEdges, baseCampId = 'N8') {
    const onlineNodes = activeNodes.filter(n => n.status === 'online' && n.visible !== false);
    const nodeMap = new Map(onlineNodes.map(n => [n.id, n]));

    if (!nodeMap.has(baseCampId)) {
      return { reachable: new Set(), isolatedClusters: [], nodeMap };
    }

    // 1. Build adjacency graph using only active edges between online nodes
    const adj = new Map();
    onlineNodes.forEach(n => adj.set(n.id, []));
    activeEdges.forEach(e => {
      if (e.active && nodeMap.has(e.a) && nodeMap.has(e.b)) {
        adj.get(e.a).push(e.b);
        adj.get(e.b).push(e.a);
      }
    });

    // 2. Find all nodes reachable from Base Camp (BFS)
    const reachable = new Set();
    const queue = [baseCampId];
    reachable.add(baseCampId);

    while (queue.length > 0) {
      const curr = queue.shift();
      const neighbors = adj.get(curr) || [];
      for (const next of neighbors) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }

    // 3. Find connected components among isolated nodes
    const unvisitedIsolated = new Set(onlineNodes.filter(n => !reachable.has(n.id)).map(n => n.id));
    const isolatedClusters = [];

    while (unvisitedIsolated.size > 0) {
      const startId = unvisitedIsolated.values().next().value;
      unvisitedIsolated.delete(startId);

      const cluster = [nodeMap.get(startId)];
      const cQueue = [startId];

      while (cQueue.length > 0) {
        const curr = cQueue.shift();
        const neighbors = adj.get(curr) || [];
        for (const next of neighbors) {
          if (unvisitedIsolated.has(next)) {
            unvisitedIsolated.delete(next);
            cluster.push(nodeMap.get(next));
            cQueue.push(next);
          }
        }
      }

      // Prioritize clusters containing survivor dongles
      const hasSurvivor = cluster.some(n => n.role === 'dongle' || n.isDynamic || n.id === 'N1');
      isolatedClusters.push({
        nodes: cluster,
        hasSurvivor,
        priority: hasSurvivor ? 1 : 2
      });
    }

    // Sort isolated clusters: survivor-containing clusters first
    isolatedClusters.sort((a, b) => a.priority - b.priority);

    return { reachable, isolatedClusters, nodeMap };
  }

  /**
   * Determine all coverage gaps across the entire topology.
   * For each isolated cluster, calculates the optimal aerial bridge points.
   */
  detectAllCoverageGaps(activeNodes, activeEdges, baseCampId = 'N8') {
    const { reachable, isolatedClusters, nodeMap } = this.findClusters(activeNodes, activeEdges, baseCampId);

    if (isolatedClusters.length === 0) {
      return []; // Fully connected
    }

    const gaps = [];

    isolatedClusters.forEach((clusterObj, cIdx) => {
      // Find closest node pair between this cluster and reachable component
      let minGapDist = Infinity;
      let bestPair = null;

      clusterObj.nodes.forEach(isoNode => {
        reachable.forEach(reachId => {
          const reachNode = nodeMap.get(reachId);
          if (!reachNode) return;
          const dist = this.distanceMeters(isoNode.lon, isoNode.lat, reachNode.lon, reachNode.lat);
          if (dist < minGapDist) {
            minGapDist = dist;
            bestPair = { isolated: isoNode, reachable: reachNode, dist };
          }
        });
      });

      if (!bestPair) return;

      // Calculate how many aerial relay points are needed
      // LoRa ground-to-drone range <= 850m. Drone-to-drone <= 1200m.
      const hopDist = 800;
      const numPoints = Math.max(1, Math.min(4, Math.ceil(bestPair.dist / hopDist) - 1));

      for (let i = 1; i <= numPoints; i++) {
        const fraction = i / (numPoints + 1);
        const lon = bestPair.isolated.lon + fraction * (bestPair.reachable.lon - bestPair.isolated.lon);
        const lat = bestPair.isolated.lat + fraction * (bestPair.reachable.lat - bestPair.isolated.lat);

        gaps.push({
          clusterIndex: cIdx,
          pointIndex: i,
          totalPointsInGap: numPoints,
          lon,
          lat,
          alt_m: 80,
          targetZone: `Bridge ${bestPair.isolated.id} ↔ ${bestPair.reachable.id} (P${i})`,
          gapDistanceMeters: Math.round(bestPair.dist),
          hasSurvivor: clusterObj.hasSurvivor,
          pair: { isolated: bestPair.isolated, reachable: bestPair.reachable }
        });
      }
    });

    return gaps;
  }

  /**
   * Legacy wrapper for backward compatibility with autoBridgeGaps callers
   */
  detectCoverageGaps(activeNodes, activeEdges, baseCampId = 'N8') {
    return this.detectAllCoverageGaps(activeNodes, activeEdges, baseCampId);
  }

  /**
   * Plan optimal rearrangement and balloon promotion under 6-drone limit
   * @param {Array} currentDrones - Array of currently active dynamic drones
   * @param {Array} requiredGaps - Array of target bridge coordinates
   * @param {number} maxDrones - Maximum drone fleet capacity (default 6)
   */
  computeRearrangementPlan(currentDrones, requiredGaps, maxDrones = 6) {
    const drones = [...currentDrones];
    const gaps = [...requiredGaps];

    const plan = {
      balloonsToDeploy: [], // [{ lon, lat, replacesDroneId, reason }]
      dronesToReposition: [], // [{ droneId, from: [lon, lat], to: [lon, lat], targetZone, linkedNodeIds }]
      dronesToDispatch: [], // [{ lon, lat, targetZone, linkedNodeIds }]
      dronesToKeep: [], // Drones that remain at their current optimal stations
      summary: ''
    };

    if (gaps.length === 0) {
      plan.summary = 'Mesh is 100% connected. All nodes reachable.';
      return plan;
    }

    const unassignedGaps = [...gaps];
    const availableDrones = [...drones];

    // 1. Identify drones that are ALREADY positioned close (< 280m) to a needed gap point
    const remainingDrones = [];
    availableDrones.forEach(drone => {
      const closeGapIdx = unassignedGaps.findIndex(g =>
        this.distanceMeters(drone.lon, drone.lat, g.lon, g.lat) <= 280
      );

      if (closeGapIdx !== -1) {
        const gap = unassignedGaps.splice(closeGapIdx, 1)[0];
        plan.dronesToKeep.push({ drone, gap });
      } else {
        remainingDrones.push(drone);
      }
    });

    // 2. How many drones can we still assign before hitting the 6-drone fleet limit?
    const keptCount = plan.dronesToKeep.length;
    let freeDroneQuota = Math.max(0, maxDrones - keptCount);

    // 3. For any remaining drones, rearrange them to unassigned gaps first
    while (remainingDrones.length > 0 && unassignedGaps.length > 0 && freeDroneQuota > 0) {
      const drone = remainingDrones.shift();
      const gap = unassignedGaps.shift();
      plan.dronesToReposition.push({
        droneId: drone.id,
        drone,
        from: [drone.lon, drone.lat],
        to: [gap.lon, gap.lat],
        targetZone: gap.targetZone,
        linkedNodeIds: gap.pair ? [gap.pair.isolated.id, gap.pair.reachable.id] : undefined
      });
      freeDroneQuota--;
    }

    // 4. If we still have unassigned gaps, and we can dispatch new drones up to fleet limit of 6:
    while (unassignedGaps.length > 0 && freeDroneQuota > 0) {
      const gap = unassignedGaps.shift();
      plan.dronesToDispatch.push({
        lon: gap.lon,
        lat: gap.lat,
        targetZone: gap.targetZone,
        linkedNodeIds: gap.pair ? [gap.pair.isolated.id, gap.pair.reachable.id] : undefined
      });
      freeDroneQuota--;
    }

    // 5. IF THE NETWORK IS STILL NOT GETTING BUILT (unassigned gaps remain because of 6-drone limit):
    // "if the network is not getting built we will free the drone automatically by setting a balloon there."
    // We convert/promote currently stationed drones into 100m Aerostat Balloons!
    // This anchors the link permanently with an aerostat balloon and FREES the drone to bridge the next gap!
    while (unassignedGaps.length > 0) {
      const gap = unassignedGaps.shift();

      // Find an established drone to relieve (from kept or repositioned drones)
      const droneToRelieve = plan.dronesToKeep.shift() || plan.dronesToReposition.shift();

      if (droneToRelieve) {
        const drone = droneToRelieve.drone || droneToRelieve;
        const droneId = drone.id || droneToRelieve.droneId;
        // Deploy balloon at the drone's position to take over its link and free the drone
        plan.balloonsToDeploy.push({
          lon: drone.lon,
          lat: drone.lat,
          replacesDroneId: droneId,
          reason: `Auto-Relief: Freed ${droneId} to bridge isolated sector (${gap.targetZone})`
        });

        // The freed drone immediately flies to the unassigned gap!
        plan.dronesToDispatch.push({
          lon: gap.lon,
          lat: gap.lat,
          targetZone: gap.targetZone,
          linkedNodeIds: gap.pair ? [gap.pair.isolated.id, gap.pair.reachable.id] : undefined,
          freedFromId: droneId
        });
      } else {
        // If no drone can be relieved, deploy a balloon directly at the gap!
        plan.balloonsToDeploy.push({
          lon: gap.lon,
          lat: gap.lat,
          reason: `Direct Aerostat Anchor: Solved gap (${gap.targetZone}) beyond 6-drone limit!`
        });
      }
    }

    plan.summary = `Fleet Optimized (6-Drone Max): ${plan.dronesToReposition.length} rearranged, ${plan.dronesToDispatch.length} dispatched, ${plan.balloonsToDeploy.length} aerostat balloon relief handovers.`;

    return plan;
  }
}

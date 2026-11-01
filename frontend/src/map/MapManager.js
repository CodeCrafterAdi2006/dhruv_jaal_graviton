import scenarioData from '../data/scenario.json';

// Use global maplibregl from window (loaded cleanly with pre-packaged worker)
const getMapLibre = () => window.maplibregl;

export class MapManager {
  constructor(containerId = 'map') {
    this.containerId = containerId;
    this.map = null;
    this.scenario = scenarioData;
    this.isOfflineMode = false;

    // Hydrodynamic Riverbed & Flood Inundation Stages (Kathmandu Valley Sep 2024)
    // Stage 1: Natural Bagmati & Bishnumati riverbed channel corridor (~50-80m width)
    // Stage 2: Teku Dobhan confluence flash breach (engulfs Teku volunteer N3 at lat 27.6950, lon 85.3060)
    // Stage 3: Full valley crest inundation (engulfs Thapathali school N6 at lat 27.6925, lon 85.3150)
    this.floodStages = {
      channel: [
        [85.2935, 27.6845],
        [85.3035, 27.6838],
        [85.3120, 27.6890],
        [85.3190, 27.6938],
        [85.3175, 27.6948],
        [85.3090, 27.6908],
        [85.3038, 27.6855],
        [85.2945, 27.6865]
      ],
      tekuBreach: [
        [85.2938, 27.6842],
        [85.3038, 27.6834],
        [85.3135, 27.6885],
        [85.3195, 27.6940],
        [85.3135, 27.6955],
        [85.3060, 27.6975], // Teku volunteer N3 engulfed!
        [85.3005, 27.6930],
        [85.2942, 27.6875]
      ],
      maxFlood: [
        [85.2930, 27.6840],
        [85.3040, 27.6830],
        [85.3180, 27.6880],
        [85.3200, 27.6945], // Thapathali bridge & school N6 engulfed!
        [85.3120, 27.6960],
        [85.3060, 27.6975],
        [85.3000, 27.6935],
        [85.2940, 27.6890]
      ]
    };
  }

  init() {
    const { center, zoom, pitch, bearing } = this.scenario.meta.map;

    // High-contrast Tactical 3D Style (ESRI base + AWS Terrarium 3D DEM + OpenFreeMap 3D buildings)
    const darkStyle = {
      version: 8,
      light: {
        anchor: 'viewport',
        color: '#dbeafe',
        intensity: 0.65,
        position: [1.5, 210, 35]
      },
      sources: {
        'esri-dark': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: '&copy; Esri, DeLorme, NAVTEQ'
        },
        'kathmandu-dem': {
          type: 'raster-dem',
          tiles: [
            'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
          ],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        },
        'openmaptiles': {
          type: 'vector',
          url: 'https://tiles.openfreemap.org/planet'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#060d1a' }
        },
        {
          id: 'dark-tiles',
          type: 'raster',
          source: 'esri-dark',
          minzoom: 0,
          maxzoom: 16
        },
        {
          id: '3d-buildings',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': '#081220',
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['zoom'],
              13, 0,
              13.5, ['coalesce', ['get', 'render_height'], ['*', ['coalesce', ['get', 'levels'], 2], 2.8], 6]
            ],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.28
          }
        }
      ]
    };

    const ML = getMapLibre();
    this.map = new ML.Map({
      container: this.containerId,
      style: darkStyle,
      center: [center.lon, center.lat], // MapLibre takes [longitude, latitude]
      zoom: zoom || 14.3,
      pitch: pitch || 52,               // 52-degree 3D tilted camera angle
      bearing: bearing || -15,          // Oriented toward Bagmati basin
      attributionControl: false
    });

    // Add minimal scale bar & navigation
    this.map.addControl(new ML.AttributionControl({ compact: true }), 'bottom-right');
    this.map.addControl(new ML.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    this.map.on('error', (e) => {
      // Ignore routine raster tile edge misses or terrain tile edges
      if (e.sourceId === 'esri-dark' || e.sourceId === 'kathmandu-dem' || e.sourceId === 'openmaptiles') return;
      if (e.error) {
        console.debug('[MapManager] MapLibre event:', e.error.message || e.error);
      }
    });

    // Step 1.1: 3D Himalayan DEM Terrain & Sky Fog setup on map load
    const setup3DTerrain = () => {
      try {
        if (this.map.getSource('kathmandu-dem')) {
          this.map.setTerrain({ source: 'kathmandu-dem', exaggeration: 1.25 });
        }
        if (typeof this.map.setSky === 'function') {
          this.map.setSky({
            'sky-color': '#060d1a',
            'fog-color': '#0d1829',
            'fog-ground-blend': 0.7
          });
        }
        // Directional 3D light for shaded water faces and building walls
        if (typeof this.map.setLight === 'function') {
          this.map.setLight({
            anchor: 'viewport',
            color: '#dbeafe',
            intensity: 0.65,
            position: [1.5, 210, 35]
          });
        }
      } catch (err) {
        console.warn('[MapManager] 3D Terrain init note:', err.message);
      }
      this.renderZones();
    };

    if (this.map.loaded()) {
      setup3DTerrain();
    } else {
      this.map.once('load', setup3DTerrain);
    }

    return Promise.resolve(this.map);
  }

  /**
   * Render Flood Zone Polygon (FZ1) and Safe Ground Circle (SZ1)
   */
  renderZones() {
    if (!this.map) return;
    try {
      if (this.map.getSource('flood-zone-source')) return; // Already rendered

      // 1. Hydrodynamic Flood Zone (FZ1 along Bagmati River Basin)
      const initialChannel = this.floodStages.channel;
      const initialCoords = [...initialChannel, initialChannel[0]];

      this.map.addSource('flood-zone-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { label: 'Hydrodynamic Flood Inundation (Sep 2024)' },
          geometry: {
            type: 'Polygon',
            coordinates: [initialCoords]
          }
        }
      });

      // Translucent deep river sediment base
      this.map.addLayer({
        id: 'flood-zone-fill',
        type: 'fill',
        source: 'flood-zone-source',
        paint: {
          'fill-color': '#0a2540',
          'fill-opacity': 0.28
        }
      });

      // Crest Surge Boundary Line (frothing foam edge)
      this.map.addLayer({
        id: 'flood-zone-line',
        type: 'line',
        source: 'flood-zone-source',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 2.2,
          'line-dasharray': [4, 2],
          'line-opacity': 0.50
        }
      });

      // 3D Volumetric Extrusion Layer (Dynamic flood depth with lighting)
      this.map.addLayer({
        id: 'flood-zone-3d',
        type: 'fill-extrusion',
        source: 'flood-zone-source',
        paint: {
          'fill-extrusion-color': '#0284c7',
          'fill-extrusion-height': 0,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0
        }
      });

      // 2. Safe Ground Circle (SZ1 around Base Camp N8)
      const safeZone = this.scenario.zones.find(z => z.type === 'safe');
      if (safeZone) {
        const circleGeoJSON = this.createGeoJSONCircle(
          [safeZone.center.lon, safeZone.center.lat],
          safeZone.radius_m || 350
        );

        this.map.addSource('safe-zone-source', {
          type: 'geojson',
          data: circleGeoJSON
        });

        this.map.addLayer({
          id: 'safe-zone-fill',
          type: 'fill',
          source: 'safe-zone-source',
          paint: {
            'fill-color': '#34C759',
            'fill-opacity': 0.12
          }
        });

        this.map.addLayer({
          id: 'safe-zone-line',
          type: 'line',
          source: 'safe-zone-source',
          paint: {
            'line-color': '#34C759',
            'line-width': 1.5,
            'line-dasharray': [4, 4],
          }
        });
      }
    } catch (e) {
      setTimeout(() => this.renderZones(), 100);
    }
  }

  /**
   * Helper to linearly interpolate between two equal-length polygon rings
   */
  interpolatePolygon(polyA, polyB, t) {
    const clamped = Math.max(0, Math.min(1, t));
    return polyA.map((pointA, idx) => {
      const pointB = polyB[idx] || pointA;
      return [
        pointA[0] + (pointB[0] - pointA[0]) * clamped,
        pointA[1] + (pointB[1] - pointA[1]) * clamped
      ];
    });
  }

  /**
   * Step 1.3: Hydrodynamic multi-stage flood spreading, 3D depth extrusion, and recession cycle
   * Based on real Kathmandu Valley Bagmati riverbed hydrology (FloodGraph architecture)
   */
  updateFloodLevel(t = 0) {
    if (!this.map || !this.map.getSource('flood-zone-source')) return;

    const { channel, tekuBreach, maxFlood } = this.floodStages;
    let currentPoly = channel;
    let height = 0;
    let opacity = 0;
    let lineOpacity = 0.40;
    let crestLineWidth = 1.8;

    if (t <= 6) {
      // Stage 0: Dry riverbed baseline before cloudburst
      currentPoly = channel;
      height = 0;
      opacity = 0;
      lineOpacity = 0.25;
    } else if (t <= 18) {
      // Stage 1: River channel swell (t=6 to 18) - rising water inside Bagmati banks
      const p = (t - 6) / 12;
      currentPoly = channel;
      height = p * 1.5; // Up to 1.5m in channel
      opacity = 0.15 + p * 0.20;
      lineOpacity = 0.35 + p * 0.30;
      crestLineWidth = 2.0;
    } else if (t <= 32) {
      // Stage 2: Teku Dobhan confluence flash breach (t=18 to 32) -> Engulfs Teku N3 at t=22
      const p = (t - 18) / 14;
      currentPoly = this.interpolatePolygon(channel, tekuBreach, p);
      height = 1.5 + p * 1.3; // 1.5m to 2.8m
      opacity = 0.35 + p * 0.15;
      lineOpacity = 0.65 + p * 0.20;
      crestLineWidth = 2.4;
    } else if (t <= 44) {
      // Stage 3: Inundation surges into Thapathali & Balkhu (t=32 to 44) -> Engulfs N6 at t=40
      const p = (t - 32) / 12;
      currentPoly = this.interpolatePolygon(tekuBreach, maxFlood, p);
      height = 2.8 + p * 1.4; // 2.8m to 4.2m peak
      opacity = 0.50 + p * 0.08;
      lineOpacity = 0.85 + p * 0.10;
      crestLineWidth = 2.8;
    } else if (t <= 78) {
      // Stage 4: Peak Inundation Plateau with dynamic micro-shimmer
      currentPoly = maxFlood;
      const shimmer = Math.sin(Date.now() * 0.003) * 0.03;
      height = 4.2;
      opacity = 0.56 + shimmer;
      lineOpacity = 0.90;
      crestLineWidth = 2.5;
    } else if (t <= 96) {
      // Stage 5: Recession Cycle (t=78 to 96) -> Weather clears, water recedes from 4.2m down to 1.2m
      const p = (t - 78) / 18;
      currentPoly = this.interpolatePolygon(maxFlood, channel, p * 0.65);
      height = 4.2 - (p * 3.0); // 4.2m down to 1.2m
      opacity = 0.56 - (p * 0.30);
      lineOpacity = 0.90 - (p * 0.50);
      crestLineWidth = 2.0;
    } else {
      // Post-flood residual basin
      currentPoly = this.interpolatePolygon(maxFlood, channel, 0.65);
      height = 1.2;
      opacity = 0.26;
      lineOpacity = 0.40;
      crestLineWidth = 1.8;
    }

    // Update dynamic GeoJSON geometry coordinates
    const closedCoords = [...currentPoly, currentPoly[0]];
    const source = this.map.getSource('flood-zone-source');
    if (source) {
      source.setData({
        type: 'Feature',
        properties: { label: 'Dynamic Hydrodynamic Flood Inundation' },
        geometry: {
          type: 'Polygon',
          coordinates: [closedCoords]
        }
      });
    }

    // Update 3D Volumetric Extrusion, Shimmer & Shoreline Crest Line
    if (this.map.getLayer('flood-zone-3d')) {
      this.map.setPaintProperty('flood-zone-3d', 'fill-extrusion-height', height);
      this.map.setPaintProperty('flood-zone-3d', 'fill-extrusion-opacity', opacity);
    }
    if (this.map.getLayer('flood-zone-line')) {
      this.map.setPaintProperty('flood-zone-line', 'line-opacity', lineOpacity);
      this.map.setPaintProperty('flood-zone-line', 'line-width', crestLineWidth);
    }
  }

  /**
   * Helper to generate a smooth GeoJSON polygon circle from center and radius in meters
   */
  createGeoJSONCircle(center, radiusInMeters, points = 64) {
    const coords = {
      latitude: center[1],
      longitude: center[0]
    };

    const km = radiusInMeters / 1000;
    const ret = [];
    const distanceX = km / (111.320 * Math.cos((coords.latitude * Math.PI) / 180));
    const distanceY = km / 110.574;

    for (let i = 0; i < points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceX * Math.cos(theta);
      const y = distanceY * Math.sin(theta);
      ret.push([coords.longitude + x, coords.latitude + y]);
    }
    ret.push(ret[0]);

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [ret]
      }
    };
  }

  /**
   * Resilient offline fallback: Switches to tactical dark canvas grid if map tiles fail
   */
  enableOfflineFallback() {
    if (this.isOfflineMode) return;
    this.isOfflineMode = true;
    console.warn('[MapManager] Basemap network failure detected. Enabling tactical offline grid.');

    const mapContainer = document.getElementById(this.containerId);
    if (mapContainer) {
      mapContainer.style.background = 'radial-gradient(circle at center, #0e1c33 0%, #060d1a 100%)';
    }

    // Add subtle UI indicator
    let badge = document.getElementById('offline-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'offline-badge';
      badge.innerText = '● Tactical Grid Active (Offline Mode)';
      badge.style.cssText = `
        position: absolute;
        bottom: 16px;
        left: 120px;
        background: rgba(245, 185, 66, 0.15);
        color: #F5B942;
        border: 1px solid rgba(245, 185, 66, 0.4);
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-family: var(--font-mono);
        z-index: 1000;
      `;
      document.getElementById('map-viewport')?.appendChild(badge);
    }
  }

  getMap() {
    return this.map;
  }
}

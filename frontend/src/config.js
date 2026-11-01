// Configuration and RF Calibration for Dhruva Jaal LoRa Mesh
// Sourced from Semtech SX1278 Datasheet & LoRaWAN Technical Specifications

export const RF_CONFIG = {
  frequencyMhz: 433.0,
  bandwidthKhz: 125,
  spreadingFactor: 10,
  codingRate: '4/5',
  txPowerDbm: 14,
  
  // SX1278 LF Port Offset (from datasheet section 5.5.5)
  rssiOffsetLf: -164,

  // Log-distance path loss calibration: d = 10 ^ ((RSSI_1M - RSSI) / (10 * n))
  // Tuned for Kathmandu Valley flood basin:
  rssi1mGround: -32,      // Calibrated 1-meter RSSI for ground-to-ground dongles
  pathLossNGround: 2.35,  // Path loss exponent for ground mesh in urban/flooded valley

  rssi1mAerial: -28,      // Calibrated 1-meter RSSI for elevated balloon/drone
  pathLossNAerial: 1.95,  // Near-free-space exponent for elevated Line-of-Sight (100m tether)

  // Hardware Metadata for UI popovers (matching technical_details.md)
  mcu: 'ESP32-C3 (RISC-V 160MHz)',
  radio: 'Semtech SX1278 LoRa',
  gps: 'u-blox NEO-6M',
  crcStandard: 'CRC-8',
  ttlDefault: 10,
  maxActiveNeighbors: 4,
  sensitivityFloorDbm: -134 // At SF10 / 125 kHz
};

// RSSI Color Bands from scenario spec
export const RSSI_BANDS = [
  { name: 'strong', minDbm: -80, maxDbm: -60, color: '#2ee66b', label: 'Strong (-60 to -80 dBm)' },
  { name: 'medium', minDbm: -100, maxDbm: -81, color: '#ffb020', label: 'Medium (-81 to -100 dBm)' },
  { name: 'weak', minDbm: -120, maxDbm: -101, color: '#ff3b3b', label: 'Weak (-101 to -120 dBm)' }
];

/**
 * Calculate estimated distance from RSSI using log-distance path loss model
 * @param {number} rssi - Signal strength in dBm
 * @param {boolean} isAerial - Whether one of the nodes is elevated (drone or balloon)
 * @returns {number} Estimated distance in meters
 */
export function estimateDistanceMeters(rssi, isAerial = false) {
  const ref1m = isAerial ? RF_CONFIG.rssi1mAerial : RF_CONFIG.rssi1mGround;
  const n = isAerial ? RF_CONFIG.pathLossNAerial : RF_CONFIG.pathLossNGround;
  const dist = Math.pow(10, (ref1m - rssi) / (10 * n));
  return Math.round(dist);
}

/**
 * Compute SX1278 Packet RSSI from register values
 * @param {number} regPktRssiValue - Byte from register 0x1A
 * @param {number} [regPktSnrValue] - Signed 2's complement byte from register 0x19
 * @returns {number} RSSI in dBm
 */
export function computeSx1278Rssi(regPktRssiValue, regPktSnrValue = 0) {
  const snrDb = regPktSnrValue * 0.25;
  if (snrDb >= 0) {
    return RF_CONFIG.rssiOffsetLf + regPktRssiValue;
  }
  return RF_CONFIG.rssiOffsetLf + regPktRssiValue + snrDb;
}

/**
 * Get color code for a given RSSI reading
 * @param {number} rssi - Signal strength in dBm
 * @returns {string} Hex color code
 */
export function getRssiColor(rssi) {
  if (rssi >= -80) return RSSI_BANDS[0].color; // Strong green
  if (rssi >= -100) return RSSI_BANDS[1].color; // Medium amber
  return RSSI_BANDS[2].color; // Weak red
}

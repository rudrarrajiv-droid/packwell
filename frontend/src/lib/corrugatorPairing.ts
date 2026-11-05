/**
 * Corrugator Machine Stand Pairing Rules
 * 
 * 1. 2-Ply Job:
 *    - Layers: [Layer 0, Layer 1]
 *    - Runs concurrently on single facer (Stand 1 + Stand 2).
 *    - Layer 0 and Layer 1 CANNOT share a physical reel.
 * 
 * 2. 3-Ply Job:
 *    - Layer 0 (Top Sheet): Standalone Sheet Cutter (1 reel).
 *    - Layer 1 & 2 (Corrugator Pair 1): Runs concurrently on single facer.
 *    - Layer 1 and Layer 2 CANNOT share a physical reel.
 *    - Leftover balance from Layer 0 CAN be used in Layer 1 or Layer 2.
 * 
 * 3. 5-Ply Job:
 *    - Layer 0: Sheet Cutter.
 *    - Layer 1 & 2 (Corrugator Pair 1): Runs concurrently. Cannot share a reel.
 *    - Layer 3 & 4 (Corrugator Pair 2): Runs concurrently. Cannot share a reel.
 *    - Leftover balance from Layer 0, 1, or 2 CAN be used in Pair 2 (Layer 3 or 4).
 * 
 * 4. 7-Ply Job:
 *    - Layer 0: Sheet Cutter.
 *    - Layer 1 & 2 (Pair 1): Cannot share a reel.
 *    - Layer 3 & 4 (Pair 2): Cannot share a reel.
 *    - Layer 5 & 6 (Pair 3): Cannot share a reel.
 *    - Leftover balances can carry over to subsequent pairs.
 */

export function getConcurrentPartnerIndices(targetIndex: number, totalLayers: number): number[] {
  if (totalLayers <= 1) return [];

  // 2-Ply Job Card: Layer 0 and Layer 1 run concurrently on single facer
  if (totalLayers === 2) {
    if (targetIndex === 0) return [1];
    if (targetIndex === 1) return [0];
    return [];
  }

  // 3-Ply, 5-Ply, 7-Ply, etc.:
  // Layer index 0 is Sheet Cutter (Top Sheet) — no concurrent corrugator partner!
  if (targetIndex === 0) {
    return [];
  }

  // Corrugator stands run in pairs starting at index 1:
  // Pair 1: [1, 2]
  // Pair 2: [3, 4]
  // Pair 3: [5, 6]
  const partnerIndex = targetIndex % 2 === 1 ? targetIndex + 1 : targetIndex - 1;
  if (partnerIndex > 0 && partnerIndex < totalLayers) {
    return [partnerIndex];
  }

  return [];
}

export function getLayerStandDescription(layerIndex: number, totalLayers: number): string {
  if (totalLayers === 2) {
    return `Corrugator Stand ${layerIndex + 1}`;
  }
  if (layerIndex === 0) {
    return 'Sheet Cutter (Top Sheet)';
  }
  const pairNum = Math.floor((layerIndex - 1) / 2) + 1;
  const standNum = ((layerIndex - 1) % 2) + 1;
  return `Corrugator Pair ${pairNum} (Stand ${standNum})`;
}


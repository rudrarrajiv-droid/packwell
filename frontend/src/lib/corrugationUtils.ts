/**
 * Corrugation & Paper Weight Calculation Utilities
 * 
 * Standard Packaging Rule:
 * In a corrugated box/board, Fluting Medium layers occur at alternating positions:
 * Layer 2, Layer 4, Layer 6 (1-based: 2, 4, 6; 0-based: 1, 3, 5).
 * Due to the wave fluting structure (corrugations), fluting medium consumes
 * +40% extra paper length compared to flat liners (Flute Take-up Factor = 1.40).
 * 
 * Therefore:
 * Effective GSM for Flute Medium = GSM * 1.40
 * (e.g. 100 GSM -> 140 GSM, 120 GSM -> 168 GSM)
 */

export function isFluteLayer(layer?: any, index?: number): boolean {
  // 1. By 1-based Layer Position: 2, 4, 6 (0-based index 1, 3, 5)
  if (typeof index === 'number' && [1, 3, 5].includes(index)) {
    return true;
  }

  // 2. By Layer Name or Paper Type
  const lName = (layer?.layerName || layer?.name || layer?.standDescription || '').toLowerCase().trim();
  if (
    lName.includes('flut') ||              // matches flute, fluting, fluted
    lName.includes('medium') ||            // matches medium, fluting medium, corrugating medium
    ['p2', 'p4', 'p6', 'l2', 'l4', 'l6', 'f1', 'f2', 'f3'].includes(lName) ||
    lName.startsWith('layer 2') ||
    lName.startsWith('layer 4') ||
    lName.startsWith('layer 6') ||
    lName === '2' ||
    lName === '4' ||
    lName === '6'
  ) {
    return true;
  }

  return false;
}

export function getEffectiveGsm(gsm: number, layer?: any, index?: number): number {
  const baseGsm = Number(gsm) || 0;
  if (baseGsm <= 0) return 0;
  return isFluteLayer(layer, index) ? baseGsm * 1.4 : baseGsm;
}

export function calculateLayerWeight(
  reelSize: number,
  cutSize: number,
  gsm: number,
  noOfPaper: number,
  layer?: any,
  index?: number
): number {
  if (reelSize <= 0 || cutSize <= 0 || gsm <= 0 || noOfPaper <= 0) return 0;
  const effGsm = getEffectiveGsm(gsm, layer, index);
  const weight = (reelSize * cutSize * effGsm) / 3100 / 500 * noOfPaper;
  return Math.round(weight * 100) / 100;
}


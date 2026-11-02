export interface JobCostingLayer {
  layerIndex: number;
  layerName: string;
  reelSize: number | string;
  reelNumber: string;
  allocatedWeight: number;
  reelRate: number; // ₹/Kg from inventory or manual
  allocatedValue: number; // allocatedWeight * reelRate
  dprWeight: number | null; // Manual entry
  dprValue: number | null; // dprWeight * reelRate
  paperWeightPerBox: number; // allocatedWeight / orderQty
  lessBoxQty: number; // max(0, orderQty - manfBoxQty)
  lessBoxWeightLoss: number; // lessBoxQty * paperWeightPerBox
  lessBoxValueLoss: number; // lessBoxWeightLoss * reelRate
}

export interface JobCostingData {
  jobCardId: string;
  jobCardNo: string;
  jobCardDate: string;
  jobName: string;
  orderBoxQty: number;
  manfBoxQty: number | null;
  saleRatePerBox?: number | null; // From PO or manual for commercial diagnosis
  layers: JobCostingLayer[];
  totalAllocatedValue: number;
  totalDprValue: number;
  totalLessBoxLoss: number;
  netProfitLoss: number | null; // Total Alloc Value - Total DPR Value - Total Less Box Loss
  isCompleted: boolean;
  notes?: string;
  lastUpdated?: string;
}


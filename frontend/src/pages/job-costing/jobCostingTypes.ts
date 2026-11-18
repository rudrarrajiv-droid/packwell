export type SaleRateSource = 'SAVED_MANUAL' | 'FINISH_GOODS' | 'MASTER_DATA' | 'PO' | 'NONE';

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
  productId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  poId?: string | null;
  poNo?: string | null;
  orderBoxQty: number;
  manfBoxQty: number | null;
  saleRatePerBox?: number | null; // Auto from Finish Goods / Master Data / PO, or manual
  saleRateSource?: SaleRateSource;
  layers: JobCostingLayer[];
  totalAllocatedWeight: number;
  totalAllocatedValue: number;
  totalDprWeight: number;
  totalDprValue: number;
  scrapPercent: number; // 5% added on (Paper Value + Conversion Cost)
  baseManufacturingCost: number; // totalDprValue + conversionCost
  scrapAmount: number; // 5% of baseManufacturingCost
  conversionRateUsed: number; // Locked rate on saved jobs, or active standard rate on pending jobs
  isConversionRateLocked: boolean;
  conversionCost: number; // totalDprWeight * conversionRateUsed
  totalManufacturingCost: number; // baseManufacturingCost + scrapAmount
  totalSaleValue: number | null; // manfBoxQty * saleRatePerBox
  totalLessBoxLoss: number;
  paperVariancePL: number | null; // Diagnostic: Total Alloc Value - Total DPR Value - Total Less Box Loss
  netProfitLoss: number | null; // Actual P/L: Total Sale Value - Total Manufacturing Cost
  isCompleted: boolean;
  notes?: string;
  lastUpdated?: string;
}

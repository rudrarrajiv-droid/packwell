export interface CorrugationPlanningRow {
  id: string;
  sNo: number;
  customerName: string;
  jobName: string;
  reelSize: number | string | null;
  cutSize: number | string | null;
  ups: number | string | null;
  fluteType: string;
  nosOfPly: number | string | null;
  boxQty: number | string | null;
  remarks: string;
}

export interface DispatchPlanItem {
  id: string;
  jobName: string;
  qty: number | string | null;
}

export interface DispatchPlanGroup {
  id: string;
  sNo: number;
  dispatchDate: string; // YYYY-MM-DD or DD-MM-YYYY
  customerName: string;
  items: DispatchPlanItem[];
}

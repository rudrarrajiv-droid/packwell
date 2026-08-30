// Firebase Data Models

// Base model for audit trailing and soft delete
export interface BaseModel {
  id?: string; // Firestore document ID
  createdAt?: any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp
  createdBy?: string;
  updatedBy?: string;
  isArchived?: boolean;
}

export interface Customer extends BaseModel {
  name: string;
  // Other fields based on actual data
}

export interface ProductLayer {
  layerName: string;
  paperType?: string;
  bf?: string;
  gsm?: number;
}

export interface Product extends BaseModel {
  customerId: string;
  customerName: string; // Denormalized for rendering/searching
  artworkNo: string;
  itemName: string;
  length: number;
  width: number;
  height: number;
  ply: number;
  flute?: string;
  reelSize: number;
  cutSize: number;
  pinQty?: number;
  pinPasting?: string;
  ups?: number;
  creasing?: string;
  dieNumber?: string;
  color?: string;
  packing?: string;
  pinType?: string;
  boxType?: string;
  specialRequirement?: string;
  actualCosting?: number;
  layers: ProductLayer[];
}

export interface JobCard extends BaseModel {
  poNumber: string;
  customerName: string; // denormalized for search
  customerId: string;
  productName: string; // denormalized for search
  productId: string;
  
  consignee?: string;
  poDate?: string;
  sNo?: string;
  itemCode?: string;
  rate?: number;
  totalPoQty: number;
  deliveryDate?: string;
  
  // A SNAPSHOT of product/master specifications
  productSnapshot?: any;
  
  // Status and Dispatch details
  status: 'PENDING' | 'IN_PROCESS' | 'COMPLETED' | 'DELAYED';
  dispatchDates?: { date: string; qty: number }[];
  
  // Tracking
  issuedAt?: any;
  issuedBy?: string;
  expectedDeliveryAt?: any;
  completedAt?: any;
  remarks?: {
    text: string;
    date: string; // ISO string
    by: string;
  }[];
}

export interface Reel extends BaseModel {
  reelNumber: string;
  supplierName: string;
  manufacturerName: string;
  weight: number;
  currentBalance: number;
  paperType: string;
  reelSize: string;
  bf: string;
  gsm: string;
  rate?: number;
  inwardDate: string;
}

export interface ReelTransaction extends BaseModel {
  reelId: string;
  reelNumber: string;
  type: 'INWARD' | 'OUTWARD' | 'ALLOCATION';
  quantity: number;
  remainingBalance: number;
  jobCardId?: string;
  performedBy: string;
  date: string;
}

export interface FinishGood extends BaseModel {
  productId: string;
  productName: string;
  customerId: string;
  customerName: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingBalance: number;
  nonMovingBalance: number;
  rate: number;
}

export interface FinishGoodTransaction extends BaseModel {
  finishGoodId: string;
  type: 'IN' | 'OUT';
  category: 'REGULAR' | 'REJECTED' | 'DISPATCH' | 'NON-MOVING' | 'ADJUSTMENT' | 'CORRECTION' | string;
  quantity: number;
  remainingBalance: number;
  date: string;
  referenceNo?: string; // Job Card No for IN, Invoice No for OUT
  performedBy: string;
  remarks?: string;
  customerName?: string;
  productName?: string;
  
  // Logistics Fields for OUT
  invoiceNo?: string;
  place?: string;
  transporterName?: string;
  vehicleNo?: string;
  vehicleSize?: string;
  freight?: number;
  holding?: number;
  point?: string;
  others?: string;
  
  // Receiving Status
  receivingStatus?: 'PENDING' | 'RECEIVED';
  receivingConfirmedAt?: any;
  receivingConfirmedBy?: string;
}

export interface ActivityLog {
  id?: string;
  user: string;
  action: string;
  entity: string;
  referenceId: string;
  timestamp: any;
}

export interface RawMaterial extends BaseModel {
  name: string;
  unit?: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingBalance: number;
  rate: number;
}

export interface RawMaterialTransaction extends BaseModel {
  rawMaterialId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  rate?: number;
  amount?: number;
  remainingBalance: number;
  date: string;
  referenceNo?: string;
  supplierName?: string;
  remarks?: string;
  performedBy: string;
}

export interface ScrapEntry extends BaseModel {
  date: string;
  description: string;
  weight: number;
  rate: number;
  totalValue: number;
  paymentType: 'CASH' | 'BILLING';
}

export interface MonthlyReport extends BaseModel {
  month: string; // e.g., '2026-07'
  expenses: { id: string; name: string; amount: number }[];
}

import { supabase } from './supabase/config';

export interface VehicleRecord {
  vehicleNo: string;
  transporterName: string;
  freight: number;
  lastUsedAt?: string;
}

const STORAGE_KEY = 'packwell_vehicle_directory';

/**
 * Get all known vehicles from localStorage cache
 */
export function getLocalVehicleDirectory(): Record<string, VehicleRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save / Update a vehicle mapping in memory & localStorage
 */
export function saveVehicleMapping(vehicleNo: string, transporterName: string, freight: number) {
  if (!vehicleNo || !vehicleNo.trim()) return;
  const cleanVehicle = vehicleNo.trim().toUpperCase().replace(/\s+/g, '');

  try {
    const dir = getLocalVehicleDirectory();
    dir[cleanVehicle] = {
      vehicleNo: vehicleNo.trim().toUpperCase(),
      transporterName: transporterName.trim(),
      freight: Number(freight) || 0,
      lastUsedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dir));
  } catch (err) {
    console.error('Error saving vehicle mapping to local directory:', err);
  }
}

/**
 * Lookup vehicle info by vehicle number
 */
export function lookupVehicle(vehicleNo: string): VehicleRecord | null {
  if (!vehicleNo) return null;
  const cleanVehicle = vehicleNo.trim().toUpperCase().replace(/\s+/g, '');
  const dir = getLocalVehicleDirectory();
  return dir[cleanVehicle] || null;
}

/**
 * Fetch and seed vehicle directory from historical Finish Goods & Freight records
 */
export async function seedVehicleDirectoryFromHistory(): Promise<Record<string, VehicleRecord>> {
  const dir = getLocalVehicleDirectory();

  try {
    const { data, error } = await supabase
      .from('finish_good_transactions')
      .select('vehicle_no, transporter_name, freight, created_at')
      .not('vehicle_no', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      for (const row of data) {
        if (!row.vehicle_no) continue;
        const clean = row.vehicle_no.trim().toUpperCase().replace(/\s+/g, '');
        if (!dir[clean] && row.transporter_name) {
          dir[clean] = {
            vehicleNo: row.vehicle_no.trim().toUpperCase(),
            transporterName: row.transporter_name.trim(),
            freight: Number(row.freight) || 0,
            lastUsedAt: row.created_at
          };
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dir));
    }
  } catch (err) {
    console.error('Error seeding vehicle directory from Supabase:', err);
  }

  return dir;
}

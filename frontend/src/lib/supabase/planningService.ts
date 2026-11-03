import { supabase } from './config';

export type PlanningSheetType = 'corrugation' | 'dispatch';

/**
 * Save planning data for a specific sheet type and date.
 * Persists to Supabase `daily_planning_sheets` (shared across all devices)
 * and keeps a local cache in localStorage for instant access / offline support.
 */
export async function savePlanningSheet(
  sheetType: PlanningSheetType,
  planDate: string,
  data: any[]
): Promise<boolean> {
  const localKey = `packwell_${sheetType}_planning_${planDate}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(data));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }

  try {
    const { error } = await supabase
      .from('daily_planning_sheets')
      .upsert(
        {
          sheet_type: sheetType,
          plan_date: planDate,
          data,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'sheet_type,plan_date' }
      );

    if (error) {
      console.error('Error saving planning sheet to Supabase:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to sync planning sheet to Supabase:', err);
    return false;
  }
}

/**
 * Fetch planning data for a specific sheet type and date.
 * Queries Supabase first so updates saved on other devices are immediately loaded.
 * Falls back to localStorage cache if network is unavailable or Supabase has no record yet.
 */
export async function fetchPlanningSheet(
  sheetType: PlanningSheetType,
  planDate: string
): Promise<any[] | null> {
  const localKey = `packwell_${sheetType}_planning_${planDate}`;

  try {
    const { data, error } = await supabase
      .from('daily_planning_sheets')
      .select('data')
      .eq('sheet_type', sheetType)
      .eq('plan_date', planDate)
      .maybeSingle();

    if (!error && data && Array.isArray(data.data) && data.data.length > 0) {
      try {
        localStorage.setItem(localKey, JSON.stringify(data.data));
      } catch (e) {}
      return data.data;
    }
  } catch (err) {
    console.error('Error fetching planning sheet from Supabase:', err);
  }

  // Fallback to localStorage
  try {
    const local = localStorage.getItem(localKey);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Find the most recent date before `beforeDate` that has saved planning data,
 * so active/incomplete jobs can be carried forward automatically on any device.
 */
export async function fetchMostRecentPreviousPlanning(
  sheetType: PlanningSheetType,
  beforeDate: string
): Promise<{ date: string; data: any[] } | null> {
  try {
    const { data, error } = await supabase
      .from('daily_planning_sheets')
      .select('plan_date, data')
      .eq('sheet_type', sheetType)
      .lt('plan_date', beforeDate)
      .order('plan_date', { ascending: false })
      .limit(5);

    if (!error && data && data.length > 0) {
      for (const row of data) {
        if (Array.isArray(row.data) && row.data.length > 0) {
          return { date: row.plan_date, data: row.data };
        }
      }
    }
  } catch (err) {
    console.error('Error fetching previous planning dates from Supabase:', err);
  }

  // Local fallback
  const prefix = `packwell_${sheetType}_planning_`;
  try {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    const sortedDates = allKeys
      .map(k => k.replace(prefix, ''))
      .filter(d => d < beforeDate)
      .sort()
      .reverse();

    for (const prevDate of sortedDates) {
      const prevData = localStorage.getItem(`${prefix}${prevDate}`);
      if (prevData) {
        try {
          const parsed = JSON.parse(prevData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return { date: prevDate, data: parsed };
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Subscribe to realtime updates for a specific sheet type.
 * Automatically triggers whenever any system saves or updates planning rows!
 */
export function subscribeToPlanningSheet(
  sheetType: PlanningSheetType,
  planDate: string,
  onUpdate: (data: any[]) => void
) {
  const channel = supabase
    .channel(`planning_realtime_${sheetType}_${planDate}_${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'daily_planning_sheets',
        filter: `sheet_type=eq.${sheetType}`
      },
      (payload: any) => {
        const newRecord = payload.new;
        if (newRecord && newRecord.plan_date === planDate && Array.isArray(newRecord.data)) {
          onUpdate(newRecord.data);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}


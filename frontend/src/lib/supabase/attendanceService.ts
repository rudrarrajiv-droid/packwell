import { supabase } from './config';
import { logActivity } from './activityLogService';

// Supabase-backed replacement for the Firestore `attendance` collection.
// Table: public.attendance (RLS enabled, SELECT + INSERT + DELETE only - no
// per-row UPDATE, since the app only ever replaces a whole day's records).
//
// AttendanceRecord is defined here (previously lived on the now-removed
// Firebase salaryServices.ts) - this is its canonical location.
export interface AttendanceRecord {
  id?: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  present: number; // 1, 0.5, 0
  otHours: number;
  refreshment: number; // e.g. 70
  perDayAmount: number; // Calculated based on month days
  otAmount: number; // Calculated based on month days and 8-hour shift
  createdAt?: any;
  updatedAt?: any;
  updatedBy?: string;
}
//
// Field mapping (Postgres column -> frontend shape):
//   firestore_document_id -> id
//   employee_id           -> employeeId
//   attendance_date       -> date
//   present               -> present
//   ot_hours              -> otHours
//   refreshment           -> refreshment
//   per_day_amount        -> perDayAmount
//   ot_amount             -> otAmount
//   updated_by            -> updatedBy
//   created_at/updated_at -> createdAt/updatedAt

const SELECT_COLUMNS =
  'firestore_document_id, employee_id, attendance_date, present, ot_hours, refreshment, per_day_amount, ot_amount, updated_by, created_at, updated_at';

const mapRow = (row: any): AttendanceRecord => ({
  id: row.firestore_document_id,
  employeeId: row.employee_id,
  date: row.attendance_date,
  present: row.present,
  otHours: row.ot_hours,
  refreshment: row.refreshment,
  perDayAmount: row.per_day_amount,
  otAmount: row.ot_amount,
  updatedBy: row.updated_by ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Fetches attendance for a single date. Replaces
 * `queryDocuments`-style `where('date', '==', date)` behavior with a native
 * column filter.
 */
export const getAttendanceByDate = async (date: string): Promise<AttendanceRecord[]> => {
  const { data, error } = await supabase
    .from('attendance')
    .select(SELECT_COLUMNS)
    .eq('attendance_date', date);

  if (error) {
    console.error(`Error fetching attendance for ${date}:`, error);
    throw error;
  }

  return (data || []).map(mapRow);
};

/**
 * Fetches attendance for a whole month (yearMonth = 'YYYY-MM'). Replaces the
 * previous "fetch entire collection, filter in JS" behavior with a native
 * date-range query.
 */
export const getAttendanceByMonth = async (yearMonth: string): Promise<AttendanceRecord[]> => {
  const startStr = `${yearMonth}-01`;
  const year = parseInt(yearMonth.split('-')[0]);
  const month = parseInt(yearMonth.split('-')[1]);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthStr = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('attendance')
      .select(SELECT_COLUMNS)
      .gte('attendance_date', startStr)
      .lt('attendance_date', nextMonthStr)
      .range(from, from + step - 1);

    if (error) {
      console.error(`Error fetching attendance for month ${yearMonth}:`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
    }

    if (!data || data.length < step) {
      break;
    }
    from += step;
  }

  return allData.map(mapRow);
};

/**
 * Fetches attendance within an inclusive date range. Replaces the previous
 * "fetch entire collection, filter in JS" behavior with a native date-range
 * query.
 */
export const getAttendanceByDateRange = async (startDate: string, endDate: string): Promise<AttendanceRecord[]> => {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('attendance')
      .select(SELECT_COLUMNS)
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
      .range(from, from + step - 1);

    if (error) {
      console.error(`Error fetching attendance from ${startDate} to ${endDate}:`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
    }

    if (!data || data.length < step) {
      break;
    }
    from += step;
  }

  return allData.map(mapRow);
};

/**
 * Replaces a whole day's attendance records atomically via the
 * `replace_daily_attendance` Postgres function (delete existing rows for the
 * date + insert the new set, in a single transaction). This preserves the
 * atomicity of the previous Firestore `writeBatch` delete+set - a failure
 * partway can never leave the day empty, and calling this twice in a row
 * cannot create duplicate rows (the delete always runs first).
 *
 * New rows get a client-generated `crypto.randomUUID()` id (the primary key
 * has no DB default). `raw_data` (NOT NULL) is populated by the function
 * itself from the same record payload sent here.
 */
export const saveDailyAttendance = async (
  date: string,
  records: Omit<AttendanceRecord, 'id'>[],
  user: string
): Promise<boolean> => {
  try {
    const payload = records.map(r => ({
      id: crypto.randomUUID(),
      employeeId: r.employeeId,
      present: r.present,
      otHours: r.otHours,
      refreshment: r.refreshment,
      perDayAmount: r.perDayAmount,
      otAmount: r.otAmount,
    }));

    const { error } = await supabase.rpc('replace_daily_attendance', {
      p_date: date,
      p_records: payload,
      p_user: user,
    });

    if (error) {
      console.error('Error saving daily attendance:', error);
      throw error;
    }

    await logActivity({
      user,
      action: `Saved daily attendance for ${date}`,
      entity: 'attendance',
      referenceId: date,
    });

    return true;
  } catch (error) {
    console.error('Error saving daily attendance:', error);
    throw error;
  }
};

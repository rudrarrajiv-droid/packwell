import { supabase } from './config';
import { logActivity } from './activityLogService';

// Supabase-backed replacement for the Firestore `employees` collection.
// Table: public.employees (RLS enabled, SELECT + INSERT + UPDATE only).
//
// Employee is defined here (previously lived on the now-removed Firebase
// salaryServices.ts) - this is its canonical location.
export interface Employee {
  id?: string;
  employeeCode?: number; // Numeric code for sorting
  name: string;
  category: 'COMPANY' | 'WAGES';
  contractorName?: 'Dinesh' | 'Vikas';
  designation: string;
  basicSalary: number;
  isActive: boolean;
  fatherName?: string;
  address?: string;
  status?: 'ACTIVE' | 'LEFT';
  leftDate?: string;
  rejoinDate?: string;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}
//
// Field mapping (Postgres column -> Employee shape):
//   firestore_document_id -> id
//   employee_code          -> employeeCode
//   name                   -> name
//   category               -> category
//   contractor_name        -> contractorName
//   designation            -> designation
//   basic_salary           -> basicSalary
//   is_active              -> isActive
//   father_name            -> fatherName
//   address                -> address
//   status                 -> status
//   left_date              -> leftDate
//   rejoin_date            -> rejoinDate
//   created_by / updated_by -> createdBy / updatedBy
//   created_at / updated_at -> createdAt / updatedAt

const SELECT_COLUMNS =
  'firestore_document_id, employee_code, name, category, contractor_name, designation, basic_salary, is_active, created_by, updated_by, created_at, updated_at, father_name, address, status, left_date, rejoin_date';

const mapRow = (row: any): Employee => ({
  id: row.firestore_document_id,
  employeeCode: row.employee_code ?? undefined,
  name: row.name,
  category: row.category,
  contractorName: row.contractor_name ?? undefined,
  designation: row.designation,
  basicSalary: row.basic_salary,
  isActive: row.is_active,
  fatherName: row.father_name ?? row.raw_data?.father_name ?? undefined,
  address: row.address ?? row.raw_data?.address ?? undefined,
  status: row.status ?? (row.is_active === false ? 'LEFT' : 'ACTIVE'),
  leftDate: row.left_date ?? row.raw_data?.left_date ?? undefined,
  rejoinDate: row.rejoin_date ?? row.raw_data?.rejoin_date ?? undefined,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Fetches employees sorted by employeeCode ascending.
 * By default returns both active and left employees so calling components
 * have date-aware complete records without breaking historical months.
 */
export const getEmployees = async (onlyActive: boolean = false): Promise<Employee[]> => {
  let query = supabase
    .from('employees')
    .select(SELECT_COLUMNS)
    .order('employee_code', { ascending: true, nullsFirst: false });

  if (onlyActive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching employees:', error);
    throw error;
  }

  return (data || []).map(mapRow);
};

/**
 * Creates a new employee. Supports optional fatherName and address.
 */
export const createEmployee = async (employee: Omit<Employee, 'id'>, user: string): Promise<string> => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: Record<string, any> = {
    firestore_document_id: id,
    employee_code: employee.employeeCode ?? null,
    name: employee.name,
    category: employee.category,
    contractor_name: employee.contractorName ?? null,
    designation: employee.designation,
    basic_salary: employee.basicSalary,
    is_active: true,
    status: 'ACTIVE',
    father_name: employee.fatherName?.trim() || null,
    address: employee.address?.trim() || null,
    left_date: null,
    rejoin_date: null,
    created_by: user,
    updated_by: user,
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase.from('employees').insert({
    ...record,
    raw_data: record,
  });

  if (error) {
    console.error('Error creating employee:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Added Employee: ${employee.name}`,
    entity: 'employees',
    referenceId: id,
  });

  return id;
};

/**
 * Updates an employee's details.
 */
export const updateEmployee = async (employeeId: string, updates: Partial<Employee>, user: string): Promise<void> => {
  const patch: Record<string, unknown> = {
    updated_by: user,
    updated_at: new Date().toISOString(),
  };
  if (updates.employeeCode !== undefined) patch.employee_code = updates.employeeCode ?? null;
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.contractorName !== undefined) patch.contractor_name = updates.contractorName ?? null;
  if (updates.designation !== undefined) patch.designation = updates.designation;
  if (updates.basicSalary !== undefined) patch.basic_salary = updates.basicSalary;
  if (updates.fatherName !== undefined) patch.father_name = updates.fatherName?.trim() || null;
  if (updates.address !== undefined) patch.address = updates.address?.trim() || null;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.leftDate !== undefined) patch.left_date = updates.leftDate || null;
  if (updates.rejoinDate !== undefined) patch.rejoin_date = updates.rejoinDate || null;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;

  const { error } = await supabase
    .from('employees')
    .update(patch)
    .eq('firestore_document_id', employeeId);

  if (error) {
    console.error('Error updating employee:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Updated Employee`,
    entity: 'employees',
    referenceId: employeeId,
  });
};

/**
 * Marks an employee as Left on a specified leftDate.
 * Historical records before/on leftDate remain untouched.
 */
export const markEmployeeLeft = async (
  employeeId: string,
  employeeName: string,
  leftDate: string,
  user: string
): Promise<void> => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('employees')
    .update({
      status: 'LEFT',
      left_date: leftDate,
      is_active: false,
      updated_by: user,
      updated_at: now,
    })
    .eq('firestore_document_id', employeeId);

  if (error) {
    console.error('Error marking employee as left:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Marked Employee Left: ${employeeName} on ${leftDate}`,
    entity: 'employees',
    referenceId: employeeId,
  });
};

/**
 * Rejoins an existing employee as of rejoinDate.
 * Restores status to ACTIVE with new rejoinDate and any updated details.
 */
export const rejoinEmployee = async (
  employeeId: string,
  employeeName: string,
  rejoinDate: string,
  updates: Partial<Employee>,
  user: string
): Promise<void> => {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: 'ACTIVE',
    rejoin_date: rejoinDate,
    is_active: true,
    updated_by: user,
    updated_at: now,
  };

  if (updates.employeeCode !== undefined) patch.employee_code = updates.employeeCode ?? null;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.contractorName !== undefined) patch.contractor_name = updates.contractorName ?? null;
  if (updates.designation !== undefined) patch.designation = updates.designation;
  if (updates.basicSalary !== undefined) patch.basic_salary = updates.basicSalary;
  if (updates.fatherName !== undefined) patch.father_name = updates.fatherName?.trim() || null;
  if (updates.address !== undefined) patch.address = updates.address?.trim() || null;

  const { error } = await supabase
    .from('employees')
    .update(patch)
    .eq('firestore_document_id', employeeId);

  if (error) {
    console.error('Error rejoining employee:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Rejoined Employee: ${employeeName} as of ${rejoinDate}`,
    entity: 'employees',
    referenceId: employeeId,
  });
};

/**
 * Soft-deletes an employee: sets is_active = false only, matching the
 * previous Firestore `deleteEmployee` behavior exactly (never a hard delete).
 */
export const deleteEmployee = async (employeeId: string, user: string): Promise<void> => {
  const { error } = await supabase
    .from('employees')
    .update({
      is_active: false,
      updated_by: user,
      updated_at: new Date().toISOString(),
    })
    .eq('firestore_document_id', employeeId);

  if (error) {
    console.error('Error deleting employee:', error);
    throw error;
  }

  await logActivity({
    user,
    action: `Deleted Employee`,
    entity: 'employees',
    referenceId: employeeId,
  });
};

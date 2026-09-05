import React, { useState, useEffect, useMemo } from 'react';
import { Save, Calendar, Clock, Loader2, IndianRupee, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getEmployees, type Employee } from '../../lib/supabase/employeeService';
import { getAttendanceByDate, saveDailyAttendance, type AttendanceRecord } from '../../lib/supabase/attendanceService';

interface DailyAttendanceFormState {
  present: number;
  otHours: string | number;
  refreshment: string | number;
}

export default function DailyEntryTab() {
  const { user } = useAuth();
  // "pendingDate" = what user selects in the date picker (not yet loaded)
  const [pendingDate, setPendingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  // "loadedDate" = what the data was actually loaded for
  const [loadedDate, setLoadedDate] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Record<string, DailyAttendanceFormState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'COMPANY' | 'WAGES_DINESH' | 'WAGES_VIKAS'>('ALL');
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Load employees once on mount
  useEffect(() => {
    loadData(pendingDate);
  }, []);

  // "Load" button handler - only loads when user explicitly presses Load
  const loadData = async (dateToLoad: string) => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [emps, records] = await Promise.all([
        getEmployees(),
        getAttendanceByDate(dateToLoad)
      ]);
      
      setEmployees(emps);
      setLoadedDate(dateToLoad);
      
      // Initialize form state
      const attState: Record<string, DailyAttendanceFormState> = {};
      
      emps.forEach(emp => {
        const existing = records.find(r => r.employeeId === emp.id);
        if (existing) {
          attState[emp.id!] = {
            present: existing.present,
            otHours: existing.otHours,
            refreshment: existing.refreshment,
          };
        } else {
          attState[emp.id!] = {
            present: 0,
            otHours: 0,
            refreshment: 0,
          };
        }
      });
      
      setAttendance(attState);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to load data.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (empId: string, field: 'present', value: number) => {
    setAttendance(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: value
      }
    }));
  };

  const handleOTChange = (empId: string, inputVal: string) => {
    // Only allow digits and up to 1 decimal place (e.g. 3.5, 2.5, 1, 4.5, 7.5, 8)
    let val = inputVal.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) {
      val = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    if (parts.length === 2 && parts[1].length > 1) {
      val = `${parts[0]}.${parts[1].substring(0, 1)}`;
    }

    const numVal = parseFloat(val) || 0;

    setAttendance(prev => {
      const current = prev[empId] || { present: 0, otHours: 0, refreshment: 0 };
      const prevOT = parseFloat(String(current.otHours || 0)) || 0;
      const currentRef = Number(current.refreshment) || 0;

      let newRef: string | number = current.refreshment;
      // Auto formula: Agar OT hours 6 se jyada hai (> 6) to 60 rupees refreshment automatic add ho jaye
      if (numVal > 6 && (prevOT <= 6 || currentRef === 0)) {
        newRef = 60;
      } else if (numVal <= 6 && currentRef === 60 && prevOT > 6) {
        // Agar OT wapas 6 ya usse kam ho jaye to auto 60 hata kar 0 karein
        newRef = 0;
      }

      return {
        ...prev,
        [empId]: {
          ...current,
          otHours: val,
          refreshment: newRef,
        }
      };
    });
  };

  const handleRefreshmentChange = (empId: string, inputVal: string) => {
    // Allows user to manually change or delete refreshment
    const val = inputVal.replace(/[^0-9]/g, '');
    setAttendance(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        refreshment: val,
      }
    }));
  };

  const calculateAmounts = (emp: Employee, att: { present?: number; otHours?: any; refreshment?: any }) => {
    const dateObj = new Date(loadedDate || pendingDate);
    const daysInMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
    const perDayRate = emp.basicSalary / daysInMonth;
    const presentVal = Number(att?.present) || 0;
    const perDayAmount = perDayRate * presentVal;
    const perHourRate = perDayRate / 8;
    const otVal = parseFloat(String(att?.otHours || 0)) || 0;
    const otAmount = perHourRate * otVal;
    return { perDayAmount, otAmount };
  };

  // Summary calculations
  const summary = useMemo(() => {
    let totalPresent = 0, totalAbsent = 0, totalOT = 0, totalAmount = 0;
    employees.forEach(emp => {
      const att = attendance[emp.id!] || { present: 0, otHours: 0, refreshment: 0 };
      const { perDayAmount, otAmount } = calculateAmounts(emp, att);
      const presentVal = Number(att.present) || 0;
      const otVal = parseFloat(String(att.otHours || 0)) || 0;
      const refVal = Number(att.refreshment) || 0;

      totalPresent += presentVal;
      if (presentVal === 0) totalAbsent++;
      totalOT += otVal;
      totalAmount += perDayAmount + otAmount + refVal;
    });
    return { totalPresent, totalAbsent, totalOT, totalAmount };
  }, [attendance, employees]);

  const handleSave = async () => {
    if (!loadedDate) {
      setMessage({ type: 'error', text: 'Please load a date first before saving.' });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const recordsToSave: Omit<AttendanceRecord, 'id'>[] = [];
      
      employees.forEach(emp => {
        const att = attendance[emp.id!];
        const presentVal = Number(att?.present) || 0;
        const otVal = parseFloat(String(att?.otHours || 0)) || 0;
        const refVal = Number(att?.refreshment) || 0;

        if (att && (presentVal > 0 || otVal > 0 || refVal > 0)) {
          const { perDayAmount, otAmount } = calculateAmounts(emp, att);
          
          recordsToSave.push({
            employeeId: emp.id!,
            date: loadedDate,
            present: presentVal,
            otHours: otVal,
            refreshment: refVal,
            perDayAmount,
            otAmount
          });
        }
      });

      await saveDailyAttendance(loadedDate, recordsToSave, user?.name || 'System');
      setMessage({ type: 'success', text: `Attendance saved successfully for ${loadedDate}` });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to save attendance.' });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    if (filter === 'ALL') return true;
    if (filter === 'COMPANY') return emp.category === 'COMPANY';
    if (filter === 'WAGES_DINESH') return emp.category === 'WAGES' && emp.contractorName === 'Dinesh';
    if (filter === 'WAGES_VIKAS') return emp.category === 'WAGES' && emp.contractorName === 'Vikas';
    return true;
  });

  const dateChanged = pendingDate !== loadedDate;
  const thClass = "px-3 py-3 border-b border-border text-left font-medium text-muted-foreground whitespace-nowrap";
  const tdClass = "px-3 py-2 border-b border-border";

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-card p-4 rounded-lg border border-border shadow-sm gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Daily Attendance & OT</h2>
          <p className="text-sm text-muted-foreground">Enter day-wise present, OT hours, and refreshment</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <input 
              type="date" 
              className="px-3 py-2 border border-input rounded-md bg-background"
              value={pendingDate}
              onChange={(e) => setPendingDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          {/* Load Button - explicitly loads data for the selected date */}
          <button
            onClick={() => loadData(pendingDate)}
            disabled={isLoading}
            className={`flex items-center px-4 py-2 font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 ${
              dateChanged 
                ? 'bg-amber-500 text-white hover:bg-amber-600 animate-pulse' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <RefreshCw className="w-5 h-5 mr-2" />}
            {dateChanged ? 'Load Date' : 'Reload'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || !loadedDate}
            className="flex items-center px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            Save Entry
          </button>
        </div>
      </div>

      {loadedDate && (
        <div className="text-xs text-center text-muted-foreground">
          {dateChanged 
            ? <span className="text-amber-600 font-medium">⚠ Date changed — press "Load Date" to load {pendingDate}'s data (current entries are still safe)</span>
            : <span className="text-green-600 font-medium">✓ Showing data for: {loadedDate}</span>
          }
        </div>
      )}

      {/* Summary Bar */}
      {employees.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-xs text-green-600 font-semibold uppercase tracking-wide">Total Present</div>
            <div className="text-2xl font-bold text-green-700">{summary.totalPresent}</div>
            <div className="text-xs text-green-500">days</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-xs text-red-600 font-semibold uppercase tracking-wide">Total Absent</div>
            <div className="text-2xl font-bold text-red-700">{summary.totalAbsent}</div>
            <div className="text-xs text-red-500">employees</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <div className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Total OT Hours</div>
            <div className="text-2xl font-bold text-blue-700">{summary.totalOT.toFixed(1)}</div>
            <div className="text-xs text-blue-500">hrs</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
            <div className="text-xs text-purple-600 font-semibold uppercase tracking-wide">Est. Day Cost</div>
            <div className="text-2xl font-bold text-purple-700">₹{Math.round(summary.totalAmount).toLocaleString()}</div>
            <div className="text-xs text-purple-500">total</div>
          </div>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-md text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="flex gap-2">
        {(['ALL', 'COMPANY', 'WAGES_DINESH', 'WAGES_VIKAS'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
              filter === f 
                ? 'bg-primary text-primary-foreground border-primary' 
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {f === 'ALL' ? 'All' : f === 'COMPANY' ? 'Company' : f === 'WAGES_DINESH' ? 'Wages (Dinesh)' : 'Wages (Vikas)'}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Employee Name</th>
                <th className={thClass}>Designation</th>
                <th className={thClass}>Basic Salary</th>
                <th className={thClass}>Attendance</th>
                <th className={thClass}>OT Hours</th>
                <th className={thClass}>Refreshment (₹)</th>
                <th className={thClass}>Auto Calculation</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading employees and records...
                  </td>
                </tr>
              ) : !loadedDate ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    Select a date and press <strong>"Load Date"</strong> to begin entry.
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">
                    No employees found for this filter.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, idx) => {
                  const att = attendance[emp.id!] || { present: 0, otHours: 0, refreshment: 0 };
                  const { perDayAmount, otAmount } = calculateAmounts(emp, att);
                  const currentRef = parseFloat(String(att.refreshment || 0)) || 0;
                  const rowTotal = perDayAmount + otAmount + currentRef;

                  return (
                    <tr key={emp.id} className={`transition-colors ${(Number(att.present) || 0) === 0 ? 'bg-red-50/20' : 'hover:bg-muted/50'}`}>
                      <td className="px-3 py-2 border-b border-border text-muted-foreground text-xs font-mono">
                        {emp.employeeCode ?? (idx + 1)}
                      </td>
                      <td className={`${tdClass} font-medium`}>
                        {emp.name}
                        <span className="block text-xs text-muted-foreground">
                          {emp.category === 'COMPANY' ? 'Company' : `Wages ${emp.contractorName ? `(${emp.contractorName})` : ''}`}
                        </span>
                      </td>
                      <td className={tdClass}>{emp.designation}</td>
                      <td className={tdClass}>₹{emp.basicSalary.toLocaleString()}</td>
                      
                      <td className={tdClass}>
                        <select 
                          className={`w-28 px-2 py-1.5 border rounded-md text-sm font-medium transition-colors ${
                            Number(att.present) === 1 
                              ? 'bg-green-50 border-green-300 text-green-800 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800 font-semibold' 
                              : 'bg-background border-input text-muted-foreground'
                          }`}
                          value={att.present !== undefined ? att.present : 0}
                          onChange={(e) => handleInputChange(emp.id!, 'present', Number(e.target.value))}
                        >
                          <option value="0">Absent</option>
                          <option value="1">Present</option>
                        </select>
                      </td>
                      
                      <td className={tdClass}>
                        <div className="flex items-center w-24">
                          <Clock className="w-4 h-4 text-muted-foreground mr-1.5 shrink-0" />
                          <input 
                            type="text"
                            inputMode="decimal"
                            className="w-full px-2 py-1.5 border border-input rounded-md bg-background text-sm font-medium text-center focus:outline-none focus:ring-1 focus:ring-primary"
                            value={att.otHours !== undefined && att.otHours !== null ? att.otHours : ''}
                            onChange={(e) => handleOTChange(emp.id!, e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </td>
                      
                      <td className={tdClass}>
                        <div className="flex items-center w-28 relative">
                          <IndianRupee className="w-4 h-4 text-muted-foreground mr-1 shrink-0" />
                          <input 
                            type="text"
                            inputMode="numeric"
                            className="w-full px-2 py-1.5 border border-input rounded-md bg-background text-sm font-medium text-center pr-6 focus:outline-none focus:ring-1 focus:ring-primary"
                            value={att.refreshment !== undefined && att.refreshment !== null ? att.refreshment : ''}
                            onChange={(e) => handleRefreshmentChange(emp.id!, e.target.value)}
                            placeholder="0"
                          />
                          {Boolean(att.refreshment && Number(att.refreshment) > 0) && (
                            <button
                              type="button"
                              onClick={() => handleRefreshmentChange(emp.id!, '0')}
                              className="absolute right-1.5 text-muted-foreground hover:text-red-500 p-0.5 rounded transition-colors"
                              title="Remove refreshment (₹0)"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      
                      <td className={tdClass}>
                        <div className="flex flex-col text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Salary:</span>
                            <span className="font-medium text-foreground">₹{perDayAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">OT:</span>
                            <span className="font-medium text-foreground">₹{otAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Ref:</span>
                            <span className="font-medium text-foreground">₹{currentRef.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t border-border pt-1 mt-1 font-bold">
                            <span>Total:</span>
                            <span className="text-primary">₹{rowTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

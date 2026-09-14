import React, { useState, useEffect, useMemo } from 'react';
import { 
  Save, Calendar, Clock, Loader2, IndianRupee, RefreshCw, X, Sun, 
  Briefcase, ArrowRightLeft, AlertTriangle, CheckCircle2 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getEmployees, type Employee } from '../../lib/supabase/employeeService';
import { 
  getAttendanceByDate, saveDailyAttendance, moveDailyAttendance, type AttendanceRecord 
} from '../../lib/supabase/attendanceService';

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

  // Move / Shift Date state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [targetMoveDate, setTargetMoveDate] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);

  // Helper to check Sunday
  const isSunday = (dateStr: string) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getDay() === 0;
  };

  // Helper to get formatted day of week
  const getDayName = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(y, m - 1, d));
  };

  // Load employees once on mount
  useEffect(() => {
    loadData(pendingDate);
  }, []);

  // "Load" button handler - loads and applies date-aware employee filtering
  const loadData = async (dateToLoad: string) => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [allEmps, records] = await Promise.all([
        getEmployees(false),
        getAttendanceByDate(dateToLoad)
      ]);
      
      // Date-aware employee filtering:
      // 1. August 2026 and older: keep all employees intact (Requirement 5)
      // 2. Sept 1, 2026 onwards:
      //    - If an employee has saved attendance on dateToLoad, always show them (preserve data)
      //    - If an employee left on leftDate:
      //      - If dateToLoad <= leftDate: show them (they worked on or before left date)
      //      - If dateToLoad > leftDate:
      //        - If employee rejoined on rejoinDate and dateToLoad >= rejoinDate: show them
      //        - Otherwise: hide them from daily entry sheet (Requirement 1)
      const eligibleEmps = allEmps.filter(emp => {
        const hasExistingRecord = records.some(
          r => r.employeeId === emp.id && (r.present > 0 || r.otHours > 0 || r.refreshment > 0)
        );
        if (hasExistingRecord) return true;

        if (dateToLoad < '2026-09-01') {
          return true;
        }

        const isLeft = emp.status === 'LEFT' || Boolean(emp.leftDate);
        if (isLeft) {
          if (emp.leftDate && dateToLoad <= emp.leftDate) {
            return true;
          }
          if (emp.rejoinDate && dateToLoad >= emp.rejoinDate) {
            return true;
          }
          return false;
        }

        return emp.isActive !== false;
      });

      setEmployees(eligibleEmps);
      setLoadedDate(dateToLoad);
      
      // Initialize form state
      const attState: Record<string, DailyAttendanceFormState> = {};
      
      eligibleEmps.forEach(emp => {
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
    const effectiveDate = loadedDate || pendingDate;
    const dateIsSunday = isSunday(effectiveDate);
    const isSept2026OrLater = effectiveDate >= '2026-09-01';

    setAttendance(prev => {
      const current = prev[empId] || { present: 0, otHours: 0, refreshment: 0 };
      const prevOT = parseFloat(String(current.otHours || 0)) || 0;
      const currentRef = Number(current.refreshment) || 0;

      let newRef: string | number = current.refreshment;

      if (isSept2026OrLater) {
        if (dateIsSunday) {
          // Requirement 4: Sunday ko minimum 6 hrs OT duty karne par auto 60 refreshment add hoga
          if (numVal >= 6 && (prevOT < 6 || currentRef === 0)) {
            newRef = 60;
          } else if (numVal < 6 && currentRef === 60 && prevOT >= 6) {
            newRef = 0;
          }
        } else {
          // Requirement 4: Baaki dino me OT hours me refreshment ka paisa automatically add nahi hoga
        }
      } else {
        // Pre-September 2026: keep old behavior untouched (Requirement 5)
        if (numVal > 6 && (prevOT <= 6 || currentRef === 0)) {
          newRef = 60;
        } else if (numVal <= 6 && currentRef === 60 && prevOT > 6) {
          newRef = 0;
        }
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

  const calculateAmounts = (
    emp: Employee, 
    att: { present?: number; otHours?: any; refreshment?: any },
    customDate?: string
  ) => {
    const dateObj = new Date(customDate || loadedDate || pendingDate);
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

  // Move / Shift all entries from loadedDate to targetMoveDate
  const handleMoveDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadedDate || !targetMoveDate) return;

    if (loadedDate === targetMoveDate) {
      alert('Current date aur target date alag honi chahiye.');
      return;
    }

    const activeCount = employees.filter(emp => {
      const att = attendance[emp.id!];
      return att && (att.present > 0 || parseFloat(String(att.otHours || 0)) > 0 || Number(att.refreshment || 0) > 0);
    }).length;

    if (activeCount === 0) {
      alert(`No attendance or OT entries found on ${loadedDate} to move.`);
      return;
    }

    if (!confirm(`Kya aap sure hain ki ${loadedDate} ki attendance aur OT ko ${targetMoveDate} par shift karna chahte hain? Purani date (${loadedDate}) se entries clear ho jayengi.`)) {
      return;
    }

    setIsMoving(true);
    setMessage(null);
    try {
      const recordsToMove: Omit<AttendanceRecord, 'id'>[] = [];
      const targetIsSunday = isSunday(targetMoveDate);
      const targetIsSept2026OrLater = targetMoveDate >= '2026-09-01';

      employees.forEach(emp => {
        const att = attendance[emp.id!];
        const presentVal = Number(att?.present) || 0;
        const otVal = parseFloat(String(att?.otHours || 0)) || 0;
        let refVal = Number(att?.refreshment) || 0;

        // Auto refreshment adjustment if moving to Sunday
        if (targetIsSept2026OrLater && targetIsSunday && otVal >= 6 && refVal === 0) {
          refVal = 60;
        }

        if (att && (presentVal > 0 || otVal > 0 || refVal > 0)) {
          const { perDayAmount, otAmount } = calculateAmounts(
            emp, 
            { present: presentVal, otHours: otVal, refreshment: refVal }, 
            targetMoveDate
          );
          
          recordsToMove.push({
            employeeId: emp.id!,
            date: targetMoveDate,
            present: presentVal,
            otHours: otVal,
            refreshment: refVal,
            perDayAmount,
            otAmount
          });
        }
      });

      await moveDailyAttendance(loadedDate, targetMoveDate, recordsToMove, user?.name || 'System');
      setShowMoveModal(false);
      setMessage({
        type: 'success',
        text: `✓ Successfully moved ${recordsToMove.length} employee records from ${loadedDate} to ${targetMoveDate}!`
      });

      // Automatically load the newly shifted date
      setPendingDate(targetMoveDate);
      await loadData(targetMoveDate);
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to move attendance: ' + error.message });
    } finally {
      setIsMoving(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    if (filter === 'ALL') return true;
    if (filter === 'COMPANY') return emp.category === 'COMPANY';
    if (filter === 'WAGES_DINESH') return emp.category === 'WAGES' && emp.contractorName === 'Dinesh';
    if (filter === 'WAGES_VIKAS') return emp.category === 'WAGES' && emp.contractorName === 'Vikas';
    return true;
  });

  const activeDate = loadedDate || pendingDate;
  const isSelectedDateSunday = isSunday(activeDate);
  const dayName = getDayName(activeDate);
  const dateChanged = pendingDate !== loadedDate;
  const thClass = "px-3 py-3 border-b border-border text-left font-medium text-muted-foreground whitespace-nowrap";

  const totalFilledEntries = employees.filter(e => {
    const a = attendance[e.id!];
    return a && (a.present > 0 || parseFloat(String(a.otHours || 0)) > 0 || Number(a.refreshment || 0) > 0);
  }).length;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-card p-4 rounded-lg border border-border shadow-sm gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Daily Attendance & OT</h2>
            {/* Sunday vs Weekday Badge */}
            {isSelectedDateSunday ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <Sun className="w-3.5 h-3.5 mr-1 text-amber-600" />
                Sunday (OT ≥ 6h: Auto ₹60 Ref)
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <Briefcase className="w-3.5 h-3.5 mr-1 text-slate-500" />
                {dayName || 'Working Day'} (No Auto Ref)
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter day-wise present, OT hours, and refreshment
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <input 
              type="date" 
              className="px-3 py-2 border border-input rounded-md bg-background text-sm font-medium"
              value={pendingDate}
              onChange={(e) => setPendingDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Load Button */}
          <button
            onClick={() => loadData(pendingDate)}
            disabled={isLoading}
            className={`flex items-center px-3.5 py-2 font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 text-sm ${
              dateChanged 
                ? 'bg-amber-500 text-white hover:bg-amber-600 animate-pulse' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {isLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            {dateChanged ? 'Load Date' : 'Reload'}
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || !loadedDate}
            className="flex items-center px-3.5 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 text-sm"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save Entry
          </button>

          {/* 1-Click Move / Shift to Another Date Button */}
          <button
            type="button"
            onClick={() => {
              setTargetMoveDate('');
              setShowMoveModal(true);
            }}
            disabled={isSaving || isLoading || !loadedDate || totalFilledEntries === 0}
            className="flex items-center px-3.5 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors shadow-sm disabled:opacity-40 text-sm"
            title="Shift / Move this day's attendance to another date"
          >
            <ArrowRightLeft className="w-4 h-4 mr-1.5" />
            Move Date
          </button>
        </div>
      </div>

      {loadedDate && (
        <div className="text-xs text-center text-muted-foreground">
          {dateChanged 
            ? <span className="text-amber-600 font-medium">⚠ Date changed — press "Load Date" to load {pendingDate}'s data (current entries are still safe)</span>
            : <span className="text-green-600 font-medium">✓ Showing data for: {loadedDate} ({dayName})</span>
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

      {/* Category Filter Tabs */}
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

      {/* Attendance Table */}
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
                    No active employees found for this date.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const att = attendance[emp.id!] || { present: 0, otHours: 0, refreshment: 0 };
                  const { perDayAmount, otAmount } = calculateAmounts(emp, att);
                  const refVal = Number(att.refreshment) || 0;
                  const totalEst = Math.round(perDayAmount + otAmount + refVal);

                  return (
                    <tr key={emp.id} className="hover:bg-muted/50 transition-colors border-b border-border">
                      <td className="px-3 py-2 font-bold text-primary">
                        {emp.employeeCode ?? '-'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-foreground">{emp.name}</div>
                        {emp.fatherName && (
                          <div className="text-[11px] text-muted-foreground">
                            S/O: {emp.fatherName}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {emp.category === 'COMPANY' ? 'Company' : `Wages (${emp.contractorName || 'N/A'})`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{emp.designation}</td>
                      <td className="px-3 py-2 font-medium">₹ {emp.basicSalary?.toLocaleString() ?? 0}</td>
                      
                      {/* Attendance Radio Pills */}
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleInputChange(emp.id!, 'present', 1)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                              att.present === 1 
                                ? 'bg-green-600 text-white shadow-sm' 
                                : 'bg-muted hover:bg-green-50 hover:text-green-600 text-muted-foreground'
                            }`}
                          >
                            P (1)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInputChange(emp.id!, 'present', 0.5)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                              att.present === 0.5 
                                ? 'bg-amber-500 text-white shadow-sm' 
                                : 'bg-muted hover:bg-amber-50 hover:text-amber-600 text-muted-foreground'
                            }`}
                          >
                            H (0.5)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInputChange(emp.id!, 'present', 0)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                              att.present === 0 
                                ? 'bg-red-600 text-white shadow-sm' 
                                : 'bg-muted hover:bg-red-50 hover:text-red-600 text-muted-foreground'
                            }`}
                          >
                            A (0)
                          </button>
                        </div>
                      </td>

                      {/* OT Hours */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="text"
                            inputMode="decimal"
                            className="w-16 px-2 py-1 border border-input rounded-md text-sm font-medium text-center bg-background"
                            value={att.otHours === 0 ? '' : att.otHours}
                            onChange={(e) => handleOTChange(emp.id!, e.target.value)}
                            placeholder="0"
                          />
                          <span className="text-xs text-muted-foreground">hrs</span>
                        </div>
                      </td>

                      {/* Refreshment */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">₹</span>
                          <input 
                            type="text"
                            inputMode="numeric"
                            className="w-16 px-2 py-1 border border-input rounded-md text-sm font-medium text-center bg-background"
                            value={att.refreshment === 0 ? '' : att.refreshment}
                            onChange={(e) => handleRefreshmentChange(emp.id!, e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </td>

                      {/* Auto Calculation Column */}
                      <td className="px-3 py-2">
                        <div className="text-xs space-y-0.5">
                          <div className="text-foreground font-medium">₹{totalEst} total</div>
                          <div className="text-muted-foreground text-[11px]">
                            Duty: ₹{Math.round(perDayAmount)} | OT: ₹{Math.round(otAmount)}
                            {refVal > 0 && ` | Ref: ₹${refVal}`}
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

      {/* Move / Shift Date Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl flex flex-col">
            <div className="p-4 border-b border-border flex justify-between items-center bg-amber-50/70 rounded-t-xl">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-600" />
                <h2 className="text-lg font-bold text-foreground">Move Attendance to Another Date</h2>
              </div>
              <button 
                onClick={() => setShowMoveModal(false)}
                className="text-muted-foreground hover:text-foreground text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMoveDate} className="p-4 space-y-4">
              {/* Current Date Info */}
              <div className="p-3 bg-muted/40 rounded-lg border border-border">
                <div className="text-xs text-muted-foreground">Current (Galat) Date:</div>
                <div className="text-base font-bold text-foreground">{loadedDate} ({dayName})</div>
                <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                  <span>Present: <strong className="text-green-700">{summary.totalPresent}</strong></span>
                  <span>OT: <strong className="text-blue-700">{summary.totalOT} hrs</strong></span>
                  <span>Filled: <strong className="text-primary">{totalFilledEntries} emps</strong></span>
                </div>
              </div>

              {/* Target Date Picker */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  Select New / Correct Date (Sahi Date Chunein) *
                </label>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm font-medium"
                    value={targetMoveDate}
                    onChange={(e) => setTargetMoveDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                {targetMoveDate && (
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    Target Day: <span className="text-foreground font-bold">{getDayName(targetMoveDate)}</span>
                    {isSunday(targetMoveDate) && (
                      <span className="text-amber-700 ml-1 font-semibold">(Sunday: OT ≥ 6h will auto-apply ₹60 Ref)</span>
                    )}
                  </p>
                )}
              </div>

              {/* Notice */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                <div className="font-semibold flex items-center gap-1 text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Attention / Dhyan Dein:
                </div>
                <p>
                  • Is action se <strong>{loadedDate}</strong> ka pura attendance & OT data <strong>{targetMoveDate || 'New Date'}</strong> par shift ho jayega.
                </p>
                <p>
                  • Purani date (<strong>{loadedDate}</strong>) se sabhi entries automatically delete/clear ho jayengi.
                </p>
                <p>
                  • Agar target date par pehle se koi entry hogi to wo replace/overwrite ho jayegi.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowMoveModal(false)}
                  className="px-4 py-2 border border-input rounded-md text-sm"
                  disabled={isMoving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-sm font-semibold disabled:opacity-50 flex items-center"
                  disabled={isMoving || !targetMoveDate || targetMoveDate === loadedDate}
                >
                  {isMoving ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Moving Data...</>
                  ) : (
                    <><ArrowRightLeft className="w-4 h-4 mr-2" />Confirm & Move</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

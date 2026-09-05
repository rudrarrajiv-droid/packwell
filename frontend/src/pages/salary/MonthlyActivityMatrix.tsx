import React, { useState, useMemo } from 'react';
import { Calendar, Users, IndianRupee, Loader2 } from 'lucide-react';
import type { Employee } from '../../lib/supabase/employeeService';
import type { AttendanceRecord } from '../../lib/supabase/attendanceService';

interface MonthlyActivityMatrixProps {
  dates: string[];
  employees: Employee[];
  records: AttendanceRecord[];
  isLoading: boolean;
  onSelectEmployee?: (employee: Employee) => void;
  showAllEmployees: boolean;
  onToggleShowAll: (val: boolean) => void;
}

export default function MonthlyActivityMatrix({
  dates,
  employees,
  records,
  isLoading,
  onSelectEmployee,
  showAllEmployees,
  onToggleShowAll,
}: MonthlyActivityMatrixProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Fast lookup map: map[employeeId][date] = AttendanceRecord
  const recordMap = useMemo(() => {
    const map: Record<string, Record<string, AttendanceRecord>> = {};
    records.forEach(r => {
      if (!map[r.employeeId]) {
        map[r.employeeId] = {};
      }
      map[r.employeeId][r.date] = r;
    });
    return map;
  }, [records]);

  // Compute calculated values per employee
  const employeeData = useMemo(() => {
    return employees
      .map(emp => {
        const empRecordsMap = recordMap[emp.id || ''] || {};
        let totalPresent = 0;
        let totalOTHours = 0;
        let totalRefreshment = 0;
        let totalDaysAmount = 0;
        let totalOTAmount = 0;

        dates.forEach(d => {
          const rec = empRecordsMap[d];
          if (rec) {
            totalPresent += rec.present || 0;
            totalOTHours += rec.otHours || 0;
            totalRefreshment += rec.refreshment || 0;
            totalDaysAmount += rec.perDayAmount || 0;
            totalOTAmount += rec.otAmount || 0;
          }
        });

        const grossSalary = Math.round(totalDaysAmount) + Math.round(totalOTAmount) + Math.round(totalRefreshment);

        return {
          ...emp,
          recordsByDate: empRecordsMap,
          totalPresent,
          totalOTHours,
          totalRefreshment: Math.round(totalRefreshment),
          totalDaysAmount: Math.round(totalDaysAmount),
          totalOTAmount: Math.round(totalOTAmount),
          grossSalary,
        };
      })
      .filter(emp => {
        // Filter out zero-activity employees if showAllEmployees is false
        if (!showAllEmployees && emp.totalPresent === 0 && emp.totalOTHours === 0) {
          return false;
        }
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchName = emp.name.toLowerCase().includes(term);
          const matchDesig = (emp.designation || '').toLowerCase().includes(term);
          const matchContractor = (emp.contractorName || '').toLowerCase().includes(term);
          return matchName || matchDesig || matchContractor;
        }
        return true;
      });
  }, [employees, dates, recordMap, showAllEmployees, searchTerm]);

  // Column-wise totals for each date
  const dateTotals = useMemo(() => {
    const totals: Record<string, { present: number; ot: number; ref: number }> = {};
    dates.forEach(d => {
      let p = 0;
      let ot = 0;
      let ref = 0;
      employeeData.forEach(emp => {
        const rec = emp.recordsByDate[d];
        if (rec) {
          p += rec.present || 0;
          ot += rec.otHours || 0;
          ref += rec.refreshment || 0;
        }
      });
      totals[d] = { present: p, ot, ref: Math.round(ref) };
    });
    return totals;
  }, [dates, employeeData]);

  // Overall grand totals
  const grandTotals = useMemo(() => {
    return employeeData.reduce(
      (acc, emp) => ({
        totalPresent: acc.totalPresent + emp.totalPresent,
        totalOTHours: acc.totalOTHours + emp.totalOTHours,
        totalRefreshment: acc.totalRefreshment + emp.totalRefreshment,
        totalDaysAmount: acc.totalDaysAmount + emp.totalDaysAmount,
        totalOTAmount: acc.totalOTAmount + emp.totalOTAmount,
        grossSalary: acc.grossSalary + emp.grossSalary,
      }),
      {
        totalPresent: 0,
        totalOTHours: 0,
        totalRefreshment: 0,
        totalDaysAmount: 0,
        totalOTAmount: 0,
        grossSalary: 0,
      }
    );
  }, [employeeData]);

  const thStickyClass = "px-2 py-2.5 text-left font-semibold text-xs text-foreground uppercase tracking-wider bg-muted/90 backdrop-blur-sm border-b border-r border-border";
  const tdStickyClass = "px-2.5 py-2 text-xs font-medium border-b border-r border-border bg-card group-hover:bg-muted/40 transition-colors";

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Top Controls & Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 p-2.5 rounded-lg border border-border text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <input
            type="text"
            placeholder="Search employee / designation..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-xs w-56 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <label className="flex items-center gap-2 cursor-pointer select-none text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={showAllEmployees}
              onChange={e => onToggleShowAll(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span>Show all employees (including 0 attendance)</span>
          </label>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
          <span className="font-semibold text-foreground">Legend:</span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">P</span>
            <span>= Full Day (1)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">HD</span>
            <span>= Half Day (0.5)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-muted-foreground font-bold">-</span>
            <span>= Absent (0)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-blue-600 dark:text-blue-400 font-bold">OT</span>
            <span>= Hours</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-purple-600 dark:text-purple-400 font-bold">Ref</span>
            <span>= Expense (₹)</span>
          </span>
        </div>
      </div>

      {/* Main Matrix Table */}
      <div className="bg-card border border-border rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-xs text-left border-separate border-spacing-0">
            {/* Table Header */}
            <thead className="sticky top-0 z-20 shadow-sm">
              {/* Header Row 1: Date Titles & Main Headers */}
              <tr>
                {/* Sticky Left Headers */}
                <th
                  rowSpan={2}
                  className={`${thStickyClass} sticky left-0 z-30 w-10 min-w-[40px] text-center`}
                  style={{ left: 0 }}
                >
                  Sr.
                </th>
                <th
                  rowSpan={2}
                  className={`${thStickyClass} sticky z-30 w-44 min-w-[170px]`}
                  style={{ left: '40px' }}
                >
                  Employee Name
                </th>
                <th
                  rowSpan={2}
                  className={`${thStickyClass} sticky z-30 w-28 min-w-[110px]`}
                  style={{ left: '210px' }}
                >
                  Category
                </th>
                <th
                  rowSpan={2}
                  className={`${thStickyClass} sticky z-30 w-28 min-w-[110px] border-r-2 border-border`}
                  style={{ left: '320px' }}
                >
                  Basic
                </th>

                {/* 1 to 31 Date Columns (Span 3 each) */}
                {dates.map(dateStr => {
                  const dateObj = new Date(dateStr + 'T00:00:00');
                  const dayNum = String(dateObj.getDate()).padStart(2, '0');
                  const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
                  const isSunday = dateObj.getDay() === 0;

                  return (
                    <th
                      key={dateStr}
                      colSpan={3}
                      className={`py-1.5 px-1 text-center font-bold text-xs border-b border-r-2 border-border/80 whitespace-nowrap ${
                        isSunday
                          ? 'bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                          : 'bg-muted/90 text-foreground'
                      }`}
                    >
                      <div className="flex flex-col items-center leading-tight">
                        <span className="text-[13px] font-black">{dayNum}</span>
                        <span className={`text-[10px] uppercase font-semibold ${isSunday ? 'text-rose-600 font-bold' : 'text-muted-foreground'}`}>
                          {dayName}
                        </span>
                      </div>
                    </th>
                  );
                })}

                {/* Right Side Summary Columns (Span 1 each, rowSpan 2) */}
                <th
                  rowSpan={2}
                  className="px-2 py-2 text-center font-bold text-xs text-foreground uppercase tracking-wider bg-muted/95 border-b border-r border-border min-w-[65px]"
                >
                  Total Days
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2 text-center font-bold text-xs text-foreground uppercase tracking-wider bg-muted/95 border-b border-r border-border min-w-[65px]"
                >
                  Total OT
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2 text-center font-bold text-xs text-foreground uppercase tracking-wider bg-muted/95 border-b border-r border-border min-w-[65px]"
                >
                  Total Ref
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2 text-center font-bold text-xs text-foreground uppercase tracking-wider bg-muted/95 border-b border-r border-border min-w-[75px]"
                >
                  Days Amt
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2 text-center font-bold text-xs text-foreground uppercase tracking-wider bg-muted/95 border-b border-r border-border min-w-[75px]"
                >
                  OT Amt
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2 text-center font-bold text-xs text-emerald-700 dark:text-emerald-400 uppercase tracking-wider bg-emerald-50/80 dark:bg-emerald-950/40 border-b border-border min-w-[90px]"
                >
                  Gross Salary
                </th>
              </tr>

              {/* Header Row 2: Sub-headers (Duty, OT, Ref) for each date */}
              <tr>
                {dates.map(dateStr => {
                  const dateObj = new Date(dateStr + 'T00:00:00');
                  const isSunday = dateObj.getDay() === 0;
                  const bgSub = isSunday ? 'bg-rose-50/70 dark:bg-rose-950/30' : 'bg-muted/80';

                  return (
                    <React.Fragment key={`sub-${dateStr}`}>
                      <th
                        className={`py-1 px-0.5 text-center font-semibold text-[10px] uppercase border-b border-r border-border/50 text-muted-foreground w-8 min-w-[32px] max-w-[36px] ${bgSub}`}
                        title="Duty Status (P / HD / -)"
                      >
                        Duty
                      </th>
                      <th
                        className={`py-1 px-0.5 text-center font-semibold text-[10px] uppercase border-b border-r border-border/50 text-blue-600 dark:text-blue-400 w-8 min-w-[32px] max-w-[36px] ${bgSub}`}
                        title="Overtime Hours"
                      >
                        OT
                      </th>
                      <th
                        className={`py-1 px-0.5 text-center font-semibold text-[10px] uppercase border-b border-r-2 border-border/80 text-purple-600 dark:text-purple-400 w-9 min-w-[36px] max-w-[42px] ${bgSub}`}
                        title="Refreshment / OT Expense (₹)"
                      >
                        Ref
                      </th>
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={4 + dates.length * 3 + 6} className="text-center py-16 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                    Loading monthly attendance records...
                  </td>
                </tr>
              ) : employeeData.length === 0 ? (
                <tr>
                  <td colSpan={4 + dates.length * 3 + 6} className="text-center py-16 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No employees matching the selected criteria found.
                  </td>
                </tr>
              ) : (
                employeeData.map((emp, idx) => (
                  <tr
                    key={emp.id || idx}
                    className="group hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => onSelectEmployee && onSelectEmployee(emp)}
                    title="Click to view employee ledger"
                  >
                    {/* Sticky Left: Sr. */}
                    <td
                      className={`${tdStickyClass} sticky left-0 z-10 text-center font-mono text-muted-foreground`}
                      style={{ left: 0 }}
                    >
                      {idx + 1}
                    </td>

                    {/* Sticky Left: Employee Name & Designation */}
                    <td
                      className={`${tdStickyClass} sticky z-10 font-medium text-foreground whitespace-nowrap`}
                      style={{ left: '40px' }}
                    >
                      <div className="font-semibold text-foreground truncate max-w-[160px]" title={emp.name}>
                        {emp.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                        {emp.designation || 'Worker'}
                      </div>
                    </td>

                    {/* Sticky Left: Category */}
                    <td
                      className={`${tdStickyClass} sticky z-10 whitespace-nowrap`}
                      style={{ left: '210px' }}
                    >
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          emp.category === 'COMPANY'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {emp.category === 'COMPANY'
                          ? 'Company'
                          : `Wages ${emp.contractorName ? `(${emp.contractorName})` : ''}`}
                      </span>
                    </td>

                    {/* Sticky Left: Basic Salary */}
                    <td
                      className={`${tdStickyClass} sticky z-10 text-right font-mono border-r-2 border-border whitespace-nowrap`}
                      style={{ left: '320px' }}
                    >
                      ₹{emp.basicSalary?.toLocaleString() || 0}
                    </td>

                    {/* Date-wise Columns: 3 columns per date */}
                    {dates.map(dateStr => {
                      const rec = emp.recordsByDate[dateStr];
                      const dateObj = new Date(dateStr + 'T00:00:00');
                      const isSunday = dateObj.getDay() === 0;
                      const cellBg = isSunday ? 'bg-rose-50/30 dark:bg-rose-950/10' : '';

                      const present = rec ? rec.present : 0;
                      const ot = rec ? rec.otHours : 0;
                      const ref = rec ? rec.refreshment : 0;

                      return (
                        <React.Fragment key={`${emp.id}-${dateStr}`}>
                          {/* Duty Status */}
                          <td
                            className={`py-1.5 px-0.5 text-center border-b border-r border-border/40 font-semibold text-[11px] ${cellBg}`}
                          >
                            {present === 1 ? (
                              <span className="inline-block px-1 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                P
                              </span>
                            ) : present === 0.5 ? (
                              <span className="inline-block px-1 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                                HD
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40 font-normal">-</span>
                            )}
                          </td>

                          {/* OT Hours */}
                          <td
                            className={`py-1.5 px-0.5 text-center border-b border-r border-border/40 text-[11px] font-mono ${cellBg}`}
                          >
                            {ot > 0 ? (
                              <span className="font-bold text-blue-600 dark:text-blue-400">{ot}</span>
                            ) : (
                              <span className="text-muted-foreground/30">-</span>
                            )}
                          </td>

                          {/* Refreshment */}
                          <td
                            className={`py-1.5 px-0.5 text-center border-b border-r-2 border-border/80 text-[11px] font-mono ${cellBg}`}
                          >
                            {ref > 0 ? (
                              <span className="font-semibold text-purple-600 dark:text-purple-400">
                                {ref}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30">-</span>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}

                    {/* Summary Columns */}
                    <td className="px-2 py-1.5 text-center font-bold text-primary border-b border-r border-border">
                      {emp.totalPresent}
                    </td>
                    <td className="px-2 py-1.5 text-center font-bold text-blue-600 dark:text-blue-400 border-b border-r border-border font-mono">
                      {emp.totalOTHours.toFixed(1)}
                    </td>
                    <td className="px-2 py-1.5 text-center font-semibold text-purple-600 dark:text-purple-400 border-b border-r border-border font-mono">
                      ₹{emp.totalRefreshment}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono border-b border-r border-border">
                      ₹{emp.totalDaysAmount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono border-b border-r border-border">
                      ₹{emp.totalOTAmount.toLocaleString()}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-border font-mono">
                      ₹{emp.grossSalary.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Bottom Total Row */}
            {!isLoading && employeeData.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 shadow-md">
                <tr className="bg-muted font-bold border-t-2 border-border">
                  {/* Sticky Left: TOTAL */}
                  <td
                    colSpan={4}
                    className="px-3 py-2.5 text-right font-bold uppercase text-foreground sticky left-0 z-30 bg-muted border-r-2 border-border"
                    style={{ left: 0 }}
                  >
                    Daily Total
                  </td>

                  {/* Date-wise Totals: 3 columns per date */}
                  {dates.map(dateStr => {
                    const dt = dateTotals[dateStr] || { present: 0, ot: 0, ref: 0 };
                    const dateObj = new Date(dateStr + 'T00:00:00');
                    const isSunday = dateObj.getDay() === 0;
                    const bgTotal = isSunday ? 'bg-rose-100/50 dark:bg-rose-950/50' : 'bg-muted';

                    return (
                      <React.Fragment key={`tot-${dateStr}`}>
                        <td
                          className={`py-2 px-0.5 text-center font-bold text-[11px] text-foreground border-r border-border/50 ${bgTotal}`}
                          title={`Total Present on ${dateStr}`}
                        >
                          {dt.present > 0 ? dt.present : '-'}
                        </td>
                        <td
                          className={`py-2 px-0.5 text-center font-bold text-[11px] text-blue-600 dark:text-blue-400 border-r border-border/50 ${bgTotal}`}
                          title={`Total OT Hours on ${dateStr}`}
                        >
                          {dt.ot > 0 ? dt.ot : '-'}
                        </td>
                        <td
                          className={`py-2 px-0.5 text-center font-bold text-[11px] text-purple-600 dark:text-purple-400 border-r-2 border-border/80 ${bgTotal}`}
                          title={`Total Refreshment Expense on ${dateStr}`}
                        >
                          {dt.ref > 0 ? dt.ref : '-'}
                        </td>
                      </React.Fragment>
                    );
                  })}

                  {/* Overall Summary Totals */}
                  <td className="px-2 py-2.5 text-center font-extrabold text-primary border-r border-border">
                    {grandTotals.totalPresent}
                  </td>
                  <td className="px-2 py-2.5 text-center font-extrabold text-blue-600 dark:text-blue-400 border-r border-border font-mono">
                    {grandTotals.totalOTHours.toFixed(1)}
                  </td>
                  <td className="px-2 py-2.5 text-center font-extrabold text-purple-600 dark:text-purple-400 border-r border-border font-mono">
                    ₹{grandTotals.totalRefreshment.toLocaleString()}
                  </td>
                  <td className="px-2 py-2.5 text-right font-extrabold text-foreground border-r border-border font-mono">
                    ₹{grandTotals.totalDaysAmount.toLocaleString()}
                  </td>
                  <td className="px-2 py-2.5 text-right font-extrabold text-foreground border-r border-border font-mono">
                    ₹{grandTotals.totalOTAmount.toLocaleString()}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-black text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-950/50 font-mono">
                    ₹{grandTotals.grossSalary.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

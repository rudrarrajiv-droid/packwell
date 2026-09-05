import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Users, IndianRupee, Loader2, X, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getEmployees, type Employee } from '../../lib/supabase/employeeService';
import { getAttendanceByDateRange, type AttendanceRecord } from '../../lib/supabase/attendanceService';
import MonthlyActivityMatrix from './MonthlyActivityMatrix';

export default function MonthlyReportTab() {
  // Default to current month range (1st to last day of month)
  const getCurrentMonthRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return {
      start: `${y}-${m}-01`,
      end: `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    };
  };

  const initialRange = getCurrentMonthRange();
  const [fromDate, setFromDate] = useState<string>(initialRange.start);
  const [toDate, setToDate] = useState<string>(initialRange.end);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'COMPANY' | 'WAGES_DINESH' | 'WAGES_VIKAS'>('ALL');
  const [viewMode, setViewMode] = useState<'DATE' | 'EMPLOYEE' | 'MATRIX'>('MATRIX');
  const [showAllEmployeesInMatrix, setShowAllEmployeesInMatrix] = useState<boolean>(false);
  const [selectedEmployeeForLedger, setSelectedEmployeeForLedger] = useState<Employee | null>(null);

  useEffect(() => {
    fetchData();
  }, [fromDate, toDate]);

  const setThisMonth = () => {
    const range = getCurrentMonthRange();
    setFromDate(range.start);
    setToDate(range.end);
  };

  const setLastMonth = () => {
    const now = new Date();
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const mNum = now.getMonth() === 0 ? 12 : now.getMonth();
    const m = String(mNum).padStart(2, '0');
    const lastDay = new Date(y, mNum, 0).getDate();
    setFromDate(`${y}-${m}-01`);
    setToDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
  };

  // Generate date list between fromDate and toDate (1 to 31)
  const datesInRange = useMemo(() => {
    if (!fromDate || !toDate) return [];
    const dates: string[] = [];
    const [sy, sm, sd] = fromDate.split('-').map(Number);
    const [ey, em, ed] = toDate.split('-').map(Number);
    if (isNaN(sy) || isNaN(sm) || isNaN(sd) || isNaN(ey) || isNaN(em) || isNaN(ed)) return [];

    const cur = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    let count = 0;
    while (cur <= end && count < 62) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
      count++;
    }
    return dates;
  }, [fromDate, toDate]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [emps, rangeRecords] = await Promise.all([
        getEmployees(),
        getAttendanceByDateRange(fromDate, toDate)
      ]);
      setEmployees(emps);
      setRecords(rangeRecords);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (filter === 'ALL') return true;
      if (filter === 'COMPANY') return emp.category === 'COMPANY';
      if (filter === 'WAGES_DINESH') return emp.category === 'WAGES' && emp.contractorName === 'Dinesh';
      if (filter === 'WAGES_VIKAS') return emp.category === 'WAGES' && emp.contractorName === 'Vikas';
      return true;
    });
  }, [employees, filter]);

  const reportData = useMemo(() => {
    const data: any[] = [];
    
    filteredEmployees.forEach(emp => {
      // Filter records for this employee
      const empRecords = records.filter(r => r.employeeId === emp.id);
      
      const totalPresent = empRecords.reduce((sum, r) => sum + r.present, 0);
      const totalOTHours = empRecords.reduce((sum, r) => sum + r.otHours, 0);
      
      // REQUIREMENT: JIS EMPLOYEE KA EK BHI DAY ME PESENT YA OT NAHI HAI USKA NAAM SHOW NA HO
      if (totalPresent === 0 && totalOTHours === 0) {
        return;
      }

      const totalDaysAmount = Math.round(empRecords.reduce((sum, r) => sum + r.perDayAmount, 0));
      const totalOTAmount = Math.round(empRecords.reduce((sum, r) => sum + r.otAmount, 0));
      const totalRefreshment = Math.round(empRecords.reduce((sum, r) => sum + r.refreshment, 0));
      const grossSalary = totalDaysAmount + totalOTAmount + totalRefreshment;

      data.push({
        ...emp,
        totalPresent,
        totalOTHours,
        totalDaysAmount,
        totalOTAmount,
        totalRefreshment,
        grossSalary
      });
    });

    return data;
  }, [filteredEmployees, records]);

  const dateWiseData = useMemo(() => {
    const datesMap: Record<string, any> = {};
    
    // We only care about filtered records
    const relevantRecords = records.filter(r => filteredEmployees.some(emp => emp.id === r.employeeId));

    relevantRecords.forEach(r => {
      if (!datesMap[r.date]) {
        datesMap[r.date] = {
          date: r.date,
          companyCount: 0,
          dineshCount: 0,
          vikasCount: 0,
          totalDaysAmount: 0,
          totalOTAmount: 0,
          totalRefreshment: 0,
          grossSalary: 0
        };
      }
      
      const emp = filteredEmployees.find(e => e.id === r.employeeId);
      if (!emp) return;

      // Count if present > 0 (even half day counts as present for manpower count)
      if (r.present > 0) {
        if (emp.category === 'COMPANY') datesMap[r.date].companyCount++;
        else if (emp.contractorName === 'Dinesh') datesMap[r.date].dineshCount++;
        else if (emp.contractorName === 'Vikas') datesMap[r.date].vikasCount++;
      }

      datesMap[r.date].totalDaysAmount += r.perDayAmount;
      datesMap[r.date].totalOTAmount += r.otAmount;
      datesMap[r.date].totalRefreshment += r.refreshment;
      datesMap[r.date].grossSalary += (r.perDayAmount + r.otAmount + r.refreshment);
    });

    return Object.values(datesMap).sort((a: any, b: any) => a.date.localeCompare(b.date)).map((d: any) => ({
      ...d,
      totalDaysAmount: Math.round(d.totalDaysAmount),
      totalOTAmount: Math.round(d.totalOTAmount),
      totalRefreshment: Math.round(d.totalRefreshment),
      grossSalary: Math.round(d.grossSalary)
    }));
  }, [records, filteredEmployees]);

  const exportMatrixExcel = () => {
    if (datesInRange.length === 0) {
      alert("Please select a valid date range.");
      return;
    }

    const recordMap: Record<string, Record<string, AttendanceRecord>> = {};
    records.forEach(r => {
      if (!recordMap[r.employeeId]) recordMap[r.employeeId] = {};
      recordMap[r.employeeId][r.date] = r;
    });

    const activeEmps = filteredEmployees
      .map(emp => {
        const empRecordsMap = recordMap[emp.id || ''] || {};
        let totalPresent = 0;
        let totalOTHours = 0;
        let totalRefreshment = 0;
        let totalDaysAmount = 0;
        let totalOTAmount = 0;

        datesInRange.forEach(d => {
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
        if (!showAllEmployeesInMatrix && emp.totalPresent === 0 && emp.totalOTHours === 0) {
          return false;
        }
        return true;
      });

    if (activeEmps.length === 0) {
      alert("No employee data available to export for this period.");
      return;
    }

    const dateTotals: Record<string, { present: number; ot: number; ref: number }> = {};
    datesInRange.forEach(d => {
      let p = 0;
      let ot = 0;
      let ref = 0;
      activeEmps.forEach(emp => {
        const rec = emp.recordsByDate[d];
        if (rec) {
          p += rec.present || 0;
          ot += rec.otHours || 0;
          ref += rec.refreshment || 0;
        }
      });
      dateTotals[d] = { present: p, ot, ref: Math.round(ref) };
    });

    const grandTotals = activeEmps.reduce(
      (acc, emp) => ({
        totalPresent: acc.totalPresent + emp.totalPresent,
        totalOTHours: acc.totalOTHours + emp.totalOTHours,
        totalRefreshment: acc.totalRefreshment + emp.totalRefreshment,
        totalDaysAmount: acc.totalDaysAmount + emp.totalDaysAmount,
        totalOTAmount: acc.totalOTAmount + emp.totalOTAmount,
        grossSalary: acc.grossSalary + emp.grossSalary,
      }),
      { totalPresent: 0, totalOTHours: 0, totalRefreshment: 0, totalDaysAmount: 0, totalOTAmount: 0, grossSalary: 0 }
    );

    const headerRow1: (string | number)[] = ['Sr.', 'Employee Name', 'Category', 'Designation', 'Basic Salary'];
    const headerRow2: (string | number)[] = ['', '', '', '', ''];

    datesInRange.forEach(dateStr => {
      const dateObj = new Date(dateStr + 'T00:00:00');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
      const label = `${day}/${month} (${dayName})`;

      headerRow1.push(label, '', '');
      headerRow2.push('Duty', 'OT (Hrs)', 'Refreshment (₹)');
    });

    headerRow1.push('Total Days', 'Total OT (Hrs)', 'Total Ref (₹)', 'Days Amount (₹)', 'OT Amount (₹)', 'Gross Salary (₹)');
    headerRow2.push('', '', '', '', '', '');

    const dataRows: (string | number)[][] = [headerRow1, headerRow2];

    activeEmps.forEach((emp, index) => {
      const row: (string | number)[] = [
        index + 1,
        emp.name,
        emp.category === 'COMPANY' ? 'Company' : `Wages (${emp.contractorName || ''})`,
        emp.designation || '',
        emp.basicSalary || 0,
      ];

      datesInRange.forEach(dateStr => {
        const rec = emp.recordsByDate[dateStr];
        let dutyStr = '-';
        let otVal: string | number = '-';
        let refVal: string | number = '-';

        if (rec) {
          if (rec.present === 1) dutyStr = 'P';
          else if (rec.present === 0.5) dutyStr = 'HD';
          else if (rec.present === 0) dutyStr = 'A';

          if (rec.otHours > 0) otVal = rec.otHours;
          if (rec.refreshment > 0) refVal = rec.refreshment;
        }

        row.push(dutyStr, otVal, refVal);
      });

      row.push(
        emp.totalPresent,
        emp.totalOTHours,
        emp.totalRefreshment,
        emp.totalDaysAmount,
        emp.totalOTAmount,
        emp.grossSalary
      );

      dataRows.push(row);
    });

    const totalRow: (string | number)[] = ['TOTAL', '', '', '', ''];
    datesInRange.forEach(d => {
      const dt = dateTotals[d] || { present: 0, ot: 0, ref: 0 };
      totalRow.push(dt.present || 0, dt.ot || 0, dt.ref || 0);
    });
    totalRow.push(
      grandTotals.totalPresent,
      grandTotals.totalOTHours,
      grandTotals.totalRefreshment,
      grandTotals.totalDaysAmount,
      grandTotals.totalOTAmount,
      grandTotals.grossSalary
    );
    dataRows.push(totalRow);

    const worksheet = XLSX.utils.aoa_to_sheet(dataRows);

    const merges: XLSX.Range[] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
      { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
    ];

    datesInRange.forEach((_, i) => {
      const startCol = 5 + i * 3;
      merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + 2 } });
    });

    const summaryStartCol = 5 + datesInRange.length * 3;
    for (let c = 0; c < 6; c++) {
      merges.push({ s: { r: 0, c: summaryStartCol + c }, e: { r: 1, c: summaryStartCol + c } });
    }

    const lastRowIdx = dataRows.length - 1;
    merges.push({ s: { r: lastRowIdx, c: 0 }, e: { r: lastRowIdx, c: 4 } });

    worksheet['!merges'] = merges;

    const cols: { wch: number }[] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 15 },
      { wch: 16 },
      { wch: 12 },
    ];

    datesInRange.forEach(() => {
      cols.push({ wch: 7 }, { wch: 8 }, { wch: 10 });
    });

    cols.push(
      { wch: 11 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 15 }
    );

    worksheet['!cols'] = cols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Activity Matrix');
    XLSX.writeFile(workbook, `Monthly_Activity_Matrix_${fromDate}_to_${toDate}_${filter}.xlsx`);
  };

  const handleExportExcel = () => {
    if (viewMode === 'MATRIX') {
      exportMatrixExcel();
    } else if (viewMode === 'EMPLOYEE') {
      if (reportData.length === 0) {
        alert("No data available to export for this period.");
        return;
      }
      const exportData = reportData.map(row => ({
        Category: row.category === 'COMPANY' ? 'Company' : `Wages (${row.contractorName || ''})`,
        "Employee Name": row.name,
        Designation: row.designation,
        "Basic Salary": row.basicSalary,
        "Total Days": row.totalPresent,
        "Days Amount": row.totalDaysAmount,
        "Total OT (Hrs)": row.totalOTHours,
        "OT Amount": row.totalOTAmount,
        "Refreshment": row.totalRefreshment,
        "Gross Salary": row.grossSalary
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Salary Report");
      XLSX.writeFile(workbook, `Salary_Report_${fromDate}_to_${toDate}_${filter}.xlsx`);
    } else {
      if (dateWiseData.length === 0) {
        alert("No data available to export for this period.");
        return;
      }
      const exportData = dateWiseData.map(row => ({
        Date: new Date(row.date).toLocaleDateString('en-GB'),
        "Company Count": row.companyCount,
        "Dinesh Count": row.dineshCount,
        "Vikas Count": row.vikasCount,
        "Days Amount": row.totalDaysAmount,
        "OT Amount": row.totalOTAmount,
        "Refreshment": row.totalRefreshment,
        "Gross Salary": row.grossSalary
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Date_Wise_Salary");
      XLSX.writeFile(workbook, `Date_Wise_Salary_${fromDate}_to_${toDate}_${filter}.xlsx`);
    }
  };

  const thClass = "px-3 py-3 border-b border-border text-left font-medium text-muted-foreground whitespace-nowrap";
  const tdClass = "px-3 py-3 border-b border-border";

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-card p-4 rounded-lg border border-border shadow-sm gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Salary & Wages Report</h2>
          <p className="text-sm text-muted-foreground">Aggregated view of employee attendance and salary for selected period</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border">
            <button
              onClick={() => setViewMode('MATRIX')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'MATRIX' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Activity Matrix (1-31)
            </button>
            <button
              onClick={() => setViewMode('DATE')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'DATE' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Date Wise
            </button>
            <button
              onClick={() => setViewMode('EMPLOYEE')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'EMPLOYEE' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Employee Summary
            </button>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors shadow-sm"
          >
            <FileDown className="w-5 h-5 mr-2" />
            Export Excel
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={setThisMonth}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors shadow-sm"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={setLastMonth}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors shadow-sm"
            >
              Last Month
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">From:</span>
            <input 
              type="date" 
              className="px-3 py-2 border border-input rounded-lg bg-background font-medium shadow-sm text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">To:</span>
            <input 
              type="date" 
              className="px-3 py-2 border border-input rounded-lg bg-background font-medium shadow-sm text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </div>

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

      {viewMode === 'MATRIX' ? (
        <MonthlyActivityMatrix
          dates={datesInRange}
          employees={filteredEmployees}
          records={records}
          isLoading={isLoading}
          onSelectEmployee={(emp) => setSelectedEmployeeForLedger(emp)}
          showAllEmployees={showAllEmployeesInMatrix}
          onToggleShowAll={setShowAllEmployeesInMatrix}
        />
      ) : (
        <div className="bg-card border border-border rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            {viewMode === 'DATE' ? (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className={thClass}>Date</th>
                  <th className={thClass}>Company Count</th>
                  <th className={thClass}>Dinesh Count</th>
                  <th className={thClass}>Vikas Count</th>
                  <th className={thClass}>Total Days Amount</th>
                  <th className={thClass}>Total OT Amount</th>
                  <th className={thClass}>Total Refreshment</th>
                  <th className={thClass}>Grand Total</th>
                </tr>
              </thead>
              {/* Grand Totals at Top for Date View */}
              {!isLoading && dateWiseData.length > 0 && (
                <tbody className="bg-muted/30 border-b-2 border-border font-bold">
                  <tr>
                    <td className="px-3 py-4 text-right text-foreground uppercase tracking-wider">Grand Total</td>
                    <td className="px-3 py-4 text-primary">{dateWiseData.reduce((sum, r) => sum + r.companyCount, 0)}</td>
                    <td className="px-3 py-4 text-primary">{dateWiseData.reduce((sum, r) => sum + r.dineshCount, 0)}</td>
                    <td className="px-3 py-4 text-primary">{dateWiseData.reduce((sum, r) => sum + r.vikasCount, 0)}</td>
                    <td className="px-3 py-4 text-foreground">₹{dateWiseData.reduce((sum, r) => sum + r.totalDaysAmount, 0)}</td>
                    <td className="px-3 py-4 text-foreground">₹{dateWiseData.reduce((sum, r) => sum + r.totalOTAmount, 0)}</td>
                    <td className="px-3 py-4 text-foreground">₹{dateWiseData.reduce((sum, r) => sum + r.totalRefreshment, 0)}</td>
                    <td className="px-3 py-4 text-green-700 bg-green-100/50">
                      <div className="flex items-center">
                        <IndianRupee className="w-4 h-4 mr-1" />
                        {dateWiseData.reduce((sum, r) => sum + r.grossSalary, 0)}
                      </div>
                    </td>
                  </tr>
                </tbody>
              )}
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                      Calculating date-wise report...
                    </td>
                  </tr>
                ) : dateWiseData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground">
                      <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      No attendance records found from {fromDate} to {toDate}.
                    </td>
                  </tr>
                ) : (
                  dateWiseData.map((row, index) => (
                    <tr key={index} className="hover:bg-muted/50 transition-colors">
                      <td className={`${tdClass} font-bold text-foreground`}>
                        {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className={`${tdClass} font-semibold text-blue-600`}>{row.companyCount}</td>
                      <td className={`${tdClass} font-semibold text-amber-600`}>{row.dineshCount}</td>
                      <td className={`${tdClass} font-semibold text-purple-600`}>{row.vikasCount}</td>
                      <td className={tdClass}>₹{row.totalDaysAmount}</td>
                      <td className={tdClass}>₹{row.totalOTAmount}</td>
                      <td className={tdClass}>₹{row.totalRefreshment}</td>
                      <td className={`${tdClass} font-bold text-green-600 bg-green-50/30`}>₹{row.grossSalary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className={thClass}>Category</th>
                  <th className={thClass}>Employee Name</th>
                  <th className={thClass}>Designation</th>
                  <th className={thClass}>Basic Salary</th>
                  <th className={thClass}>Total Days</th>
                  <th className={thClass}>Days Amount</th>
                  <th className={thClass}>Total OT (Hrs)</th>
                  <th className={thClass}>OT Amount</th>
                  <th className={thClass}>Refreshment</th>
                  <th className={thClass}>Gross Salary</th>
                </tr>
              </thead>
              {/* Grand Totals at Top */}
              {!isLoading && reportData.length > 0 && (
                <tbody className="bg-muted/30 border-b-2 border-border font-bold">
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-right text-foreground uppercase tracking-wider">
                      Grand Total
                    </td>
                    <td className="px-3 py-4 text-primary">
                      {reportData.reduce((sum, r) => sum + r.totalPresent, 0)}
                    </td>
                    <td className="px-3 py-4 text-foreground">
                      ₹{reportData.reduce((sum, r) => sum + r.totalDaysAmount, 0)}
                    </td>
                    <td className="px-3 py-4 text-primary">
                      {reportData.reduce((sum, r) => sum + r.totalOTHours, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-4 text-foreground">
                      ₹{reportData.reduce((sum, r) => sum + r.totalOTAmount, 0)}
                    </td>
                    <td className="px-3 py-4 text-foreground">
                      ₹{reportData.reduce((sum, r) => sum + r.totalRefreshment, 0)}
                    </td>
                    <td className="px-3 py-4 text-green-700 bg-green-100/50">
                      <div className="flex items-center">
                        <IndianRupee className="w-4 h-4 mr-1" />
                        {reportData.reduce((sum, r) => sum + r.grossSalary, 0)}
                      </div>
                    </td>
                  </tr>
                </tbody>
              )}
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                      Calculating employee report...
                    </td>
                  </tr>
                ) : reportData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      No attendance records found from {fromDate} to {toDate}.
                    </td>
                  </tr>
                ) : (
                  reportData.map((row, index) => (
                    <tr 
                      key={index} 
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedEmployeeForLedger(row)}
                    >
                      <td className={tdClass}>
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${row.category === 'COMPANY' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                          {row.category === 'COMPANY' ? 'Company' : `Wages ${row.contractorName ? `(${row.contractorName})` : ''}`}
                        </span>
                      </td>
                      <td className={`${tdClass} font-medium text-foreground`}>{row.name}</td>
                      <td className={tdClass}>{row.designation}</td>
                      <td className={tdClass}>₹{row.basicSalary.toLocaleString()}</td>
                      
                      <td className={`${tdClass} font-semibold text-primary`}>{row.totalPresent}</td>
                      <td className={tdClass}>₹{row.totalDaysAmount}</td>
                      
                      <td className={`${tdClass} font-semibold text-primary`}>{row.totalOTHours.toFixed(2)}</td>
                      <td className={tdClass}>₹{row.totalOTAmount}</td>
                      
                      <td className={tdClass}>₹{row.totalRefreshment}</td>
                      
                      <td className={`${tdClass} font-bold text-green-600 bg-green-50/30`}>
                        ₹{row.grossSalary}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}

      {/* Ledger Modal */}
      {selectedEmployeeForLedger && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-card w-full max-w-5xl rounded-lg border border-border shadow-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Employee Ledger
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedEmployeeForLedger.name} ({selectedEmployeeForLedger.designation}) - {fromDate} to {toDate}
                </p>
              </div>
              <button 
                onClick={() => setSelectedEmployeeForLedger(null)}
                className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <table className="w-full text-sm text-left border border-border rounded-lg overflow-hidden">
                <thead className="text-xs text-muted-foreground bg-muted/50">
                  <tr>
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Salary Amount</th>
                    <th className={thClass}>OT Hours</th>
                    <th className={thClass}>OT Amount</th>
                    <th className={thClass}>Refreshment</th>
                    <th className={thClass}>Daily Total</th>
                  </tr>
                </thead>
                <tbody>
                  {records
                    .filter(r => r.employeeId === selectedEmployeeForLedger.id)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(record => {
                      const dailyTotal = record.perDayAmount + record.otAmount + record.refreshment;
                      return (
                        <tr key={record.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                          <td className={`${tdClass} font-medium`}>
                            {new Date(record.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className={tdClass}>
                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                              record.present === 1 ? 'bg-green-100 text-green-800' : 
                              record.present === 0.5 ? 'bg-amber-100 text-amber-800' : 
                              'bg-red-100 text-red-800'
                            }`}>
                              {record.present === 1 ? 'Full Day' : record.present === 0.5 ? 'Half Day' : 'Absent'}
                            </span>
                          </td>
                          <td className={tdClass}>₹{record.perDayAmount.toFixed(2)}</td>
                          <td className={tdClass}>{record.otHours}</td>
                          <td className={tdClass}>₹{record.otAmount.toFixed(2)}</td>
                          <td className={tdClass}>₹{record.refreshment.toFixed(2)}</td>
                          <td className={`${tdClass} font-bold text-primary`}>₹{dailyTotal.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  {records.filter(r => r.employeeId === selectedEmployeeForLedger.id).length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
                        No detailed records found for this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

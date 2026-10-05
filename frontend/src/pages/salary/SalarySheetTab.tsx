import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, FileDown, Loader2, Printer, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getEmployees, type Employee } from '../../lib/supabase/employeeService';
import { getAttendanceByDateRange, type AttendanceRecord } from '../../lib/supabase/attendanceService';

interface EditableRowData {
  wagesAmount?: number;
  fine?: number;
  advance?: number;
  esi?: number;
  roomRent?: number;
  electricity?: number;
  ration?: number;
  bankAccount?: string;
}

export default function SalarySheetTab() {
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
  const [filter, setFilter] = useState<'COMPANY' | 'WAGES_VIKAS' | 'WAGES_DINESH'>('COMPANY');
  
  // State for editable inputs
  const [editableData, setEditableData] = useState<Record<string, EditableRowData>>({});



  useEffect(() => {
    fetchData();
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

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (filter === 'COMPANY') return emp.category === 'COMPANY';
      if (filter === 'WAGES_DINESH') return emp.category === 'WAGES' && emp.contractorName === 'Dinesh';
      if (filter === 'WAGES_VIKAS') return emp.category === 'WAGES' && emp.contractorName === 'Vikas';
      return false;
    });
  }, [employees, filter]);

  const reportData = useMemo(() => {
    const data: any[] = [];
    
    // Calculate required working days (excluding Sundays) in the period
    const start = new Date(fromDate);
    const end = new Date(toDate);
    let requiredWorkingDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) requiredWorkingDays++;
    }

    filteredEmployees.forEach(emp => {
      const empRecords = records.filter(r => r.employeeId === emp.id);
      
      const totalPresent = empRecords.reduce((sum, r) => sum + r.present, 0);
      const totalOTHours = empRecords.reduce((sum, r) => sum + r.otHours, 0);
      
      if (totalPresent === 0 && totalOTHours === 0) {
        return;
      }

      const totalDaysAmount = Math.round(empRecords.reduce((sum, r) => sum + r.perDayAmount, 0));
      const totalOTAmount = Math.round(empRecords.reduce((sum, r) => sum + r.otAmount, 0));
      const totalRefreshment = Math.round(empRecords.reduce((sum, r) => sum + r.refreshment, 0));
      
      let presentWorkingDays = 0;
      empRecords.forEach(r => {
        if (new Date(r.date).getDay() !== 0 && r.present === 1) {
          presentWorkingDays++;
        }
      });

      const nameLower = (emp.name || '').toLowerCase();
      const isExcluded = nameLower.includes('jitender') || nameLower.includes('rajiv') || nameLower.includes('shubham') || nameLower.includes('raj kumar') || nameLower.includes('devesh');

      let autoFullDuty = 0;
      if (presentWorkingDays >= requiredWorkingDays && !isExcluded && requiredWorkingDays > 0) {
        autoFullDuty = 500;
      }

      data.push({
        ...emp,
        totalPresent,
        totalOTHours,
        totalDaysAmount,
        totalOTAmount,
        totalRefreshment,
        autoFullDuty
      });
    });

    return data;
  }, [filteredEmployees, records, fromDate, toDate]);

  // Handle Input Changes
  const handleInputChange = (employeeId: string, field: keyof EditableRowData, value: string) => {
    setEditableData(prev => {
      const existing = prev[employeeId] || {};

      return {
        ...prev,
        [employeeId]: {
          ...existing,
          [field]: field === 'bankAccount' ? value : (Number(value) || 0)
        }
      };
    });
  };

  const calculatedData = useMemo(() => {
    return reportData.map(row => {
      const edit = editableData[row.id] || {};

      const wagesAmount = edit.wagesAmount || 0;
      const fine = edit.fine || 0;
      const advance = edit.advance || 0;
      const esi = edit.esi || 0;
      const roomRent = edit.roomRent || 0;
      const electricity = edit.electricity || 0;
      const ration = edit.ration || 0;
      const bankAccount = edit.bankAccount !== undefined ? edit.bankAccount : row.name;

      const fullDutyAllowance = row.autoFullDuty || 0;
      const grossSalary = row.totalDaysAmount + row.totalOTAmount + fullDutyAllowance + row.totalRefreshment;
      const netSalary = grossSalary - advance - esi - wagesAmount - fine;
      const payable = wagesAmount + netSalary - roomRent - electricity - ration;

      return {
        ...row,
        wagesAmount,
        fine,
        advance,
        esi,
        roomRent,
        electricity,
        ration,
        bankAccount,
        fullDutyAllowance,
        grossSalary,
        netSalary,
        payable
      };
    });
  }, [reportData, editableData]);




  const handleExportExcel = () => {
    if (calculatedData.length === 0) {
      alert("No data available to export.");
      return;
    }

    const exportData = calculatedData.map((row, idx) => ({
      "Sr No.": idx + 1,
      "Employee Name": row.name,
      "Designation": row.designation,
      "Basic Salary": row.basicSalary,
      "Days": row.totalPresent,
      "OT Hrs": row.totalOTHours,
      "OT Amt": row.totalOTAmount,
      "Full Duty Allowance": row.fullDutyAllowance,
      "Sunday Exp": row.totalRefreshment,
      "Fine": row.fine,
      "Gross Salary": row.grossSalary,
      "Advance": row.advance,
      "ESI": row.esi,
      "Wages Amount": row.wagesAmount,
      "Net Salary": row.netSalary,
      "Room Rent": row.roomRent,
      "Electricity": row.electricity,
      "Ration": row.ration,
      "Payable": row.payable,
      "Bank A/C": row.bankAccount
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Salary Sheet");
    
    import('../../utils/exportUtils').then(({ downloadExcel }) => {
      downloadExcel(workbook, `Salary_Sheet_${filter}_${fromDate}_to_${toDate}.xlsx`);
    });
  };

  const thClass = "px-2 py-2 border border-border text-center font-semibold text-muted-foreground whitespace-nowrap text-xs bg-muted/50";
  const tdClass = "px-2 py-2 border border-border text-xs";
  
  const inputClass = "w-full min-w-[60px] bg-transparent border-b border-dashed border-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-0 text-center py-1 editable-input";

  return (
    <div className="flex flex-col h-full space-y-4 print:block print:h-auto">
      <style>{`
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
        @media print {
          @page { size: landscape; margin: 5mm; }
          body * { visibility: hidden !important; }
          #printable-salary-sheet, #printable-salary-sheet * { visibility: visible !important; }
          #printable-salary-sheet { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }
          .editable-input { border: none !important; background: transparent !important; padding: 0 !important; width: 100% !important; text-align: center !important; font-size: 9px !important; }
          table { font-size: 9px !important; width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000 !important; padding: 2px 4px !important; color: #000 !important; white-space: nowrap !important; }
          th { background-color: #f3f4f6 !important; font-weight: bold !important; }
          .print-header { margin-bottom: 15px; text-align: center; color: #000 !important; display: block !important; }
          .print-hidden { display: none !important; }
        }
      `}</style>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-card p-4 rounded-lg border border-border shadow-sm gap-4 print-hidden">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Detailed Salary Sheet</h2>
          <p className="text-sm text-muted-foreground">Printable horizontal salary format with deductions</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print / PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors shadow-sm"
          >
            <FileDown className="w-4 h-4 mr-2" />
            Export Excel
          </button>
          
          <div className="flex items-center gap-1.5 ml-4 border-l border-border pl-4">
            <button
              onClick={setThisMonth}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors shadow-sm"
            >
              This Month
            </button>
            <button
              onClick={setLastMonth}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors shadow-sm"
            >
              Last Month
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              className="px-3 py-1.5 border border-input rounded-md bg-background font-medium shadow-sm text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <span className="text-sm text-muted-foreground font-medium">to</span>
            <input 
              type="date" 
              className="px-3 py-1.5 border border-input rounded-md bg-background font-medium shadow-sm text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 print-hidden">
        {(['COMPANY', 'WAGES_VIKAS', 'WAGES_DINESH'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors border shadow-sm ${
              filter === f 
                ? 'bg-primary text-primary-foreground border-primary' 
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {f === 'COMPANY' ? 'Company Salary Sheet' : f === 'WAGES_VIKAS' ? 'Vikas Contractor Sheet' : 'Dinesh Contractor Sheet'}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col min-h-0 print:overflow-visible print:block print:h-auto print:border-none print:shadow-none print:bg-transparent">
        <div className="overflow-auto flex-1 custom-scrollbar print:overflow-visible print:block print:h-auto">
          <div id="printable-salary-sheet" className="p-6 bg-white dark:bg-card print:p-0 print:bg-transparent">
            <div className="hidden print-header">
              <h1 className="text-xl font-bold uppercase mb-1">
                {filter === 'COMPANY' ? 'PACKWELL INDIA' : filter === 'WAGES_VIKAS' ? 'VIKAS CONTRACTOR' : 'DINESH CONTRACTOR'} - SALARY SHEET
              </h1>
              <p className="text-sm font-semibold">Period: {new Date(fromDate).toLocaleDateString('en-GB')} to {new Date(toDate).toLocaleDateString('en-GB')}</p>
            </div>

            <table className="w-full text-sm text-center border-collapse">
              <thead className="text-xs text-muted-foreground bg-muted/50">
                <tr>
                  <th className={thClass}>Sr No.</th>
                  <th className={`${thClass} text-left sticky left-0 z-20 bg-[#f3f4f6] dark:bg-muted shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] print:static print:shadow-none`}>Employee Name</th>
                  <th className={`${thClass} text-left`}>Designation</th>
                  <th className={thClass}>Basic Salary</th>
                  <th className={thClass}>Days</th>
                  <th className={thClass}>OT</th>
                  <th className={thClass}>Full Duty</th>
                  <th className={thClass}>Sunday Exp</th>
                  <th className={thClass}>Fine</th>
                  <th className={`${thClass} bg-primary/10 text-primary`}>Gross Salary</th>
                  <th className={thClass}>Advance</th>
                  <th className={thClass}>ESI</th>
                  <th className={`${thClass} bg-amber-50 text-amber-700`}>Wages Amount</th>
                  <th className={`${thClass} bg-blue-50 text-blue-700`}>Net Salary</th>
                  <th className={thClass}>Room Rent</th>
                  <th className={thClass}>Electricity</th>
                  <th className={thClass}>Ration</th>
                  <th className={`${thClass} bg-green-100 text-green-800 font-bold`}>Payable</th>
                  <th className={thClass}>Bank A/C</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={19} className="text-center py-12 text-muted-foreground print-hidden">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                      Calculating salary sheet...
                    </td>
                  </tr>
                ) : calculatedData.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="text-center py-12 text-muted-foreground print-hidden">
                      <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      No attendance records found for selected period.
                    </td>
                  </tr>
                ) : (
                  <>
                    {calculatedData.map((row, index) => (
                      <tr key={row.id} className="hover:bg-muted/50 transition-colors group">
                        <td className={tdClass}>{index + 1}</td>
                        <td className={`${tdClass} text-left font-medium whitespace-nowrap sticky left-0 z-10 bg-card group-hover:bg-muted/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] print:static print:shadow-none`}>{row.name}</td>
                        <td className={`${tdClass} text-left text-muted-foreground`}>{row.designation}</td>
                        <td className={tdClass}>₹{row.basicSalary}</td>
                        <td className={tdClass}>{row.totalPresent}</td>
                        <td className={tdClass}>
                          {row.totalOTHours > 0 ? (
                            <span title={`₹${row.totalOTAmount}`}>{row.totalOTHours}</span>
                          ) : '-'}
                        </td>
                        
                        <td className={tdClass}>₹{row.fullDutyAllowance}</td>
                        
                        <td className={tdClass}>₹{row.totalRefreshment}</td>
                        
                        <td className={tdClass}>
                          <input
                            type="number"
                            value={row.fine || ''}
                            onChange={(e) => handleInputChange(row.id, 'fine', e.target.value)}
                            className={inputClass}
                            placeholder="0"
                          />
                        </td>
                        
                        <td className={`${tdClass} font-bold bg-primary/5 text-primary`}>₹{row.grossSalary}</td>
                        
                        <td className={tdClass}>
                          <input
                            type="number"
                            value={row.advance || ''}
                            onChange={(e) => handleInputChange(row.id, 'advance', e.target.value)}
                            className={inputClass}
                            placeholder="0"
                          />
                        </td>
                        
                        <td className={tdClass}>
                          <input
                            type="number"
                            value={row.esi || ''}
                            onChange={(e) => handleInputChange(row.id, 'esi', e.target.value)}
                            className={inputClass}
                            placeholder="0"
                          />
                        </td>
                        
                        <td className={`${tdClass} bg-amber-50 text-amber-700`}>
                          <input
                            type="number"
                            value={row.wagesAmount || ''}
                            onChange={(e) => handleInputChange(row.id, 'wagesAmount', e.target.value)}
                            className={inputClass}
                            placeholder="0"
                          />
                        </td>
                        <td className={`${tdClass} font-semibold bg-blue-50 text-blue-700`}>₹{row.netSalary}</td>
                        
                        <td className={tdClass}>
                          <input
                            type="number"
                            value={row.roomRent || ''}
                            onChange={(e) => handleInputChange(row.id, 'roomRent', e.target.value)}
                            className={inputClass}
                            placeholder="0"
                          />
                        </td>
                        
                        <td className={tdClass}>
                          <input
                            type="number"
                            value={row.electricity || ''}
                            onChange={(e) => handleInputChange(row.id, 'electricity', e.target.value)}
                            className={inputClass}
                            placeholder="0"
                          />
                        </td>
                        
                        <td className={tdClass}>
                          <input
                            type="number"
                            value={row.ration || ''}
                            onChange={(e) => handleInputChange(row.id, 'ration', e.target.value)}
                            className={inputClass}
                            placeholder="0"
                          />
                        </td>
                        
                        <td className={`${tdClass} font-bold bg-green-100 text-green-800 text-sm`}>₹{row.payable}</td>
                        
                        <td className={tdClass}>
                          <input
                            type="text"
                            value={row.bankAccount || ''}
                            onChange={(e) => handleInputChange(row.id, 'bankAccount', e.target.value)}
                            className={`${inputClass} min-w-[100px] text-left font-bold`}
                            placeholder="A/C No."
                          />
                        </td>
                      </tr>
                    ))}
                    
                    {/* Totals Row */}
                    {calculatedData.length > 0 && (
                      <tr className="bg-muted font-bold">
                        <td colSpan={3} className={`${tdClass} text-right`}>TOTAL</td>
                        <td className={tdClass}>-</td>
                        <td className={tdClass}>{calculatedData.reduce((sum, r) => sum + r.totalPresent, 0)}</td>
                        <td className={tdClass}>{calculatedData.reduce((sum, r) => sum + r.totalOTHours, 0)}h</td>
                        <td className={tdClass}>₹{calculatedData.reduce((sum, r) => sum + r.fullDutyAllowance, 0)}</td>
                        <td className={tdClass}>₹{calculatedData.reduce((sum, r) => sum + r.totalRefreshment, 0)}</td>
                        <td className={tdClass}>₹{calculatedData.reduce((sum, r) => sum + r.fine, 0)}</td>
                        <td className={`${tdClass} text-primary`}>₹{calculatedData.reduce((sum, r) => sum + r.grossSalary, 0)}</td>
                        <td className={tdClass}>₹{calculatedData.reduce((sum, r) => sum + r.advance, 0)}</td>
                        <td className={tdClass}>₹{calculatedData.reduce((sum, r) => sum + r.esi, 0)}</td>
                        <td className={`${tdClass} text-amber-700`}>₹{calculatedData.reduce((sum, r) => sum + r.wagesAmount, 0)}</td>
                        <td className={`${tdClass} text-blue-700`}>₹{calculatedData.reduce((sum, r) => sum + r.netSalary, 0)}</td>
                        <td className={tdClass}>₹{calculatedData.reduce((sum, r) => sum + r.roomRent, 0)}</td>
                        <td className={tdClass}>₹{calculatedData.reduce((sum, r) => sum + r.electricity, 0)}</td>
                        <td className={tdClass}>₹{calculatedData.reduce((sum, r) => sum + r.ration, 0)}</td>
                        <td className={`${tdClass} text-green-800`}>₹{calculatedData.reduce((sum, r) => sum + r.payable, 0)}</td>
                        <td className={tdClass}>-</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

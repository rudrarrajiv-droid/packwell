import React, { useState, useEffect, useMemo } from 'react';
import { Search, FileDown, Printer, Loader2, IndianRupee } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getEmployees, type Employee } from '../../lib/supabase/employeeService';
import { getAttendanceByDateRange, type AttendanceRecord } from '../../lib/supabase/attendanceService';

export default function LedgerTab() {
  const [fromDate, setFromDate] = useState<string>(new Date().toISOString().substring(0, 8) + '01');
  const [toDate, setToDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

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
      if (emps.length > 0 && !selectedEmpId) {
        setSelectedEmpId(emps[0].id!);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmpId);
  }, [employees, selectedEmpId]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [employees, searchTerm]);

  useEffect(() => {
    if (filteredEmployees.length > 0 && !filteredEmployees.some(e => e.id === selectedEmpId)) {
      setSelectedEmpId(filteredEmployees[0].id!);
    } else if (filteredEmployees.length === 0 && selectedEmpId !== '') {
      setSelectedEmpId('');
    }
  }, [filteredEmployees, selectedEmpId]);

  const ledgerRecords = useMemo(() => {
    if (!selectedEmpId) return [];
    return records
      .filter(r => r.employeeId === selectedEmpId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [records, selectedEmpId]);

  const totals = useMemo(() => {
    return ledgerRecords.reduce((acc, r) => ({
      present: acc.present + r.present,
      otHours: acc.otHours + r.otHours,
      perDayAmount: acc.perDayAmount + r.perDayAmount,
      otAmount: acc.otAmount + r.otAmount,
      refreshment: acc.refreshment + r.refreshment,
      gross: acc.gross + r.perDayAmount + r.otAmount + r.refreshment
    }), { present: 0, otHours: 0, perDayAmount: 0, otAmount: 0, refreshment: 0, gross: 0 });
  }, [ledgerRecords]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (!selectedEmployee || ledgerRecords.length === 0) {
      alert("No data available to export.");
      return;
    }

    const exportData = ledgerRecords.map(record => ({
      "Date": new Date(record.date).toLocaleDateString('en-GB'),
      "Status": record.present === 1 ? 'Full Day' : record.present === 0.5 ? 'Half Day' : 'Absent',
      "Salary Amount": Math.round(record.perDayAmount),
      "OT Hours": record.otHours.toFixed(2),
      "OT Amount": Math.round(record.otAmount),
      "Refreshment": Math.round(record.refreshment),
      "Daily Total": Math.round(record.perDayAmount + record.otAmount + record.refreshment)
    }));

    exportData.push({
      "Date": "GRAND TOTAL",
      "Status": `${totals.present} Days`,
      "Salary Amount": Math.round(totals.perDayAmount),
      "OT Hours": totals.otHours.toFixed(2),
      "OT Amount": Math.round(totals.otAmount),
      "Refreshment": Math.round(totals.refreshment),
      "Daily Total": Math.round(totals.gross)
    } as any);

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee_Ledger");
    XLSX.writeFile(workbook, `Ledger_${selectedEmployee.name.replace(/\s+/g, '_')}_${fromDate}_to_${toDate}.xlsx`);
  };

  const thClass = "px-3 py-3 border-b-2 border-black text-left font-bold text-black whitespace-nowrap print:py-1 print:text-[10px]";
  const tdClass = "px-3 py-2 border-b border-gray-300 text-black print:py-0.5 print:text-[10px]";

  return (
    <div className="flex flex-col h-full space-y-4 print:h-auto print:block">
      {/* Controls (Hidden on Print) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card p-4 rounded-lg border border-border shadow-sm gap-4 print:hidden">
        <div className="flex flex-col w-full md:w-1/3 space-y-2">
          <label className="text-sm font-medium text-foreground">Search Employee</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Type to search..."
              className="w-full pl-9 pr-3 py-2 border border-input rounded-md bg-background text-sm focus:ring-1 focus:ring-primary"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:ring-1 focus:ring-primary"
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
          >
            {filteredEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name} ({emp.category === 'COMPANY' ? 'Company' : `Wages - ${emp.contractorName}`})</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-wrap items-end gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-medium mb-1">From Date</span>
              <input 
                type="date" 
                className="px-3 py-2 border border-input rounded-md bg-background font-medium shadow-sm text-sm"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-medium mb-1">To Date</span>
              <input 
                type="date" 
                className="px-3 py-2 border border-input rounded-md bg-background font-medium shadow-sm text-sm"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 h-[38px]">
            <button
              onClick={handleExportExcel}
              className="flex items-center justify-center px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition-colors shadow-sm"
              title="Export to Excel"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Excel
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm"
              title="Print / Save as PDF"
            >
              <Printer className="w-4 h-4 mr-2" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Printable Ledger Area */}
      <div className="bg-white text-black border border-gray-200 rounded-lg shadow-sm flex-1 overflow-auto custom-scrollbar p-8 print:p-0 print:border-none print:shadow-none print:m-0 print:overflow-visible print:h-auto print:block print-view-multipage">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 print:hidden">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p>Loading ledger data...</p>
          </div>
        ) : !selectedEmployee ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 print:hidden">
            <p>Please select an employee to view the ledger.</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            {/* Header / Company Info */}
            <div className="text-center mb-8 border-b-2 border-black pb-4 print:mb-2 print:pb-2">
              <h1 className="text-2xl font-black uppercase tracking-wider mb-1 print:text-xl">PACKWELL INDIA</h1>
              <h2 className="text-lg font-bold text-gray-700 print:text-sm">EMPLOYEE LEDGER REPORT</h2>
              <p className="text-sm text-gray-600 font-medium mt-1 print:text-xs">Period: {new Date(fromDate).toLocaleDateString('en-GB')} to {new Date(toDate).toLocaleDateString('en-GB')}</p>
            </div>

            {/* Employee Details Box */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm print:mb-2 print:text-xs print:gap-2">
              <div className="flex flex-col">
                <span className="text-gray-500 font-semibold text-xs uppercase print:text-[10px]">Employee Name</span>
                <span className="font-bold text-lg print:text-sm">{selectedEmployee.name}</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-gray-500 font-semibold text-xs uppercase print:text-[10px]">Designation</span>
                <span className="font-bold text-lg print:text-sm">{selectedEmployee.designation || 'N/A'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 font-semibold text-xs uppercase print:text-[10px]">Category / Contractor</span>
                <span className="font-bold print:text-sm">{selectedEmployee.category === 'COMPANY' ? 'Company Roll' : `Wages (${selectedEmployee.contractorName})`}</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-gray-500 font-semibold text-xs uppercase print:text-[10px]">Basic Salary (Per Month)</span>
                <span className="font-bold print:text-sm">₹{selectedEmployee.basicSalary.toLocaleString()}</span>
              </div>
            </div>

            {/* Ledger Table */}
            {ledgerRecords.length === 0 ? (
              <div className="text-center py-12 text-gray-500 border border-dashed border-gray-300 rounded-lg">
                No records found for this period.
              </div>
            ) : (
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} text-right`}>Salary Amt.</th>
                    <th className={`${thClass} text-right`}>OT (Hrs)</th>
                    <th className={`${thClass} text-right`}>OT Amt.</th>
                    <th className={`${thClass} text-right`}>Refreshment</th>
                    <th className={`${thClass} text-right`}>Daily Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRecords.map(record => {
                    const dailyTotal = record.perDayAmount + record.otAmount + record.refreshment;
                    return (
                      <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                        <td className={`${tdClass} font-medium`}>
                          {new Date(record.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className={tdClass}>
                          <span className={`inline-flex items-center font-medium ${
                            record.present === 1 ? 'text-green-700' : 
                            record.present === 0.5 ? 'text-amber-600' : 
                            'text-red-600'
                          }`}>
                            {record.present === 1 ? 'Full Day' : record.present === 0.5 ? 'Half Day' : 'Absent'}
                          </span>
                        </td>
                        <td className={`${tdClass} text-right font-medium`}>₹{Math.round(record.perDayAmount)}</td>
                        <td className={`${tdClass} text-right font-medium text-blue-700`}>{record.otHours.toFixed(2)}</td>
                        <td className={`${tdClass} text-right font-medium`}>₹{Math.round(record.otAmount)}</td>
                        <td className={`${tdClass} text-right font-medium`}>₹{Math.round(record.refreshment)}</td>
                        <td className={`${tdClass} text-right font-bold text-green-700`}>₹{Math.round(dailyTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-black">
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-right font-black uppercase text-sm print:py-1 print:text-xs">
                      Grand Total
                    </td>
                    <td className="px-3 py-4 text-right font-black text-sm print:py-1 print:text-xs">
                      ₹{Math.round(totals.perDayAmount)}
                      <div className="text-xs text-gray-500 font-semibold print:text-[10px]">{totals.present} Days</div>
                    </td>
                    <td className="px-3 py-4 text-right font-black text-blue-700 text-sm print:py-1 print:text-xs">
                      {totals.otHours.toFixed(2)} Hrs
                    </td>
                    <td className="px-3 py-4 text-right font-black text-sm print:py-1 print:text-xs">
                      ₹{Math.round(totals.otAmount)}
                    </td>
                    <td className="px-3 py-4 text-right font-black text-sm print:py-1 print:text-xs">
                      ₹{Math.round(totals.refreshment)}
                    </td>
                    <td className="px-3 py-4 text-right font-black text-green-700 text-lg print:py-1 print:text-sm">
                      ₹{Math.round(totals.gross)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Print Footer */}
            <div className="mt-16 flex justify-between items-end border-t border-gray-300 pt-8 print:flex hidden print:mt-4 print:pt-4">
              <div className="text-center">
                <div className="w-40 border-b border-black mb-2"></div>
                <span className="text-sm font-semibold text-gray-600">Employee Signature</span>
              </div>
              <div className="text-center">
                <div className="w-40 border-b border-black mb-2"></div>
                <span className="text-sm font-semibold text-gray-600">Authorized Signatory</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

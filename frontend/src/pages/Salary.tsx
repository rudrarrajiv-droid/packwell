import React, { useState } from 'react';
import { Users, CalendarDays, FileBarChart2, BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import EmployeesTab from './salary/EmployeesTab';
import DailyEntryTab from './salary/DailyEntryTab';
import MonthlyReportTab from './salary/MonthlyReportTab';
import LedgerTab from './salary/LedgerTab';
import SalarySheetTab from './salary/SalarySheetTab';
import { useAuth } from '../contexts/AuthContext';

export default function Salary() {
  const { hasRole } = useAuth();
  const [activeView, setActiveView] = useState<'DAILY' | 'MONTHLY' | 'LEDGER' | 'EMPLOYEES' | 'SALARY_SHEET'>('DAILY');

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in print:h-auto print:block">
      <div className="flex flex-col gap-4 print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground uppercase tracking-tight flex items-center">
              <Users className="w-6 h-6 mr-2 text-primary" />
              Salary & Wages
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage manpower attendance and salary records</p>
          </div>
        </div>

        <div className="flex items-center justify-start bg-card p-1.5 rounded-lg border border-border shadow-sm w-fit">
          <button
            onClick={() => setActiveView('DAILY')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center",
              activeView === 'DAILY' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            Daily Entry
          </button>
          
          <button
            onClick={() => setActiveView('MONTHLY')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center",
              activeView === 'MONTHLY' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <FileBarChart2 className="w-4 h-4 mr-2" />
            Salary Report
          </button>

          <button
            onClick={() => setActiveView('EMPLOYEES')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center",
              activeView === 'EMPLOYEES' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Users className="w-4 h-4 mr-2" />
            Employees Master
          </button>
          
          <button
            onClick={() => setActiveView('LEDGER')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center",
              activeView === 'LEDGER' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <BookOpen className="w-4 h-4 mr-2" />
            Employee Ledger
          </button>

          {hasRole('ADMIN') && (
            <button
              onClick={() => setActiveView('SALARY_SHEET')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center",
                activeView === 'SALARY_SHEET' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <FileBarChart2 className="w-4 h-4 mr-2" />
              Salary Sheet
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden print:overflow-visible print:h-auto print:block">
        {activeView === 'DAILY' && <DailyEntryTab />}
        {activeView === 'MONTHLY' && <MonthlyReportTab />}
        {activeView === 'EMPLOYEES' && <EmployeesTab />}
        {activeView === 'LEDGER' && <LedgerTab />}
        {activeView === 'SALARY_SHEET' && hasRole('ADMIN') && <SalarySheetTab />}
      </div>
    </div>
  );
}





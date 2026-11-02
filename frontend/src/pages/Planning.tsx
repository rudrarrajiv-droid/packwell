import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Factory, Truck, Calendar, Calculator, Sparkles } from 'lucide-react';
import CorrugationPlanningSheet from './planning/CorrugationPlanningSheet';
import DispatchPlanningSheet from './planning/DispatchPlanningSheet';
import { cn } from '../lib/utils';

interface PlanningProps {
  defaultTab?: 'corrugation' | 'dispatch';
}

export default function Planning({ defaultTab }: PlanningProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromQuery = searchParams.get('tab') as 'corrugation' | 'dispatch' | null;

  const [activeTab, setActiveTab] = useState<'corrugation' | 'dispatch'>(() => {
    if (tabFromQuery === 'corrugation' || tabFromQuery === 'dispatch') {
      return tabFromQuery;
    }
    if (defaultTab) {
      return defaultTab;
    }
    return 'corrugation';
  });

  // Keep query params in sync if changed
  useEffect(() => {
    if (tabFromQuery && (tabFromQuery === 'corrugation' || tabFromQuery === 'dispatch')) {
      setActiveTab(tabFromQuery);
    }
  }, [tabFromQuery]);

  const handleTabChange = (tab: 'corrugation' | 'dispatch') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6 pb-12 print:p-0 print:space-y-0">
      {/* Top Banner & Header (Hidden in Print) */}
      <div className="bg-gradient-to-r from-card via-card to-secondary/30 p-5 rounded-2xl border border-border shadow-xs print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-md shadow-blue-600/20">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  Daily Production & Dispatch Planning
                </h1>
                <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-blue-100 text-blue-900 rounded-full border border-blue-300">
                  MD Daily Reports
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Corrugation Machine Schedule & Finished Goods Dispatch Sheet
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* THE 2 MAIN PLANNING BUTTONS AS REQUESTED BY USER */}
            <div className="inline-flex p-1.5 bg-secondary/80 rounded-xl border border-border self-start md:self-auto shadow-inner">
              <button
                type="button"
                onClick={() => handleTabChange('corrugation')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all duration-200 cursor-pointer",
                  activeTab === 'corrugation'
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                )}
              >
                <Factory className="w-4 h-4" />
                <span>1. Corrugation Machine Planning</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('dispatch')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all duration-200 cursor-pointer",
                  activeTab === 'dispatch'
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                )}
              >
                <Truck className="w-4 h-4" />
                <span>2. Dispatch Planning</span>
              </button>
            </div>

            {/* Direct Link to Job Costing */}
            <Link
              to="/job-costing"
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
              title="Open Job Card Costing & P/L Sheet"
            >
              <Calculator className="w-4 h-4" />
              <span>Job Costing (P/L)</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Render the Active Planning Sheet */}
      <div className="animate-in fade-in duration-200">
        {activeTab === 'corrugation' ? (
          <CorrugationPlanningSheet />
        ) : (
          <DispatchPlanningSheet />
        )}
      </div>
    </div>
  );
}

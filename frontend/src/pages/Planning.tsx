import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Factory, Truck, Calendar } from 'lucide-react';
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
      <div className="bg-card p-5 rounded-2xl border border-border shadow-sm print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600/10 text-blue-600 rounded-xl">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Daily Production & Dispatch Planning
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  MD Daily Reports • Corrugation Machine Planning & Dispatch Planning (Independent Sheets)
                </p>
              </div>
            </div>
          </div>

          {/* THE 2 MAIN PLANNING BUTTONS AS REQUESTED BY USER */}
          {/* "1. planning ka button click karne se 2 button dikhe 1 corrugation machine planning 2 dispatch planning" */}
          <div className="inline-flex p-1.5 bg-secondary/80 rounded-xl border border-border/60 self-start md:self-auto shadow-inner">
            <button
              type="button"
              onClick={() => handleTabChange('corrugation')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all duration-200 cursor-pointer",
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
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all duration-200 cursor-pointer",
                activeTab === 'dispatch'
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/60"
              )}
            >
              <Truck className="w-4 h-4" />
              <span>2. Dispatch Planning</span>
            </button>
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

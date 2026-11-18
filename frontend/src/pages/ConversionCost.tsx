import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Gauge, Save, CheckCircle2, TrendingUp, TrendingDown, AlertTriangle,
  Calendar, ChevronLeft, ChevronRight, RefreshCw, Sparkles, ArrowRight,
  History, Layers, Wallet, Scale, Calculator, Info
} from 'lucide-react';
import { format, subMonths } from 'date-fns';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useConversionCost } from '../hooks/useConversionCost';
import { fetchMultiMonthConversionMetrics } from '../lib/conversionCostService';
import { cn } from '../lib/utils';

const formatINR = (val: number, decimals: number = 0) => {
  if (!Number.isFinite(val)) return '0';
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatMonthLabel = (ym: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return ym;
  const [y, m] = ym.split('-').map(Number);
  return format(new Date(y, m - 1, 1), 'MMM yyyy');
};

export default function ConversionCost() {
  const { user } = useAuth();
  const now = new Date();
  const defaultCurrentMonth = format(now, 'yyyy-MM');
  const defaultLastMonth = format(subMonths(now, 1), 'yyyy-MM');

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultCurrentMonth);
  const {
    standardRate,
    standardInfo,
    history,
    targetMonthMetrics,
    loadingMonthly,
    refetchMonthly,
    updateStandardRate,
    isUpdatingRate,
  } = useConversionCost(selectedMonth);

  const [rateInput, setRateInput] = useState<string>(String(standardRate));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setRateInput(String(standardRate));
  }, [standardRate]);

  // Last 6 months for trend chart & table
  const trendMonths = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const anchor = !isNaN(y) && !isNaN(m) ? new Date(y, m - 1, 1) : new Date();
    const list: string[] = [];
    for (let i = 5; i >= 0; i--) {
      list.push(format(subMonths(anchor, i), 'yyyy-MM'));
    }
    return list;
  }, [selectedMonth]);

  const { data: trendMap = {}, isLoading: loadingTrend, refetch: refetchTrend } = useQuery({
    queryKey: ['conversionCostTrend', ...trendMonths],
    queryFn: () => fetchMultiMonthConversionMetrics(trendMonths),
    staleTime: 1000 * 60 * 2,
  });

  const trendRows = useMemo(() => {
    return trendMonths.map((m) => {
      const data = trendMap[m];
      const actual = data?.actualConversionCostPerKg ?? 0;
      const diff = actual > 0 ? actual - standardRate : 0;
      return {
        month: m,
        label: formatMonthLabel(m),
        expenses: data?.totalOperationalExpenses ?? 0,
        paperKg: data?.totalPaperConsumedKg ?? 0,
        actualPerKg: Math.round(actual * 100) / 100,
        diffPerKg: Math.round(diff * 100) / 100,
      };
    });
  }, [trendMonths, trendMap, standardRate]);

  const handleSaveStandardRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage(null);
    setErrorMessage(null);

    const parsed = parseFloat(rateInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setErrorMessage('Kripya sahi non-negative rate (₹/Kg) darj karein.');
      return;
    }

    try {
      const saved = await updateStandardRate({
        newRate: parsed,
        user: user?.name || 'System',
      });
      setSaveMessage(
        `Standard Conversion Cost ₹${saved.toFixed(2)}/Kg save ho gaya! Purane saved jobs as-is rahenge; naye aur pending jobs par ab ₹${saved.toFixed(2)}/Kg apply hoga.`
      );
      setTimeout(() => setSaveMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update Standard Conversion Cost');
    }
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (isNaN(y) || isNaN(m)) return;
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(format(d, 'yyyy-MM'));
  };

  const actualRate = targetMonthMetrics?.actualConversionCostPerKg ?? 0;
  const totalExpenses = targetMonthMetrics?.totalOperationalExpenses ?? 0;
  const totalPaperKg = targetMonthMetrics?.totalPaperConsumedKg ?? 0;
  const rateGap = actualRate > 0 ? actualRate - standardRate : 0;
  const isOverStandard = actualRate > standardRate && actualRate > 0;

  return (
    <div className="space-y-6 pb-12 max-w-[1600px] mx-auto">
      {/* Top Colorful Hero Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white p-6 rounded-2xl shadow-lg border border-indigo-800/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 rounded-2xl shadow-lg shadow-amber-500/30">
            <Gauge className="w-8 h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                Conversion Cost Control Center
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-400 text-slate-950">
                Live P&amp;L Synced
              </span>
            </div>
            <p className="text-xs sm:text-sm text-indigo-200 mt-1">
              Standard Conversion Rate manage karein aur har mahine ka Actual Per-Kg Conversion Cost (Operational Expenses ÷ Paper Consumption) live dekhein.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              refetchMonthly();
              refetchTrend();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold border border-white/15 transition cursor-pointer"
          >
            <RefreshCw className={cn('w-4 h-4', (loadingMonthly || loadingTrend) && 'animate-spin')} />
            Refresh Live Data
          </button>
          <Link
            to="/job-costing"
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shadow-md transition"
          >
            <Calculator className="w-4 h-4" />
            Job Costing (P/L)
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Feedback Alerts */}
      {saveMessage && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 text-emerald-900 rounded-2xl flex items-start gap-3 shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm font-bold">{saveMessage}</div>
        </div>
      )}
      {errorMessage && (
        <div className="p-4 bg-red-50 border-2 border-red-300 text-red-900 rounded-2xl flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm font-bold">{errorMessage}</div>
        </div>
      )}

      {/* Main 3 Highlight Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Card 1: Editable Standard Conversion Cost */}
        <div className="lg:col-span-5 bg-gradient-to-br from-amber-50 via-orange-50/70 to-white rounded-2xl border-2 border-amber-300 shadow-md p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                Standard Conversion Cost (Job Costing Rate)
              </span>
              <span className="px-2.5 py-0.5 bg-amber-200 text-amber-950 text-[11px] font-black rounded-full">
                Active Standard
              </span>
            </div>

            <div className="flex items-baseline gap-2 my-3">
              <span className="text-4xl sm:text-5xl font-black text-amber-700 tracking-tight">
                ₹{standardRate.toFixed(2)}
              </span>
              <span className="text-sm font-bold text-amber-900/70">/ Kg (applied on Total DPR Weight)</span>
            </div>

            <form onSubmit={handleSaveStandardRate} className="mt-4 space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                Edit / Update Standard Conversion Cost (₹/Kg):
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-800 font-black text-base">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    className="w-full pl-8 pr-12 py-2.5 bg-white border-2 border-amber-300 rounded-xl text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    / Kg
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isUpdatingRate}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-black shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {isUpdatingRate ? 'Saving...' : 'Update Rate'}
                </button>
              </div>

              {/* Quick preset buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Quick Set:</span>
                {[12, 14, 15, 16, 18, 20].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRateInput(String(preset))}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer',
                      Number(rateInput) === preset
                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                        : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100'
                    )}
                  >
                    ₹{preset}
                  </button>
                ))}
              </div>
            </form>
          </div>

          <div className="mt-5 p-3 bg-white/90 rounded-xl border border-amber-200 text-[11px] text-slate-700 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-950">Old Jobs Lock Rule:</strong> Jab aap rate update karte hain,
              purane saved jobs apni purani rate par hi lock rahenge. Naya rate sirf aage ki jobs aur pending DPR jobs par apply hoga (ya kisi job modal me <em>Recalculate</em> dabane par).
              {standardInfo?.updatedAt && (
                <span className="block mt-1 text-slate-500">
                  Last updated by <strong>{standardInfo.updatedBy || 'System'}</strong> on{' '}
                  {new Date(standardInfo.updatedAt).toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Auto Monthly Actual Conversion Cost from P&L */}
        <div className="lg:col-span-7 bg-white rounded-2xl border-2 border-indigo-200 shadow-md p-6 flex flex-col justify-between">
          <div>
            {/* Month Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-indigo-600" />
                  Actual Monthly Conversion Cost (Auto from P&amp;L)
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Formula: Total Operational Expenses ÷ Total Paper Consumption (Kg)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-700 rounded-lg transition cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600 mr-1.5" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                    className="bg-transparent text-xs font-black text-indigo-950 focus:outline-none cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-700 rounded-lg transition cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(defaultLastMonth)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer',
                    selectedMonth === defaultLastMonth
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                  )}
                >
                  Last Month ({formatMonthLabel(defaultLastMonth)})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(defaultCurrentMonth)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer',
                    selectedMonth === defaultCurrentMonth
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                  )}
                >
                  This Month
                </button>
              </div>
            </div>

            {/* Calculation Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-4">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase text-rose-800">
                  <span>Operational Expenses</span>
                  <Wallet className="w-4 h-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-700 mt-2">
                  ₹{formatINR(totalExpenses)}
                </div>
                <div className="text-[11px] text-rose-700/80 font-semibold mt-1">
                  {targetMonthMetrics?.activeExpenseCount ?? 0} Active Heads in P&amp;L
                </div>
              </div>

              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase text-blue-800">
                  <span>Paper Consumption</span>
                  <Layers className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-blue-700 mt-2">
                  {formatINR(totalPaperKg)} Kg
                </div>
                <div className="text-[11px] text-blue-700/80 font-semibold mt-1">
                  Paper Value: ₹{formatINR(targetMonthMetrics?.totalPaperConsumedAmt ?? 0)}
                </div>
              </div>

              <div
                className={cn(
                  'rounded-xl p-4 border-2 shadow-sm',
                  actualRate === 0
                    ? 'bg-slate-50 border-slate-200'
                    : isOverStandard
                    ? 'bg-gradient-to-br from-rose-600 to-red-700 text-white border-red-700'
                    : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white border-emerald-700'
                )}
              >
                <div className="flex items-center justify-between text-[11px] font-bold uppercase opacity-90">
                  <span>Actual Conv. Cost</span>
                  {actualRate > 0 && (isOverStandard ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />)}
                </div>
                <div className="text-3xl font-black mt-1.5">
                  {loadingMonthly ? '...' : actualRate > 0 ? `₹${actualRate.toFixed(2)}` : '—'}
                </div>
                <div className="text-[11px] font-bold opacity-90 mt-1">
                  {actualRate > 0 ? 'Per Kg (Live P&L)' : 'No consumption/expense data'}
                </div>
              </div>
            </div>

            {/* Exact Equation Strip */}
            <div className="mt-4 p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-200 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-mono font-bold text-indigo-950">
                ₹{formatINR(totalExpenses)} ÷ {formatINR(totalPaperKg)} Kg ={' '}
                <span className="text-sm font-black text-indigo-700">
                  ₹{actualRate.toFixed(2)} / Kg
                </span>
              </div>
              <Link
                to="/profit-and-loss"
                className="text-xs font-black text-indigo-700 hover:text-indigo-900 underline flex items-center gap-1"
              >
                Open Profit &amp; Loss ({formatMonthLabel(selectedMonth)})
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Standard vs Actual Variance Alert */}
          <div
            className={cn(
              'mt-4 p-3.5 rounded-xl border flex items-center justify-between gap-3',
              actualRate === 0
                ? 'bg-slate-50 border-slate-200 text-slate-600'
                : isOverStandard
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            )}
          >
            <div className="flex items-center gap-2.5 text-xs font-bold">
              {actualRate === 0 ? (
                <Info className="w-4 h-4 text-slate-500 shrink-0" />
              ) : isOverStandard ? (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>
                {actualRate === 0
                  ? `${formatMonthLabel(selectedMonth)} me abhi paper consumption ya expense data available nahi hai.`
                  : isOverStandard
                  ? `Alert: ${formatMonthLabel(selectedMonth)} ka Actual Conversion Cost (₹${actualRate.toFixed(2)}/Kg), aapke Standard Rate (₹${standardRate.toFixed(2)}/Kg) se ₹${rateGap.toFixed(2)}/Kg zyada hai!`
                  : `Safe Zone: ${formatMonthLabel(selectedMonth)} ka Actual Conversion Cost (₹${actualRate.toFixed(2)}/Kg), Standard Rate (₹${standardRate.toFixed(2)}/Kg) ke andar hai (₹${Math.abs(rateGap).toFixed(2)}/Kg margin).`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6-Month Trend Chart + Monthly Comparison Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                6-Month Actual Conversion Cost Trend (₹/Kg)
              </h2>
              <p className="text-xs text-slate-500">
                Dashed line = Active Standard Conversion Rate (₹{standardRate.toFixed(2)}/Kg)
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 700, fill: '#334155' }} />
                <YAxis tick={{ fontSize: 12, fontWeight: 600, fill: '#475569' }} unit="₹" />
                <Tooltip
                  formatter={(value: any) => [`₹${Number(value).toFixed(2)} / Kg`, 'Actual Conv. Cost']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                />
                <ReferenceLine
                  y={standardRate}
                  stroke="#d97706"
                  strokeDasharray="5 5"
                  strokeWidth={2.5}
                  label={{
                    value: `Std ₹${standardRate}`,
                    position: 'right',
                    fill: '#b45309',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                />
                <Bar dataKey="actualPerKg" radius={[8, 8, 0, 0]}>
                  {trendRows.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={entry.actualPerKg > standardRate ? '#e11d48' : '#059669'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Table */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider">Month-Wise Comparison</h2>
            <span className="text-[11px] text-slate-300 font-semibold">Click row to inspect</span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold">
                  <th className="px-4 py-2.5 text-left">Month</th>
                  <th className="px-3 py-2.5 text-right">Expenses</th>
                  <th className="px-3 py-2.5 text-right">Paper (Kg)</th>
                  <th className="px-3 py-2.5 text-right">Actual ₹/Kg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trendRows.map((row) => {
                  const isSelected = row.month === selectedMonth;
                  const over = row.actualPerKg > standardRate;
                  return (
                    <tr
                      key={row.month}
                      onClick={() => setSelectedMonth(row.month)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isSelected ? 'bg-indigo-50/90 font-bold' : 'hover:bg-slate-50'
                      )}
                    >
                      <td className="px-4 py-2.5 font-bold text-slate-800">{row.label}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">₹{formatINR(row.expenses)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{formatINR(row.paperKg)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {row.actualPerKg > 0 ? (
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full font-black',
                              over
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                            )}
                          >
                            ₹{row.actualPerKg.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Expense Breakdown + Rate History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Selected Month Expense Breakdown */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider">
              {formatMonthLabel(selectedMonth)} — Expense Head Contribution (₹/Kg)
            </h2>
            <span className="text-xs font-bold text-amber-300">
              Total: ₹{formatINR(totalExpenses)}
            </span>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold">
                <tr>
                  <th className="px-4 py-2.5 text-left">Operational Expense Head</th>
                  <th className="px-3 py-2.5 text-right">Amount (₹)</th>
                  <th className="px-3 py-2.5 text-right">Per Kg Impact</th>
                  <th className="px-3 py-2.5 text-right">Share %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(targetMonthMetrics?.expenseBreakdown || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Is mahine koi active operational expense nahi mila.
                    </td>
                  </tr>
                ) : (
                  (targetMonthMetrics?.expenseBreakdown || []).map((item) => {
                    const perKg = totalPaperKg > 0 ? item.amount / totalPaperKg : 0;
                    const share = totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0;
                    return (
                      <tr key={item.name} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{item.name}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                          ₹{formatINR(item.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-indigo-700">
                          ₹{perKg.toFixed(2)}/Kg
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-500 font-semibold">
                          {share.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Standard Rate Change History */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-black uppercase tracking-wider">
              Standard Rate Update History
            </h2>
          </div>
          <div className="p-4 space-y-2.5 max-h-80 overflow-y-auto">
            {history.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Default Standard Rate ₹12.00/Kg active hai. Koi manual update abhi tak record nahi hua.
              </div>
            ) : (
              history.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-xl bg-amber-50/50 border border-amber-200 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">{h.action}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      By <strong>{h.updatedBy}</strong> •{' '}
                      {h.updatedAt ? new Date(h.updatedAt).toLocaleString('en-IN') : ''}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-200 text-amber-950 rounded-lg text-xs font-black shrink-0">
                    ₹{h.rate.toFixed(2)}/Kg
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

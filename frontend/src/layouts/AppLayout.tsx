import React, { useState, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, FileText, Database, PackageSearch, PackageCheck, 
  Truck, Activity, Settings, LogOut, ShoppingCart, Users, 
  FileSpreadsheet, Box, Archive, Factory, Calendar, 
  ChevronDown, ChevronRight, Calculator, Gauge 
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useConversionCost } from '../hooks/useConversionCost';
import { cn } from '../lib/utils';

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isPlanningOpen, setIsPlanningOpen] = useState<boolean>(true);
  const {
    standardRate,
    currentMonth,
    previousMonth,
    currentMonthMetrics,
    previousMonthMetrics,
    loadingMonthly,
  } = useConversionCost();

  const currentActual = currentMonthMetrics?.actualConversionCostPerKg ?? 0;
  const prevActual = previousMonthMetrics?.actualConversionCostPerKg ?? 0;
  const displayMetrics = currentActual > 0 ? currentMonthMetrics : previousMonthMetrics;
  const displayMonthCode = currentActual > 0 ? currentMonth : previousMonth;
  const displayActualRate = displayMetrics?.actualConversionCostPerKg ?? 0;
  const displayMonthShort = useMemo(() => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(displayMonthCode)) return displayMonthCode;
    const [y, m] = displayMonthCode.split('-').map(Number);
    return format(new Date(y, m - 1, 1), 'MMM');
  }, [displayMonthCode]);
  const isOverStandard = displayActualRate > standardRate && displayActualRate > 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Plant Daily MIS', path: '/plant-daily-mis', icon: Factory },
    { 
      name: 'Planning', 
      path: '/planning', 
      icon: Calendar,
      isDropdown: true,
      subItems: [
        { name: '1. Corrugation Machine Planning', path: '/planning/corrugation', tab: 'corrugation', icon: Factory },
        { name: '2. Dispatch Planning', path: '/planning/dispatch', tab: 'dispatch', icon: Truck },
      ]
    },
    { name: 'PO Management', path: '/purchase-orders', icon: ShoppingCart },
    { name: 'Job Cards', path: '/job-cards', icon: FileText },
    { name: 'Job Costing (P/L)', path: '/job-costing', icon: Calculator },
    { name: 'Conversion Cost', path: '/conversion-cost', icon: Gauge },
    { name: 'Master Data', path: '/master-data', icon: Database },
    { name: 'Reel Inventory', path: '/inventory', icon: PackageSearch },
    { name: 'Finish Goods', path: '/finish-goods', icon: PackageCheck },
    { name: 'Freight Charges', path: '/freight', icon: Truck },
    { name: 'Production', path: '/production', icon: Activity },
    { name: 'Salary & Wages', path: '/salary', icon: Users },
    { name: 'Conversion Report', path: '/dc', icon: FileSpreadsheet },
    { name: 'Profit & Loss', path: '/profit-and-loss', icon: Box },
    { name: 'Raw Material', path: '/raw-material', icon: Archive },
    { name: 'Scrap', path: '/scrap', icon: Archive },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background print:h-auto print:overflow-visible print:block">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1e3a8a] border-r border-blue-800 hidden md:flex flex-col text-blue-100 print:hidden">
        <div className="w-full flex flex-col border-b border-blue-800 bg-[#0a0f1c]">
          <img src="/logo.gif" alt="Packwell India Logo" className="w-full block" />
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
          {navItems.map((item: any) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            
            if (item.isDropdown) {
              return (
                <div key={item.name} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlanningOpen(prev => !prev);
                      navigate('/planning');
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-md transition-colors text-sm font-medium cursor-pointer",
                      isActive 
                        ? "bg-[#2563eb] text-white shadow-md shadow-blue-900/20" 
                        : "text-blue-200 hover:bg-blue-800 hover:text-white"
                    )}
                  >
                    <div className="flex items-center">
                      <Icon className="w-5 h-5 mr-3" />
                      <span>{item.name}</span>
                    </div>
                    {isPlanningOpen ? (
                      <ChevronDown className="w-4 h-4 text-blue-200" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-blue-200" />
                    )}
                  </button>

                  {/* 2 Sub Buttons revealed when Planning is clicked */}
                  {isPlanningOpen && (
                    <div className="pl-3 pr-1 py-1 space-y-1 bg-blue-950/40 rounded-lg border border-blue-800/40">
                      {item.subItems?.map((sub: any) => {
                        const SubIcon = sub.icon;
                        const isSubActive = location.pathname === sub.path || 
                          (location.pathname === '/planning' && location.search.includes(`tab=${sub.tab}`)) ||
                          (location.pathname === '/planning' && !location.search && sub.tab === 'corrugation');
                        
                        return (
                          <Link
                            key={sub.name}
                            to={sub.path}
                            className={cn(
                              "flex items-center px-3 py-2 rounded-md transition-all text-xs font-semibold",
                              isSubActive
                                ? "bg-blue-500 text-white shadow-sm"
                                : "text-blue-200 hover:bg-blue-800/80 hover:text-white"
                            )}
                          >
                            <SubIcon className="w-3.5 h-3.5 mr-2 opacity-90" />
                            <span>{sub.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center px-4 py-3 rounded-md transition-colors text-sm font-medium",
                  isActive 
                    ? "bg-[#2563eb] text-white shadow-md shadow-blue-900/20" 
                    : "text-blue-200 hover:bg-blue-800 hover:text-white"
                )}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:block print:h-auto">
        {/* Top Header */}
        <header className="min-h-16 py-2 border-b border-border bg-card flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 print:hidden">
          <h2 className="text-lg font-semibold text-foreground">
            {location.pathname.startsWith('/planning/corrugation')
              ? 'Corrugation Machine Planning'
              : location.pathname.startsWith('/planning/dispatch')
              ? 'Dispatch Planning'
              : location.pathname.startsWith('/planning')
              ? 'Daily Planning'
              : navItems.find((i: any) => location.pathname.startsWith(i.path))?.name || 'Packwell India'}
          </h2>

          {/* Global Bold & Colorful Conversion Cost Highlight (Visible on EVERY page) */}
          <Link
            to="/conversion-cost"
            title="Click to edit Standard Conversion Cost or view Month-wise P&L Conversion Cost"
            className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md hover:shadow-lg hover:scale-[1.01] transition-all border border-indigo-500/40"
          >
            <div className="flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-extrabold text-amber-300">
                Std Conv:
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-xs sm:text-sm font-black shadow-xs">
                ₹{standardRate.toFixed(2)}/Kg
              </span>
            </div>

            <div className="w-px h-5 bg-white/20 hidden sm:block" />

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-extrabold text-indigo-200">
                Actual ({displayMonthShort}):
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-md text-xs sm:text-sm font-black shadow-xs',
                  loadingMonthly && displayActualRate === 0
                    ? 'bg-white/20 text-white'
                    : displayActualRate === 0
                    ? 'bg-slate-700 text-slate-200'
                    : isOverStandard
                    ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white ring-2 ring-rose-300/60'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white ring-2 ring-emerald-300/60'
                )}
              >
                {loadingMonthly && displayActualRate === 0
                  ? '...'
                  : displayActualRate > 0
                  ? `₹${displayActualRate.toFixed(2)}/Kg`
                  : 'N/A'}
              </span>
              {currentActual > 0 && prevActual > 0 && (
                <span className="hidden xl:inline text-[10px] font-bold text-indigo-300">
                  (Prev: ₹{prevActual.toFixed(2)})
                </span>
              )}
            </div>
          </Link>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="text-right flex flex-col justify-center">
                <span className="text-sm text-foreground font-medium">{user?.name || 'User'}</span>
                <span className="text-xs text-muted-foreground">{user?.role || 'Guest'}</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
            
            {/* Mobile/Header Logout Button */}
            <div className="w-px h-8 bg-border"></div>
            <button 
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center text-sm font-medium text-muted-foreground hover:text-red-600 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-background p-6 print:p-0 print:overflow-visible print:block print:h-auto">
          <Outlet />
        </div>
      </main>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-border">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Confirm Logout</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Are you sure you want to log out of the system?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-sm shadow-red-600/20 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

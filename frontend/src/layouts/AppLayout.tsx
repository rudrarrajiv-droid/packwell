import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Database, PackageSearch, PackageCheck, Truck, Activity, Settings, LogOut, ShoppingCart, Users, FileSpreadsheet, Box, Archive } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'PO Management', path: '/purchase-orders', icon: ShoppingCart },
    { name: 'Job Cards', path: '/job-cards', icon: FileText },
    { name: 'Master Data', path: '/master-data', icon: Database },
    { name: 'Reel Inventory', path: '/inventory', icon: PackageSearch },
    { name: 'Finish Goods', path: '/finish-goods', icon: PackageCheck },
    { name: 'Freight Charges', path: '/freight', icon: Truck },
    { name: 'Production', path: '/production', icon: Activity },
    { name: 'Salary & Wages', path: '/salary', icon: Users },
    { name: 'Conversion Report', path: '/dc', icon: FileSpreadsheet },
    { name: 'MR', path: '/mr', icon: Box },
    { name: 'RM', path: '/rm', icon: Archive },
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
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            
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
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-8 print:hidden">
          <h2 className="text-lg font-semibold text-foreground">
            {navItems.find(i => location.pathname.startsWith(i.path))?.name || 'Packwell India'}
          </h2>
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

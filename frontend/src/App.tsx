import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import JobCards from './pages/JobCards';
import MasterData from './pages/MasterData';
import Inventory from './pages/Inventory';
import ProductionTracker from './pages/ProductionTracker';
import Settings from './pages/Settings';
import Login from './pages/Login';
import FinishGoods from './pages/FinishGoods';
import FreightCharge from './pages/FreightCharge';
import PurchaseOrders from './pages/PurchaseOrders';
import Salary from './pages/Salary';
import DC from './pages/DC';
import MR from './pages/MR';
import RM from './pages/RM';
import Scrap from './pages/Scrap';
import AppLayout from './layouts/AppLayout';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes cache
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="job-cards" element={<JobCards />} />
                <Route path="purchase-orders" element={<PurchaseOrders />} />
                <Route path="master-data" element={<MasterData />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="production" element={<ProductionTracker />} />
                <Route path="finish-goods" element={<FinishGoods />} />
                <Route path="freight" element={<FreightCharge />} />
                <Route path="salary" element={<Salary />} />
                <Route path="dc" element={<DC />} />
                <Route path="mr" element={<MR />} />
                <Route path="rm" element={<RM />} />
                <Route path="scrap" element={<Scrap />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

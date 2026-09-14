import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Users, Building2, HardHat, Upload, Loader2, Trash2, Pencil, 
  UserMinus, UserCheck, Calendar, MapPin, User, AlertCircle, CheckCircle2, Search 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getEmployees, createEmployee, deleteEmployee, updateEmployee, 
  markEmployeeLeft, rejoinEmployee, type Employee 
} from '../../lib/supabase/employeeService';

export default function EmployeesTab() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'LEFT' | 'COMPANY' | 'WAGES_DINESH' | 'WAGES_VIKAS'>('ALL');
  const [isImporting, setIsImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Edit employee state
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<'COMPANY' | 'WAGES'>('COMPANY');
  const [editContractorName, setEditContractorName] = useState<'Dinesh' | 'Vikas'>('Dinesh');
  const [editDesignation, setEditDesignation] = useState('');
  const [editBasicSalary, setEditBasicSalary] = useState('');
  const [editFatherName, setEditFatherName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLeftDate, setEditLeftDate] = useState('');
  const [editRejoinDate, setEditRejoinDate] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'LEFT'>('ACTIVE');

  // Mark Left state & modal
  const [leavingEmp, setLeavingEmp] = useState<Employee | null>(null);
  const [leftDate, setLeftDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [isLeavingSubmitting, setIsLeavingSubmitting] = useState(false);

  // Rejoin modal (direct from table)
  const [directRejoinEmp, setDirectRejoinEmp] = useState<Employee | null>(null);
  const [directRejoinDate, setDirectRejoinDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [directRejoinSalary, setDirectRejoinSalary] = useState('');
  const [directRejoinDesignation, setDirectRejoinDesignation] = useState('');
  const [isDirectRejoinSubmitting, setIsDirectRejoinSubmitting] = useState(false);

  // Add / Rejoin employee form state
  const [employeeCode, setEmployeeCode] = useState('');
  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [address, setAddress] = useState('');
  const [designation, setDesignation] = useState('');
  const [category, setCategory] = useState<'COMPANY' | 'WAGES'>('COMPANY');
  const [contractorName, setContractorName] = useState<'Dinesh' | 'Vikas'>('Dinesh');
  const [basicSalary, setBasicSalary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-matching / Rejoin during typing
  const [rejoiningEmp, setRejoiningEmp] = useState<Employee | null>(null);
  const [rejoinDate, setRejoinDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchEmployees = async () => {
    try {
      const data = await getEmployees(false);
      setEmployees(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Autocomplete suggestions matching typed name
  const nameSuggestions = useMemo(() => {
    if (!name.trim() || name.trim().length < 2) return [];
    const query = name.trim().toLowerCase();
    return employees.filter(emp => emp.name.toLowerCase().includes(query));
  }, [name, employees]);

  const selectSuggestedEmployee = (emp: Employee) => {
    setShowSuggestions(false);
    if (emp.status === 'LEFT' || emp.isActive === false) {
      // Rejoin mode
      setRejoiningEmp(emp);
      setName(emp.name);
      setEmployeeCode(emp.employeeCode?.toString() || '');
      setCategory(emp.category);
      if (emp.contractorName) setContractorName(emp.contractorName);
      setDesignation(emp.designation);
      setBasicSalary(emp.basicSalary?.toString() || '');
      setFatherName(emp.fatherName || '');
      setAddress(emp.address || '');
      setRejoinDate(new Date().toISOString().substring(0, 10));
    } else {
      // Active employee clicked - inform user
      setName(emp.name);
      alert(`Employee "${emp.name}" is already ACTIVE (Code: ${emp.employeeCode ?? 'N/A'}). You can edit their details instead of adding duplicate.`);
    }
  };

  const handleResetFromRejoin = () => {
    setRejoiningEmp(null);
    setName('');
    setEmployeeCode('');
    setFatherName('');
    setAddress('');
    setDesignation('');
    setBasicSalary('');
  };

  const handleAddOrRejoinEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !designation || !basicSalary) return;

    try {
      setIsSubmitting(true);

      if (rejoiningEmp) {
        // Rejoin existing employee
        await rejoinEmployee(
          rejoiningEmp.id!,
          rejoiningEmp.name,
          rejoinDate,
          {
            employeeCode: employeeCode ? Number(employeeCode) : undefined,
            name,
            category,
            contractorName: category === 'WAGES' ? contractorName : undefined,
            designation,
            basicSalary: Number(basicSalary),
            fatherName: fatherName.trim() || undefined,
            address: address.trim() || undefined,
          },
          user?.name || 'System'
        );
      } else {
        // Create brand new employee
        const employeeData: any = {
          employeeCode: employeeCode ? Number(employeeCode) : undefined,
          name: name.trim(),
          designation: designation.trim(),
          category,
          basicSalary: Number(basicSalary),
          fatherName: fatherName.trim() || undefined,
          address: address.trim() || undefined,
          isActive: true,
        };
        
        if (category === 'WAGES') {
          employeeData.contractorName = contractorName;
        }

        await createEmployee(employeeData, user?.name || 'System');
      }
      
      setShowAddModal(false);
      handleResetFromRejoin();
      fetchEmployees();
    } catch (error: any) {
      console.error(error);
      alert('Failed to save employee: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenLeftModal = (emp: Employee) => {
    setLeavingEmp(emp);
    setLeftDate(new Date().toISOString().substring(0, 10));
  };

  const handleConfirmLeft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leavingEmp || !leftDate) return;

    try {
      setIsLeavingSubmitting(true);
      await markEmployeeLeft(leavingEmp.id!, leavingEmp.name, leftDate, user?.name || 'System');
      setLeavingEmp(null);
      fetchEmployees();
    } catch (error: any) {
      console.error(error);
      alert('Failed to mark employee as left: ' + error.message);
    } finally {
      setIsLeavingSubmitting(false);
    }
  };

  const handleOpenDirectRejoin = (emp: Employee) => {
    setDirectRejoinEmp(emp);
    setDirectRejoinDate(new Date().toISOString().substring(0, 10));
    setDirectRejoinSalary(emp.basicSalary?.toString() || '');
    setDirectRejoinDesignation(emp.designation || '');
  };

  const handleConfirmDirectRejoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directRejoinEmp || !directRejoinDate) return;

    try {
      setIsDirectRejoinSubmitting(true);
      await rejoinEmployee(
        directRejoinEmp.id!,
        directRejoinEmp.name,
        directRejoinDate,
        {
          basicSalary: directRejoinSalary ? Number(directRejoinSalary) : directRejoinEmp.basicSalary,
          designation: directRejoinDesignation.trim() || directRejoinEmp.designation,
        },
        user?.name || 'System'
      );
      setDirectRejoinEmp(null);
      fetchEmployees();
    } catch (error: any) {
      console.error(error);
      alert('Failed to rejoin employee: ' + error.message);
    } finally {
      setIsDirectRejoinSubmitting(false);
    }
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`Are you sure you want to remove "${emp.name}" from the employee list?`)) return;
    try {
      setDeletingId(emp.id!);
      await deleteEmployee(emp.id!, user?.name || 'System');
      fetchEmployees();
    } catch (error: any) {
      alert('Failed to delete: ' + error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmp(emp);
    setEditCode(emp.employeeCode?.toString() || '');
    setEditName(emp.name);
    setEditCategory(emp.category);
    setEditContractorName(emp.contractorName || 'Dinesh');
    setEditDesignation(emp.designation);
    setEditBasicSalary(emp.basicSalary?.toString() || '');
    setEditFatherName(emp.fatherName || '');
    setEditAddress(emp.address || '');
    setEditLeftDate(emp.leftDate || '');
    setEditRejoinDate(emp.rejoinDate || '');
    setEditStatus(emp.status === 'LEFT' || emp.isActive === false ? 'LEFT' : 'ACTIVE');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    try {
      setIsUpdating(true);
      await updateEmployee(editingEmp.id!, {
        employeeCode: editCode ? Number(editCode) : undefined,
        name: editName.trim(),
        category: editCategory,
        contractorName: editCategory === 'WAGES' ? editContractorName : undefined,
        designation: editDesignation.trim(),
        basicSalary: Number(editBasicSalary),
        fatherName: editFatherName.trim() || undefined,
        address: editAddress.trim() || undefined,
        status: editStatus,
        leftDate: editStatus === 'LEFT' ? (editLeftDate || undefined) : (editLeftDate || undefined),
        rejoinDate: editRejoinDate || undefined,
        isActive: editStatus === 'ACTIVE',
      }, user?.name || 'System');
      setEditingEmp(null);
      fetchEmployees();
    } catch (error: any) {
      alert('Failed to update: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

      for (const row of jsonData) {
        if (!row.Name || !row.Designation || !row.BasicSalary) continue;
        
        let rowCat: 'COMPANY' | 'WAGES' = 'COMPANY';
        let rowCont: 'Dinesh' | 'Vikas' | undefined = undefined;

        if (String(row.Category).toUpperCase().includes('WAGE') || String(row.Category).toUpperCase() === 'CONTRACTOR') {
          rowCat = 'WAGES';
          const cName = String(row.ContractorName || '').toLowerCase();
          if (cName.includes('vikas')) rowCont = 'Vikas';
          else rowCont = 'Dinesh';
        }

        await createEmployee({
          employeeCode: row.EmployeeCode ? Number(row.EmployeeCode) : undefined,
          name: String(row.Name).trim(),
          designation: String(row.Designation).trim(),
          category: rowCat,
          contractorName: rowCont,
          basicSalary: Number(row.BasicSalary) || 0,
          fatherName: row.FatherName ? String(row.FatherName).trim() : undefined,
          address: row.Address ? String(row.Address).trim() : undefined,
          isActive: true
        }, user?.name || 'System');
      }

      fetchEmployees();
      alert('Import successful!');
    } catch (error) {
      console.error(error);
      alert('Failed to import data. Check console for details.');
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const isLeft = emp.status === 'LEFT' || emp.isActive === false;
    if (filter === 'ACTIVE' && isLeft) return false;
    if (filter === 'LEFT' && !isLeft) return false;
    if (filter === 'COMPANY' && emp.category !== 'COMPANY') return false;
    if (filter === 'WAGES_DINESH' && !(emp.category === 'WAGES' && emp.contractorName === 'Dinesh')) return false;
    if (filter === 'WAGES_VIKAS' && !(emp.category === 'WAGES' && emp.contractorName === 'Vikas')) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = emp.name.toLowerCase().includes(q);
      const matchFather = (emp.fatherName || '').toLowerCase().includes(q);
      const matchCode = String(emp.employeeCode || '').includes(q);
      const matchDesig = (emp.designation || '').toLowerCase().includes(q);
      const matchDate = (emp.leftDate || '').includes(q) || (emp.rejoinDate || '').includes(q);
      return matchName || matchFather || matchCode || matchDesig || matchDate;
    }
    return true;
  });

  const activeCount = employees.filter(e => e.status !== 'LEFT' && e.isActive !== false).length;
  const leftCount = employees.filter(e => e.status === 'LEFT' || e.isActive === false).length;

  const thClass = "px-3 py-3 border-b border-border text-left font-medium text-muted-foreground whitespace-nowrap";

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-card p-4 rounded-lg border border-border shadow-sm gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Employee Directory</h2>
          <p className="text-sm text-muted-foreground">
            Total {employees.length} employees ({activeCount} Active, {leftCount} Left)
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors shadow-sm cursor-pointer disabled:opacity-50 text-sm">
            {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Import Excel
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
          </label>
          <button
            onClick={() => {
              handleResetFromRejoin();
              setShowAddModal(true);
            }}
            className="flex items-center px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row gap-2 justify-between items-stretch md:items-center">
        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { id: 'ALL', label: `All (${employees.length})` },
            { id: 'ACTIVE', label: `Active (${activeCount})` },
            { id: 'LEFT', label: `Left (${leftCount})` },
            { id: 'COMPANY', label: 'Company' },
            { id: 'WAGES_DINESH', label: 'Wages (Dinesh)' },
            { id: 'WAGES_VIKAS', label: 'Wages (Vikas)' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                filter === tab.id 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-card text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input Box */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            className="w-full pl-9 pr-7 py-1.5 border border-input rounded-md bg-background text-sm"
            placeholder="Search by name, father, date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-card border border-border rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className={thClass}>Code</th>
                <th className={thClass}>Category</th>
                <th className={thClass}>Employee Name & Details</th>
                <th className={thClass}>Designation</th>
                <th className={thClass}>Basic Salary</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">Loading employees...</td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No employees found for this filter.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const isLeft = emp.status === 'LEFT' || emp.isActive === false;
                  return (
                    <tr key={emp.id} className={`hover:bg-muted/50 transition-colors border-b border-border ${isLeft ? 'bg-muted/20' : ''}`}>
                      <td className="px-3 py-3 font-bold text-primary">
                        {emp.employeeCode ?? '-'}
                      </td>
                      <td className="px-3 py-3">
                        {emp.category === 'COMPANY' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                            <Building2 className="w-3 h-3 mr-1" />
                            Company
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                            <HardHat className="w-3 h-3 mr-1" />
                            Wages {emp.contractorName ? `(${emp.contractorName})` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-foreground">{emp.name}</div>
                        {emp.fatherName && (
                          <div className="text-xs text-muted-foreground flex items-center mt-0.5">
                            <span className="text-muted-foreground/80 font-normal mr-1">S/O:</span>
                            <span className="font-medium text-foreground/80">{emp.fatherName}</span>
                          </div>
                        )}
                        {emp.address && (
                          <div className="text-xs text-muted-foreground flex items-center mt-0.5" title={emp.address}>
                            <MapPin className="w-3 h-3 mr-1 text-muted-foreground/60 shrink-0" />
                            <span className="truncate max-w-[200px]">{emp.address}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">{emp.designation}</td>
                      <td className="px-3 py-3 font-medium">₹ {emp.basicSalary?.toLocaleString() ?? 0}</td>
                      <td className="px-3 py-3">
                        {isLeft ? (
                          <div className="inline-flex flex-col items-start gap-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                              <UserMinus className="w-3 h-3 mr-1" />
                              Left
                            </span>
                            {emp.leftDate ? (
                              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                📅 Left: {emp.leftDate}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Left: Date N/A</span>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-start gap-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <UserCheck className="w-3 h-3 mr-1" />
                              Active
                            </span>
                            {emp.rejoinDate && (
                              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                🔄 Rejoined: {emp.rejoinDate}
                              </span>
                            )}
                            {emp.leftDate && (
                              <span className="text-[11px] text-muted-foreground">
                                (Prev. Left: {emp.leftDate})
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="flex items-center px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition-colors"
                            title="Edit employee details"
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </button>

                          {isLeft ? (
                            <button
                              onClick={() => handleOpenDirectRejoin(emp)}
                              className="flex items-center px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 border border-emerald-300 rounded-md transition-colors font-medium bg-emerald-50/50"
                              title="Rejoin this employee"
                            >
                              <UserCheck className="w-3 h-3 mr-1 text-emerald-600" />
                              Rejoin
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenLeftModal(emp)}
                              className="flex items-center px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 border border-amber-300 rounded-md transition-colors font-medium bg-amber-50/30"
                              title="Mark employee as left service"
                            >
                              <UserMinus className="w-3 h-3 mr-1 text-amber-600" />
                              Left
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(emp)}
                            disabled={deletingId === emp.id}
                            className="flex items-center px-1.5 py-1 text-xs text-red-500 hover:bg-red-50 border border-red-200 rounded-md transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === emp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Rejoin Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card w-full max-w-lg rounded-xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">
                  {rejoiningEmp ? 'Rejoin Employee' : 'Add New Employee'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rejoiningEmp 
                    ? 'Rejoining an existing employee preserves past historical data.' 
                    : 'Enter employee details. Father name and address are optional.'}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  handleResetFromRejoin();
                }} 
                className="text-muted-foreground hover:text-foreground text-lg"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleAddOrRejoinEmployee} className="p-4 overflow-y-auto space-y-4">
              {/* Rejoin notice banner if existing employee selected */}
              {rejoiningEmp && (
                <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 flex items-start justify-between">
                  <div className="flex gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-900">
                        Rejoining: {rejoiningEmp.name}
                      </h4>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        {rejoiningEmp.leftDate ? `Left on ${rejoiningEmp.leftDate}. ` : ''}
                        Old data for August 2026 and past days will remain completely safe. 
                        Employee will show in Daily Entry from Rejoin Date.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetFromRejoin}
                    className="text-xs text-emerald-800 underline font-medium hover:text-emerald-900 ml-2 whitespace-nowrap"
                  >
                    Cancel Rejoin
                  </button>
                </div>
              )}

              {/* Rejoin Date Picker (Only shown when in Rejoin Mode) */}
              {rejoiningEmp && (
                <div className="bg-muted/40 p-3 rounded-lg border border-border">
                  <label className="block text-sm font-semibold text-primary mb-1">
                    Rejoin Date (Rejoin Hone Ki Date) *
                  </label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    <input 
                      type="date"
                      required
                      className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm font-medium"
                      value={rejoinDate}
                      onChange={(e) => setRejoinDate(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Employee will start showing in Daily Attendance sheet from this date onwards.
                  </p>
                </div>
              )}

              {/* Employee Code */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Employee Code (Number)</label>
                <input 
                  type="number"
                  min="1"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="e.g. 1, 2, 3..."
                />
                <p className="text-xs text-muted-foreground mt-1">Employees will sort in ascending order of this code</p>
              </div>

              {/* Employee Name with Typeahead Suggestions */}
              <div className="relative" ref={suggestionsRef}>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Employee Name *
                </label>
                <input 
                  type="text" 
                  required 
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setShowSuggestions(true);
                    if (rejoiningEmp && e.target.value !== rejoiningEmp.name) {
                      setRejoiningEmp(null);
                    }
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Type employee name..."
                />

                {/* Autocomplete Dropdown */}
                {showSuggestions && nameSuggestions.length > 0 && !rejoiningEmp && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-56 overflow-y-auto">
                    <div className="p-2 text-xs font-semibold text-muted-foreground border-b border-border bg-muted/40">
                      Existing Employees Matching "{name}":
                    </div>
                    {nameSuggestions.map(suggestion => {
                      const isLeft = suggestion.status === 'LEFT' || suggestion.isActive === false;
                      return (
                        <div
                          key={suggestion.id}
                          onClick={() => selectSuggestedEmployee(suggestion)}
                          className="p-2.5 hover:bg-muted/70 cursor-pointer border-b border-border/50 last:border-0 flex items-center justify-between transition-colors"
                        >
                          <div>
                            <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                              {suggestion.name}
                              <span className="text-xs text-muted-foreground font-normal">
                                (Code: {suggestion.employeeCode ?? '-'})
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {suggestion.category} • {suggestion.designation}
                              {suggestion.fatherName ? ` • S/O ${suggestion.fatherName}` : ''}
                            </div>
                          </div>
                          <div>
                            {isLeft ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                Left ({suggestion.leftDate || 'Old'}) → Click to Rejoin
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                Already Active
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Father's Name (Optional / Requested) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Father's Name (Pita Ka Naam)
                </label>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="Father's full name"
                  />
                </div>
              </div>

              {/* Address (Optional) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Address (Optional)
                </label>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-2.5" />
                  <textarea 
                    rows={2}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Village / City / Full Address (Optional)"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Category</label>
                <select 
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                >
                  <option value="COMPANY">Company Employee</option>
                  <option value="WAGES">Wages Labour</option>
                </select>
              </div>

              {/* Contractor Name if Wages */}
              {category === 'WAGES' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Contractor Name *</label>
                  <select 
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    value={contractorName}
                    onChange={(e) => setContractorName(e.target.value as any)}
                  >
                    <option value="Dinesh">Dinesh</option>
                    <option value="Vikas">Vikas</option>
                  </select>
                </div>
              )}

              {/* Designation */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Designation *</label>
                <input 
                  type="text" 
                  required 
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Operator, Helper, Supervisor..."
                />
              </div>

              {/* Basic Monthly Salary */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Basic Monthly Salary (₹) *</label>
                <input 
                  type="number" 
                  required 
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md font-semibold"
                  value={basicSalary}
                  onChange={(e) => setBasicSalary(e.target.value)}
                  placeholder="e.g. 15000"
                />
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    handleResetFromRejoin();
                  }}
                  className="px-4 py-2 border border-input rounded-md text-sm"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center ${
                    rejoiningEmp ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-primary hover:bg-primary/90'
                  }`}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>
                  ) : rejoiningEmp ? (
                    <><UserCheck className="w-4 h-4 mr-2" />Confirm & Rejoin Employee</>
                  ) : (
                    <><Plus className="w-4 h-4 mr-2" />Save Employee</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Employee as Left Modal */}
      {leavingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl flex flex-col">
            <div className="p-4 border-b border-border flex justify-between items-center bg-amber-50/50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <UserMinus className="w-5 h-5 text-amber-600" />
                <h2 className="text-lg font-bold text-foreground">Mark as Left Employee</h2>
              </div>
              <button onClick={() => setLeavingEmp(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            
            <form onSubmit={handleConfirmLeft} className="p-4 space-y-4">
              <div className="p-3 bg-muted/40 rounded-lg border border-border">
                <div className="text-xs text-muted-foreground">Employee Name:</div>
                <div className="text-base font-bold text-foreground">{leavingEmp.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Code: {leavingEmp.employeeCode ?? '-'} • {leavingEmp.category} • {leavingEmp.designation}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  Job Left Date (Left Hone Ki Date) *
                </label>
                <input 
                  type="date"
                  required
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm font-medium"
                  value={leftDate}
                  onChange={(e) => setLeftDate(e.target.value)}
                />
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
                <div className="font-semibold flex items-center gap-1 text-blue-900">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                  Historical Data Protection:
                </div>
                <p>
                  • August 2026 aur is left date tak ka pura attendance & salary data 100% safe rahega.
                </p>
                <p>
                  • Is Left Date ke baad se ye employee Daily Attendance sheet me show nahi hoga.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setLeavingEmp(null)}
                  className="px-4 py-2 border border-input rounded-md text-sm"
                  disabled={isLeavingSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-sm font-medium disabled:opacity-50 flex items-center"
                  disabled={isLeavingSubmitting}
                >
                  {isLeavingSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>
                  ) : (
                    <><UserMinus className="w-4 h-4 mr-2" />Confirm Left</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Rejoin Modal (from table) */}
      {directRejoinEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl flex flex-col">
            <div className="p-4 border-b border-border flex justify-between items-center bg-emerald-50/60 rounded-t-xl">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold text-foreground">Rejoin Employee</h2>
              </div>
              <button onClick={() => setDirectRejoinEmp(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            
            <form onSubmit={handleConfirmDirectRejoin} className="p-4 space-y-4">
              <div className="p-3 bg-muted/40 rounded-lg border border-border">
                <div className="text-xs text-muted-foreground">Employee Name:</div>
                <div className="text-base font-bold text-foreground">{directRejoinEmp.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Code: {directRejoinEmp.employeeCode ?? '-'} • {directRejoinEmp.category}
                  {directRejoinEmp.leftDate ? ` • Previously Left on ${directRejoinEmp.leftDate}` : ''}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  Rejoin Date (Wapas Aane Ki Date) *
                </label>
                <input 
                  type="date"
                  required
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm font-medium"
                  value={directRejoinDate}
                  onChange={(e) => setDirectRejoinDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Designation</label>
                <input 
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                  value={directRejoinDesignation}
                  onChange={(e) => setDirectRejoinDesignation(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Basic Monthly Salary (₹) *</label>
                <input 
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm font-semibold"
                  value={directRejoinSalary}
                  onChange={(e) => setDirectRejoinSalary(e.target.value)}
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                Ye employee is Rejoin Date se active ho jayega aur us date se Daily Attendance sheet me dikhne lagega. Old data poora safe rahega.
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDirectRejoinEmp(null)}
                  className="px-4 py-2 border border-input rounded-md text-sm"
                  disabled={isDirectRejoinSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium disabled:opacity-50 flex items-center"
                  disabled={isDirectRejoinSubmitting}
                >
                  {isDirectRejoinSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Rejoining...</>
                  ) : (
                    <><UserCheck className="w-4 h-4 mr-2" />Confirm Rejoin</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card w-full max-w-lg rounded-xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">Edit Employee Details</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Update employee profile, father name, address, and salary</p>
              </div>
              <button onClick={() => setEditingEmp(null)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
            </div>
            
            <form onSubmit={handleUpdate} className="p-4 overflow-y-auto space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
                <p className="text-xs text-amber-900 font-medium">
                  ✏️ Editing: <span className="font-bold">{editingEmp.name}</span>
                </p>
                {editingEmp.status === 'LEFT' && (
                  <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                    Status: Left on {editingEmp.leftDate || 'N/A'}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Employee Code (Number)</label>
                <input 
                  type="number"
                  min="1"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md font-bold"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  placeholder="e.g. 1, 2, 3..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Employee Name *</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Father's Name (Pita Ka Naam)</label>
                <input 
                  type="text"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  value={editFatherName}
                  onChange={(e) => setEditFatherName(e.target.value)}
                  placeholder="Father's full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Address (Optional)</label>
                <textarea 
                  rows={2}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Address details"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Category</label>
                <select 
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as any)}
                >
                  <option value="COMPANY">Company Employee</option>
                  <option value="WAGES">Wages Labour</option>
                </select>
              </div>

              {editCategory === 'WAGES' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Contractor Name</label>
                  <select 
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    value={editContractorName}
                    onChange={(e) => setEditContractorName(e.target.value as any)}
                  >
                    <option value="Dinesh">Dinesh</option>
                    <option value="Vikas">Vikas</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Designation *</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Basic Monthly Salary (₹) *</label>
                <input 
                  type="number" 
                  required 
                  min="0" 
                  step="0.01"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md font-semibold"
                  value={editBasicSalary}
                  onChange={(e) => setEditBasicSalary(e.target.value)}
                />
              </div>

              {/* Service Status & Dates Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-primary" />
                  Service Status & Employment Dates
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Current Status</label>
                  <div className="flex gap-4">
                    <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="editStatus"
                        value="ACTIVE"
                        checked={editStatus === 'ACTIVE'}
                        onChange={() => setEditStatus('ACTIVE')}
                        className="text-primary"
                      />
                      <span className="font-medium text-emerald-700">Active</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="editStatus"
                        value="LEFT"
                        checked={editStatus === 'LEFT'}
                        onChange={() => setEditStatus('LEFT')}
                        className="text-rose-600"
                      />
                      <span className="font-medium text-rose-700">Left Service</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Job Left Date {editStatus === 'LEFT' ? '*' : '(if left earlier)'}
                    </label>
                    <input
                      type="date"
                      className="w-full px-2.5 py-1.5 border border-input bg-background rounded-md text-xs font-medium"
                      value={editLeftDate}
                      onChange={(e) => setEditLeftDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Rejoin Date (if rejoined)
                    </label>
                    <input
                      type="date"
                      className="w-full px-2.5 py-1.5 border border-input bg-background rounded-md text-xs font-medium"
                      value={editRejoinDate}
                      onChange={(e) => setEditRejoinDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border flex justify-end gap-3">
                <button type="button" onClick={() => setEditingEmp(null)} className="px-4 py-2 border border-input rounded-md text-sm" disabled={isUpdating}>
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center" disabled={isUpdating}>
                  {isUpdating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

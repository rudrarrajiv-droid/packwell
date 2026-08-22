import React, { useState, useRef, useEffect } from 'react';
import { Settings as SettingsIcon, Download, Database, PackageSearch, AlertCircle, Upload, MonitorSmartphone, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getActiveSessions, deleteAllOtherSessions, type UserSession } from '../lib/supabase/userSessionService';
import { getProducts, createProduct, updateProduct } from '../lib/supabase/productService';
import { getReels, createReel, updateReel } from '../lib/supabase/reelService';
import { updateUserPassword } from '../lib/supabase/userCredentialsService';
import { CONFIGURED_USERS } from '../lib/auth/users';
import * as xlsx from 'xlsx';

type BackupTarget = 'products' | 'reels';

export default function Settings() {
  const { hasRole, user, sessionId } = useAuth();
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<BackupTarget>('products');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  const loadSessions = async () => {
    try {
      if (user) {
        const sessions = await getActiveSessions(user.id);
        setActiveSessions(sessions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleLogoutOtherDevices = async () => {
    if (!user || !sessionId) return;
    if (!confirm('Are you sure you want to log out from all other devices?')) return;
    
    try {
      await deleteAllOtherSessions(user.id, sessionId);
      alert('Successfully logged out from all other devices.');
      loadSessions();
    } catch (err) {
      alert('Failed to log out other devices.');
    }
  };

  const handleExport = async (collectionName: BackupTarget, filenamePrefix: string) => {
    try {
      setIsExporting(collectionName);
      let data: any[] = collectionName === 'products'
        ? await getProducts()
        : await getReels();
      
      if (!data || data.length === 0) {
        alert(`No data found in ${collectionName}.`);
        return;
      }

      // Helper to flatten objects and arrays
      const flattenObject = (ob: any, prefix = ''): any => {
        let toReturn: any = {};
        for (let i in ob) {
          if (!ob.hasOwnProperty(i)) continue;

          if (ob[i] === null || ob[i] === undefined) {
            toReturn[prefix + i] = '';
          } else if (ob[i].toDate && typeof ob[i].toDate === 'function') {
            toReturn[prefix + i] = ob[i].toDate().toISOString();
          } else if (typeof ob[i] === 'object' && !Array.isArray(ob[i]) && Object.keys(ob[i]).length > 0) {
            let flatObject = flattenObject(ob[i], prefix + i + '_');
            for (let x in flatObject) {
              if (!flatObject.hasOwnProperty(x)) continue;
              toReturn[x] = flatObject[x];
            }
          } else if (Array.isArray(ob[i])) {
            ob[i].forEach((item: any, index: number) => {
              if (typeof item === 'object' && item !== null) {
                let flatObject = flattenObject(item, prefix + i + '_' + (index + 1) + '_');
                for (let x in flatObject) {
                  toReturn[x] = flatObject[x];
                }
              } else {
                toReturn[prefix + i + '_' + (index + 1)] = item;
              }
            });
          } else {
            toReturn[prefix + i] = ob[i];
          }
        }
        return toReturn;
      };

      if (collectionName === 'products' || collectionName === 'reels') {
        data = data.map((d: any) => flattenObject(d));
      }

      let keys = Array.from(new Set(data.flatMap(Object.keys)));
      
      const csvRows = [
        keys.join(','), // Header row
        ...data.map(row => keys.map(k => {
          let val = (row as any)[k];
          if (typeof val === 'object' && val !== null) {
            // Check if it's a Firestore Timestamp
            if (val.toDate && typeof val.toDate === 'function') {
              val = val.toDate().toISOString();
            } else {
              val = JSON.stringify(val);
            }
          }
          if (val === undefined || val === null) val = '';
          // Escape quotes
          const strVal = String(val).replace(/"/g, '""');
          return `"${strVal}"`;
        }).join(','))
      ];
      
      const csvContent = csvRows.join('\n');
      
      // Create Blob and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `${filenamePrefix}-${dateStr}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(null);
    }
  };

  // Unflatten nested objects (e.g. 'layers_0_gsm' -> layers: [{gsm: ...}])
  const unflattenObject = (data: any) => {
    const result: any = {};
    for (const key in data) {
      if (!data.hasOwnProperty(key)) continue;
      const keys = key.split('_');
      let current = result;
      for (let i = 0; i < keys.length; i++) {
        let k = keys[i];
        const isArrayIndex = !isNaN(Number(keys[i + 1]));
        if (i === keys.length - 1) {
          current[k] = data[key];
        } else {
          current[k] = current[k] || (isArrayIndex ? [] : {});
          current = current[k];
        }
      }
    }
    return result;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!confirm(`Are you sure you want to upload and sync ${file.name} to ${importTarget === 'products' ? 'Master Data' : 'Reel Inventory'}? This may overwrite existing data.`)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    
    try {
      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = xlsx.utils.sheet_to_json(firstSheet);

      // Existing (non-archived) IDs for the target collection, used to decide
      // create vs. update below - Supabase's update() does not throw when no
      // row matches, unlike the previous Firestore updateDoc() behavior.
      const existingIds = new Set(
        (importTarget === 'products' ? await getProducts() : await getReels()).map((r: any) => r.id)
      );

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const unflattened = unflattenObject(row);
        
        // Remove any undefined or empty strings if necessary, or just rely on Supabase to store them
        const docId = unflattened.id;
        
        if (docId && existingIds.has(docId)) {
          // Exists, update it
          // Avoid overwriting the ID itself inside the document
          const { id, ...updateData } = unflattened;
          if (importTarget === 'products') {
            await updateProduct(docId, updateData, 'System/CSV-Import');
          } else {
            await updateReel(docId, updateData, 'System/CSV-Import');
          }
        } else {
          // No ID provided (or ID not found), create new
          const { id, ...createData } = unflattened;
          if (importTarget === 'products') {
            await createProduct(createData, 'System/CSV-Import');
          } else {
            await createReel(createData, 'System/CSV-Import');
          }
        }
        
        setImportProgress(Math.round(((i + 1) / jsonData.length) * 100));
      }
      
      alert('CSV Import Complete! Successfully synced data.');
    } catch (err: any) {
      alert('Import failed: ' + err.message);
    } finally {
      setIsImporting(false);
      setImportProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-full flex flex-col p-6 max-w-5xl mx-auto w-full gap-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">Application configuration and data management.</p>
      </div>

      <div className="grid gap-6">
        
        {/* Security / Password Change Section */}
        <section className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border bg-secondary/30">
            <h2 className="text-lg font-bold flex items-center">
              <LogOut className="w-5 h-5 mr-2 text-primary" /> {/* Using LogOut icon temporarily as placeholder for Lock/Security */}
              Security & Password
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Change your password or manage other users' passwords.</p>
          </div>
          
          <div className="p-6">
            <PasswordChangeForm user={user} hasRole={hasRole} />
          </div>
        </section>
        
        {/* Active Sessions Section */}
        <section className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border bg-secondary/30 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold flex items-center">
                <MonitorSmartphone className="w-5 h-5 mr-2 text-primary" />
                Active Sessions
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Manage devices where your account is currently logged in.</p>
            </div>
            {activeSessions.length > 1 && (
              <button
                onClick={handleLogoutOtherDevices}
                className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 font-medium rounded-md text-sm flex items-center transition-colors"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout Other Devices
              </button>
            )}
          </div>
          
          <div className="p-6">
            {isLoadingSessions ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {activeSessions.map((session) => {
                  const isCurrent = session.id === sessionId;
                  const lastActiveDate = session.lastActive?.toDate ? session.lastActive.toDate() : new Date();
                  
                  return (
                    <div key={session.id} className={`flex items-center justify-between p-4 rounded-lg border ${isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-foreground">
                            {session.deviceInfo.includes('Mobile') ? 'Mobile Device' : 'Desktop / Laptop'}
                          </h3>
                          {isCurrent && (
                            <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-full font-medium">This Device</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{session.deviceInfo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Last active: {lastActiveDate.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Data Management Section */}
        {hasRole('ADMIN') && (
        <section className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
          <div className="p-5 border-b border-border bg-secondary/30">
            <h2 className="text-lg font-bold flex items-center">
              <Database className="w-5 h-5 mr-2 text-primary" />
              Data Backup & Export
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Download complete CSV backups of your critical business data.</p>
          </div>
          
          <div className="p-6 grid md:grid-cols-2 gap-6">
            
            {/* Master Data Backup */}
            <div className="border border-border rounded-lg p-5 flex flex-col justify-between items-start gap-4 hover:border-primary/50 transition-colors">
              <div>
                <h3 className="font-bold flex items-center">
                  <Database className="w-4 h-4 mr-2" />
                  Master Data
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Includes all customer specifications, dimensions, and product logic.</p>
              </div>
              <button 
                onClick={() => handleExport('products', 'master-data-backup')}
                disabled={isExporting !== null}
                className="w-full flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isExporting === 'products' ? (
                  <span className="animate-pulse">Exporting...</span>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV Backup
                  </>
                )}
              </button>
            </div>

            {/* Reel Inventory Backup */}
            <div className="border border-border rounded-lg p-5 flex flex-col justify-between items-start gap-4 hover:border-primary/50 transition-colors">
              <div>
                <h3 className="font-bold flex items-center">
                  <PackageSearch className="w-4 h-4 mr-2" />
                  Reel Inventory
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Includes current stock balances, specs, and historical transactions.</p>
              </div>
              <button 
                onClick={() => handleExport('reels', 'reel-inventory-backup')}
                disabled={isExporting !== null}
                className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isExporting === 'reels' ? (
                  <span className="animate-pulse">Exporting...</span>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV Backup
                  </>
                )}
              </button>
            </div>

          </div>
          <div className="p-4 bg-yellow-50 text-yellow-800 text-xs border-t border-yellow-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p><strong>Note:</strong> These backups are raw CSV extracts suitable for offline viewing in Excel. Do not manually edit and re-upload these files unless instructed.</p>
          </div>
        </section>
        )}

        {hasRole('ADMIN') && (
        <section className="bg-card border border-border shadow-sm rounded-xl overflow-hidden mt-6">
          <div className="p-5 border-b border-border bg-secondary/30">
            <h2 className="text-lg font-bold flex items-center">
              <Upload className="w-5 h-5 mr-2 text-primary" />
              Upload & Sync CSV Data
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Upload a modified CSV to create or update existing records. Keep the <strong>id</strong> column intact to update.</p>
          </div>
          <div className="p-6 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <select 
                value={importTarget}
                onChange={(e) => setImportTarget(e.target.value as BackupTarget)}
                className="flex-1 px-3 py-2 border border-input bg-background rounded-md"
              >
                <option value="products">Master Data (Products)</option>
                <option value="reels">Reel Inventory</option>
              </select>
              <input 
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isImporting ? `Uploading... ${importProgress}%` : 'Select & Upload CSV'}
              </button>
            </div>
            {isImporting && (
              <div className="w-full bg-secondary rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
              </div>
            )}
          </div>
        </section>
        )}

        {/* Developer / Admin Section */}
        <section className="bg-card border border-border shadow-sm rounded-xl overflow-hidden mt-6">
          <div className="p-5 border-b border-border bg-secondary/30">
            <h2 className="text-lg font-bold flex items-center text-orange-600">
              <Database className="w-5 h-5 mr-2" />
              Legacy Data Import (Admin Only)
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              This one-time historical import already ran on 2026-08-01 and 2026-08-14. It has been permanently
              disabled because running it again would create another duplicate batch of customers and products.
            </p>
          </div>
          
          <div className="p-6">
            <button 
              disabled
              title="Disabled: this legacy import already ran twice and creating it again would duplicate data further."
              className="px-6 py-2 bg-orange-600 text-white font-medium rounded-md opacity-50 cursor-not-allowed"
            >
              Import Legacy Master Data (Disabled)
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}

function PasswordChangeForm({ user, hasRole }: any) {
  const isAdmin = hasRole('ADMIN');
  const [selectedUserId, setSelectedUserId] = useState(user?.id || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ text: "Passwords do not match.", type: 'error' });
      return;
    }
    if (newPassword.length < 4) {
      setMessage({ text: "Password must be at least 4 characters.", type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      await updateUserPassword(selectedUserId, newPassword);
      setMessage({ text: "Password updated successfully!", type: 'success' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ text: "Failed to update password. " + err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Regular users can only change their own password
  const availableUsers = isAdmin 
    ? CONFIGURED_USERS 
    : CONFIGURED_USERS.filter(u => u.id === user?.id);

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}
      
      <div>
        <label className="block text-sm font-medium mb-1">Target User</label>
        <select 
          value={selectedUserId} 
          onChange={e => setSelectedUserId(e.target.value)}
          disabled={!isAdmin}
          className="w-full px-3 py-2 border border-input rounded-md bg-background disabled:opacity-50"
        >
          {availableUsers.map(u => (
            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">New Password</label>
        <input 
          type="password"
          required
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md bg-background"
          placeholder="Enter new password"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Confirm New Password</label>
        <input 
          type="password"
          required
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md bg-background"
          placeholder="Confirm new password"
        />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        className="w-full px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex justify-center items-center"
      >
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Change Password
      </button>
    </form>
  );
}

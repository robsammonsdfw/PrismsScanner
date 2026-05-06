import React, { useEffect, useState } from 'react';
import { getScanHistory } from '../services/api';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { HealthReport } from './HealthReport';

export const ScanHistory: React.FC = () => {
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScan, setSelectedScan] = useState<any>(null);

  const loadScans = async () => {
    setLoading(true);
    try {
      const data = await getScanHistory();
      setScans(data || []);
    } catch (err) {
      console.error("Failed to load scan history", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScans();
  }, []);

  const refreshScanStatus = async (scanId: string) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
      const url = `${backendUrl}/body-scans/refresh/${scanId}?_t=${Date.now()}`;

      console.log("🔄 Calling refresh:", url);

      const response = await fetch(url, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('embracehealth-api-token')}`   // ← This was missing
        }
      });

      console.log("Refresh response status:", response.status);

      if (response.ok) {
        loadScans();
      } else {
        console.error("Refresh failed with status", response.status);
      }
    } catch (err) {
      console.error("Failed to refresh status", err);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'READY') return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">✅ Completed</span>;
    if (s === 'PROCESSING' || s === 'CREATED') return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">⏳ Processing</span>;
    if (s === 'FAILED') return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">❌ Failed</span>;
    return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600">📌 {status}</span>;
  };

  if (selectedScan) {
    return <HealthReport results={selectedScan} onBack={() => setSelectedScan(null)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Your Scans</h1>
          <button onClick={loadScans} className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600">
            <RefreshCw className="w-4 h-4" />
            Refresh All
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : scans.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No scans yet.<br />Your first scan will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {scans.map((scan) => {
              const scanData = scan.scan_data || scan;
              const date = new Date(scan.created_at || scan.createdAt);
              const status = scanData.status || 'CREATED';

              return (
                <div
                  key={scan.id}
                  className="bg-white border border-slate-200 rounded-3xl p-6 flex items-center justify-between cursor-pointer hover:border-emerald-300 hover:shadow transition-all group"
                >
                  <div className="flex items-center gap-4" onClick={() => setSelectedScan(scan)}>
                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-2xl">📸</div>
                    <div>
                      <p className="font-semibold text-slate-900">Body Scan</p>
                      <p className="text-sm text-slate-500">
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 
                        at {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {getStatusBadge(status)}
                    {(status === 'PROCESSING' || status === 'CREATED') && (
                      <button
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshScanStatus(scan.id);
                      }}
                      className="text-xs px-3 py-1 bg-amber-100 text-amber-700 rounded-full hover:bg-amber-200"
                    >
                      Refresh
                    </button>
                    )}
                    <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
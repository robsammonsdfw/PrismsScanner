import React, { useEffect, useState } from 'react';
import { getScanHistory } from '../services/api';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { HealthReport } from './HealthReport';

export const ScanHistory: React.FC = () => {
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<any>(null);
  const [rawData, setRawData] = useState<any>(null);   // ← shows exactly what the API returns

  const loadScans = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getScanHistory();
      setRawData(data);           // save raw data for debugging
      setScans(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to load scan history", err);
      setError(err.message || "Failed to load scans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScans();
  }, []);

  // Auto-refresh if any scan is processing
  useEffect(() => {
    const interval = setInterval(() => {
      if (scans.some(s => {
        const status = s.scan_data?.status || s.status;
        return status === 'PROCESSING' || status === 'CREATED';
      })) {
        loadScans();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [scans]);

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
            Refresh
          </button>
        </div>

        {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}

        {error && <div className="text-red-500 text-center py-8">{error}</div>}

        {/* RAW DATA DEBUG - always visible when no scans */}
        {!loading && scans.length === 0 && rawData && (
          <div className="bg-white border border-red-200 rounded-3xl p-6 mb-8">
            <h3 className="font-bold text-red-600 mb-3">Raw API Response (for debugging)</h3>
            <pre className="text-xs bg-slate-900 text-slate-200 p-4 rounded-2xl overflow-auto max-h-96 font-mono">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </div>
        )}

        {!loading && scans.length === 0 && !rawData && (
          <div className="text-center py-12 text-slate-500">
            No scans yet.<br />Your first scan will appear here.
          </div>
        )}

        {scans.length > 0 && (
          <div className="space-y-3">
            {scans.map((scan) => {
              const scanData = scan.scan_data || scan;
              const date = new Date(scan.created_at || scan.createdAt || scanData.createdAt || Date.now());
              const status = scanData.status || 'CREATED';

              return (
                <div
                  key={scan.id}
                  onClick={() => setSelectedScan(scan)}
                  className="bg-white border border-slate-200 rounded-3xl p-6 flex items-center justify-between cursor-pointer hover:border-emerald-300 hover:shadow transition-all group"
                >
                  <div className="flex items-center gap-4">
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
import React, { useEffect, useState } from 'react';
import { getScanHistory } from '../services/api';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { HealthReport } from './HealthReport';

export const ScanHistory: React.FC = () => {
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScan, setSelectedScan] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadScans = async () => {
    try {
      const data = await getScanHistory();
      setScans(data || []);
    } catch (err) {
      console.error("Failed to load scan history", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadScans();
  }, []);

  // Auto-refresh processing scans every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const hasProcessing = scans.some(s => 
        s.scan_data?.status === "PROCESSING" || 
        s.scan_data?.status === "CREATED"
      );
      if (hasProcessing) loadScans();
    }, 15000);

    return () => clearInterval(interval);
  }, [scans]);

  const getStatusBadge = (status: string) => {
    const lower = (status || '').toUpperCase();
    if (lower === 'READY') {
      return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">✅ Completed</span>;
    }
    if (lower === 'PROCESSING' || lower === 'CREATED') {
      return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⏳ Processing</span>;
    }
    if (lower === 'FAILED') {
      return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">❌ Failed</span>;
    }
    return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">📌 {status}</span>;
  };

  if (selectedScan) {
    return <HealthReport results={selectedScan} onBack={() => setSelectedScan(null)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Your Scans</h1>
          <button
            onClick={() => { setRefreshing(true); loadScans(); }}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
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
              const date = new Date(scan.created_at || scan.createdAt || scanData.createdAt);
              const status = scanData.status || 'CREATED';

              return (
                <div
                  key={scan.id}
                  onClick={() => setSelectedScan(scan)}
                  className="bg-white border border-slate-200 rounded-3xl p-6 flex items-center justify-between cursor-pointer hover:border-emerald-300 hover:shadow transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-2xl">
                      📸
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Body Scan</p>
                      <p className="text-sm text-slate-500">
                        {date.toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })} at {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
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
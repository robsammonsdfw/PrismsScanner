import React, { useEffect, useState } from 'react';
import { getScanHistory } from '../services/api';
import { Calendar, ArrowRight, Loader2 } from 'lucide-react';
import { HealthReport } from './HealthReport';

export const ScanHistory: React.FC = () => {
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScan, setSelectedScan] = useState<any>(null);

  useEffect(() => {
    const loadScans = async () => {
      try {
        const data = await getScanHistory();
        setScans(data || []);
      } catch (err) {
        console.error("Failed to load scan history", err);
      } finally {
        setLoading(false);
      }
    };
    loadScans();
  }, []);

  if (selectedScan) {
    return <HealthReport results={selectedScan} onBack={() => setSelectedScan(null)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Your Scans</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : scans.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No scans yet. <br />Your first scan will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {scans.map((scan) => {
              const date = new Date(scan.created_at || scan.createdAt);
              return (
                <div
                  key={scan.id}
                  onClick={() => setSelectedScan(scan)}
                  className="bg-white border border-slate-200 rounded-3xl p-6 flex items-center justify-between cursor-pointer hover:border-emerald-300 hover:shadow transition-all"
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
                  <ArrowRight className="w-5 h-5 text-slate-400" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
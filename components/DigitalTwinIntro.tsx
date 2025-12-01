import React from 'react';
import { Scan, User } from 'lucide-react';

interface Props {
  onStartScan: () => void;
}

export const DigitalTwinIntro: React.FC<Props> = ({ onStartScan }) => {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden animate-in fade-in duration-700">
      {/* Background Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/20 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
        <div className="relative mb-12">
            <div className="w-64 h-80 rounded-3xl border border-slate-700 bg-slate-800/50 backdrop-blur-sm flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-emerald-500/20" />
                <User className="w-32 h-32 text-slate-600" strokeWidth={1} />
                
                {/* Scanning Effect */}
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,1)] animate-[scan_3s_ease-in-out_infinite]" />
            </div>
            
            <div className="absolute -bottom-6 -right-6 bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-xl flex items-center gap-3">
                <Scan className="w-6 h-6 text-emerald-400" />
                <div className="text-left">
                    <div className="text-xs text-slate-400">Estimated time</div>
                    <div className="font-bold text-sm">~60 seconds</div>
                </div>
            </div>
        </div>

        <h2 className="text-3xl font-bold mb-4">Create Your Digital Twin</h2>
        <p className="text-slate-400 mb-10 leading-relaxed">
            We'll capture thousands of data points to create a precision 3D model of your body for accurate health tracking.
        </p>

        <button 
            onClick={onStartScan}
            className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-bold rounded-xl text-lg shadow-lg shadow-emerald-500/20 transition-all transform hover:-translate-y-1"
        >
            Start 60-second Scan
        </button>
      </div>
      
      <style>{`
        @keyframes scan {
          0%, 100% { top: 0%; opacity: 0; }
          10%, 90% { opacity: 1; }
          50% { top: 100%; }
        }
      `}</style>
    </div>
  );
};
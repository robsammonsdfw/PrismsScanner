import React from 'react';
import { User, ScanLine } from 'lucide-react';

interface Props {
  onStartScan: () => void;
}

export const DigitalTwinIntro: React.FC<Props> = ({ onStartScan }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-8 pb-12 animate-in fade-in duration-700">
      
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md space-y-12">
        <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-white">Create Your<br/>Digital Twin</h1>
            <p className="text-slate-400">Precision 3D body tracking</p>
        </div>

        <div className="relative">
            {/* Simple Glowing Silhouette */}
            <div className="relative z-10 w-48 h-48 md:w-64 md:h-64 flex items-center justify-center">
                <User className="w-full h-full text-slate-800 fill-slate-900" strokeWidth={0.5} />
                <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full -z-10" />
            </div>
            
            {/* Scanning Line Animation */}
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)] animate-[scan_2.5s_ease-in-out_infinite]" />
        </div>
      </div>

      <div className="w-full max-w-md space-y-6">
        <button 
            onClick={onStartScan}
            className="w-full py-5 bg-white text-slate-950 font-bold text-xl rounded-full hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
        >
            <ScanLine className="w-6 h-6" />
            Start 60-second scan
        </button>
      </div>
      
      <style>{`
        @keyframes scan {
          0%, 100% { top: 0%; opacity: 0; }
          15%, 85% { opacity: 1; }
          50% { top: 100%; }
        }
      `}</style>
    </div>
  );
};
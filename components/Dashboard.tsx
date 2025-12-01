import React from 'react';
import { User, Activity, Flame, Scale, ChevronRight } from 'lucide-react';

interface Props {
  data: any;
  onViewReport: () => void;
}

export const Dashboard: React.FC<Props> = ({ data, onViewReport }) => {
  // Extract key metrics safely with fallbacks
  const bodyFat = data?.scan_data?.composition?.bodyFatPercentage?.toFixed(1) || "18.5";
  // Assuming weight is part of the composition data or root; fallback to "---"
  const weight = data?.scan_data?.composition?.weight || "---"; 
  const leanMass = data?.scan_data?.composition?.leanMass?.toFixed(1) || "---";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative font-sans">
        {/* Top Nav / Welcome */}
        <div className="absolute top-0 w-full p-6 z-20 flex justify-between items-start">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Welcome</h1>
                <p className="text-slate-500 text-sm">Here's your baseline.</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-500" />
            </div>
        </div>

        {/* Main Content - Digital Twin Centerpiece */}
        <div className="flex-1 flex flex-col items-center justify-center relative mt-10 mb-20">
             {/* 3D Placeholder */}
             <div className="relative h-[50vh] w-full max-w-md flex items-center justify-center">
                {/* Rotating Rings Effect behind avatar */}
                <div className="absolute w-64 h-64 border border-slate-200 rounded-full animate-[spin_10s_linear_infinite]" />
                <div className="absolute w-80 h-80 border border-slate-100 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                
                {/* Avatar Silhouette */}
                <div className="relative z-10 opacity-80 mix-blend-multiply">
                    <User className="w-64 h-64 text-slate-800" strokeWidth={0.5} />
                </div>
                
                {/* Floating Metric Bubbles */}
                <div className="absolute top-10 right-10 bg-white/80 backdrop-blur shadow-sm p-3 rounded-2xl border border-slate-100 animate-bounce delay-700">
                    <div className="text-xs text-slate-400 font-medium uppercase">Body Fat</div>
                    <div className="text-lg font-bold text-slate-900">{bodyFat}%</div>
                </div>

                 <div className="absolute bottom-20 left-10 bg-white/80 backdrop-blur shadow-sm p-3 rounded-2xl border border-slate-100 animate-bounce delay-1000">
                    <div className="text-xs text-slate-400 font-medium uppercase">Weight</div>
                    <div className="text-lg font-bold text-slate-900">{weight}</div>
                </div>
             </div>
        </div>

        {/* Bottom Sheet / Rings Dashboard */}
        <div className="bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] p-8 pb-10 z-20">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-slate-900">Key Metrics</h3>
                <button onClick={onViewReport} className="text-emerald-600 text-sm font-semibold flex items-center hover:text-emerald-700 transition-colors">
                    Full Report <ChevronRight className="w-4 h-4 ml-1" />
                </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <RingMetric 
                    label="Body Fat" 
                    value={bodyFat} 
                    unit="%" 
                    color="text-emerald-500" 
                    trackColor="stroke-emerald-500"
                    percentage={35} 
                    icon={Flame}
                />
                <RingMetric 
                    label="Weight" 
                    value={typeof weight === 'string' ? weight.replace(' lbs', '') : weight} 
                    unit="lbs" 
                    color="text-blue-500" 
                    trackColor="stroke-blue-500"
                    percentage={60}
                    icon={Scale} 
                />
                <RingMetric 
                    label="Lean Mass" 
                    value={leanMass} 
                    unit="lbs" 
                    color="text-purple-500" 
                    trackColor="stroke-purple-500"
                    percentage={75} 
                    icon={Activity}
                />
            </div>
        </div>
    </div>
  );
};

const RingMetric = ({ label, value, unit, color, trackColor, percentage, icon: Icon }: any) => {
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
                    <circle 
                        cx="40" cy="40" r={radius} 
                        stroke="currentColor" 
                        strokeWidth="6" 
                        fill="transparent" 
                        strokeDasharray={circumference} 
                        strokeDashoffset={offset} 
                        strokeLinecap="round"
                        className={trackColor}
                    />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center ${color}`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
            <div className="text-center">
                <div className="font-bold text-slate-900 text-lg leading-none">{value}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">{label}</div>
            </div>
        </div>
    );
};
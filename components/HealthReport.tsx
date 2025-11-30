import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  Share, 
  Box, 
  Download, 
  ArrowDown, 
  Activity, 
  User,
  Loader2
} from 'lucide-react';
import { getScanHistory } from '../services/api';

interface HealthReportProps {
  onBack: () => void;
  results?: any; 
}

export const HealthReport: React.FC<HealthReportProps> = ({ onBack, results }) => {
  const [activeTab, setActiveTab] = useState<'report' | '3d'>('report');
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Extract the actual scan data object. 
  // If results came from DB save, structure is { id, scan_data, created_at }.
  // If results came directly from Scanner (fallback), it might be the raw object.
  const currentScan = results?.scan_data || results || {};

  useEffect(() => {
    const fetchHistory = async () => {
        try {
            const data = await getScanHistory();
            // Filter out the current scan if it's already in the history list (by ID or timestamp proximity)
            const filteredHistory = data.filter((item: any) => item.id !== results?.id);
            setHistory(filteredHistory);
        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setIsLoadingHistory(false);
        }
    };
    fetchHistory();
  }, [results]);

  // --- MAPPING LOGIC ---
  // We map the raw Prism data to our UI structure. 
  // Note: Since we don't have the exact Prism SDK schema, we check for likely paths 
  // and fallback to placeholders to prevent crashes.

  const mapDataToReport = (data: any, previousData: any) => {
    // Helper to get nested value safely
    const getVal = (obj: any, path: string, fallback: any) => {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj) || fallback;
    };

    const demographics = {
        name: "User", // Prism usually doesn't return name unless configured
        date: new Date().toLocaleString(),
        age: getVal(data, 'demographics.age', 30),
        gender: getVal(data, 'demographics.gender', 'Not specified'),
        height: getVal(data, 'measurements.height', "5'7\""), // Placeholder logic
        weight: getVal(data, 'composition.weight', "N/A")
    };

    // Use raw measurements if available, else mocks
    const measurements = [
      { label: "Neck", value: getVal(data, 'measurements.neck', "--") },
      { label: "Chest", value: getVal(data, 'measurements.chest', "--") },
      { label: "Waist", value: getVal(data, 'measurements.waist', "--") },
      { label: "Hips", value: getVal(data, 'measurements.hips', "--") },
      { label: "Thighs", value: getVal(data, 'measurements.thighs', "--") },
      { label: "Calves", value: getVal(data, 'measurements.calves', "--") }
    ];

    const composition = {
      bodyFat: getVal(data, 'composition.bodyFatPercentage', 0).toFixed(1),
      fatMass: getVal(data, 'composition.fatMass', 0).toFixed(1),
      leanMass: getVal(data, 'composition.leanMass', 0).toFixed(1),
      waistToHeight: 0.5 // Calculate if height/waist available
    };

    // Calculate progress if previous data exists
    const prevComp = previousData?.scan_data?.composition || {};
    // Ensure these are numbers for type consistency with mock data
    const progress = {
        weightChange: demographics.weight !== "N/A" && prevComp.weight ? parseFloat((parseFloat(demographics.weight) - parseFloat(prevComp.weight)).toFixed(1)) : 0,
        fatChange: parseFloat((parseFloat(composition.bodyFat) - (parseFloat(prevComp.bodyFatPercentage) || parseFloat(composition.bodyFat))).toFixed(1)),
        leanChange: parseFloat((parseFloat(composition.leanMass) - (parseFloat(prevComp.leanMass) || parseFloat(composition.leanMass))).toFixed(1))
    };

    // If real data is missing (e.g. initial demo), return the mock structure for visual integrity
    if (!data || Object.keys(data).length === 0) {
        return {
            demographics: { name: "Ellie Sample", date: "Jul 14, 2025 at 3:49 PM", age: 42, gender: "Male", height: "5'3\"", weight: "210.1 lbs" },
            measurements: [
              { label: "Neck", value: "18.5\"" }, { label: "Chest", value: "47.2\"" }, { label: "Waist", value: "44.9\"" },
              { label: "Arms", value: "13.4\"" }, { label: "Thighs", value: "22.2\"" }, { label: "Calves", value: "15.7\"" }
            ],
            // Use strings for bodyFat, fatMass, leanMass to match the real data types (toFixed returns string)
            composition: { bodyFat: "31.2", fatMass: "65.5", leanMass: "144.4", waistToHeight: 0.58 }, 
            metabolism: { loss: 1995, maintain: 2245, gain: 2745, bmr: 1796 },
            posture: {
              head: { status: "Neutral", value: "0.2° tilt" },
              shoulders: { status: "Imbalance", value: "1.2° Right drop" },
              hips: { status: "Balanced", value: "Level" }
            },
            progress: { weightChange: -2.4, fatChange: -1.1, leanChange: 0.8 }
        };
    }

    return {
        demographics,
        measurements,
        composition,
        metabolism: { loss: 2000, maintain: 2500, gain: 3000, bmr: 1800 }, // These usually require calculation formulas
        posture: {
              head: { status: "Neutral", value: "0.0°" },
              shoulders: { status: "Balanced", value: "0.0°" },
              hips: { status: "Balanced", value: "Level" }
        },
        progress
    };
  };

  const reportData = mapDataToReport(currentScan, history[0]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-teal-500 text-slate-900 px-4 py-4 flex items-center justify-between shadow-md sticky top-0 z-30">
        <button 
          onClick={onBack}
          className="flex items-center gap-1 font-medium text-slate-900 hover:opacity-75 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6" />
          <span className="text-lg">Scan History</span>
        </button>
        
        <div className="font-bold text-xl tracking-tight">Health Report</div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setActiveTab(activeTab === '3d' ? 'report' : '3d')}
            className={`font-medium text-lg ${activeTab === '3d' ? 'underline decoration-2 underline-offset-4' : ''}`}
          >
            3D
          </button>
          <button className="p-1 hover:bg-black/5 rounded-full transition-colors">
            <Share className="w-6 h-6" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-10">
        {activeTab === '3d' ? (
          <div className="flex flex-col items-center justify-center h-96 mt-20 text-slate-400 gap-4">
            <Box className="w-24 h-24 stroke-1" />
            <p>3D Viewer Integration Placeholder</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full bg-white shadow-sm min-h-full p-6 space-y-10">
            
            {/* Title */}
            <h1 className="text-center text-2xl font-extrabold text-slate-900">
              Health Assessment Report
            </h1>

            {/* DEMOGRAPHICS */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                Demographics
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="Name" value={reportData.demographics.name} />
                <Row label="Date" value={reportData.demographics.date} />
                <Row label="Age" value={`${reportData.demographics.age} years`} />
                <Row label="Gender" value={reportData.demographics.gender} />
                <Row label="Height" value={reportData.demographics.height} />
                <Row label="Weight" value={reportData.demographics.weight} boldValue />
              </div>
            </section>

            {/* BODY MEASUREMENTS */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">
                Body Measurements
              </h3>
              <div className="space-y-3 text-sm">
                {reportData.measurements.map((m) => (
                  <Row key={m.label} label={m.label} value={m.value} boldValue />
                ))}
              </div>
            </section>

            {/* CURRENT WEIGHT & AVATAR PLACEHOLDER */}
            <section className="text-center py-6">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Current Weight
              </h4>
              <div className="text-3xl font-extrabold text-slate-900 mb-6">
                {reportData.demographics.weight}
              </div>
              
              <div className="aspect-[3/4] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl w-full max-w-xs mx-auto flex flex-col items-center justify-center text-slate-400 gap-3 mb-8">
                <User className="w-16 h-16 opacity-20" />
                <span className="text-sm font-medium">3D Avatar</span>
              </div>
            </section>

            {/* REPORT SUMMARY GRID */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                Report Summary
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Your body composition analysis is complete.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <SummaryCard label="Body Fat %" value={`${reportData.composition.bodyFat}%`} />
                <SummaryCard label="Fat Mass" value={`${reportData.composition.fatMass} lbs`} />
                <SummaryCard label="Lean Mass" value={`${reportData.composition.leanMass} lbs`} />
                <SummaryCard label="Waist-to-Height" value={reportData.composition.waistToHeight ? reportData.composition.waistToHeight.toString() : "--"} />
              </div>
            </section>

            {/* DETAILED METRICS WITH BARS */}
            <section className="space-y-8">
              {/* Body Fat Percentage */}
              <MetricDetail 
                title="Body Fat Percentage"
                description="The percentage of your body that is fat. One of the top predictors of long-term health, lifespan, metabolism, and athletic performance."
                value={parseFloat(reportData.composition.bodyFat)}
                unit="%"
                min={10}
                max={50}
                type="inverse" 
              />

              {/* Fat Mass */}
              <MetricDetail 
                title="Fat Mass"
                description="Decreasing fat mass is associated with improved health, lifespan, and athletic performance."
                value={parseFloat(reportData.composition.fatMass)}
                unit="lbs"
                min={20}
                max={100}
                type="inverse"
              />
            </section>

            {/* METABOLISM */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                Metabolism
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Metabolism is the amount of energy (Calories) your body needs daily.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetabolismCard 
                  title="Weight Loss" 
                  calories={reportData.metabolism.loss} 
                  subtitle="For fat loss" 
                />
                <MetabolismCard 
                  title="Maintain" 
                  calories={reportData.metabolism.maintain} 
                  subtitle="Current weight" 
                  bmr={reportData.metabolism.bmr}
                />
                <MetabolismCard 
                  title="Build Muscle" 
                  calories={reportData.metabolism.gain} 
                  subtitle="Muscle gain" 
                />
              </div>
            </section>

            {/* POSTURE ANALYSIS */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-bold text-slate-800">
                  Posture Analysis
                </h3>
              </div>
              <p className="text-sm text-slate-500 mb-6">
                Identify imbalances and areas of strain based on your 3D scan.
              </p>
              
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                  <span className="font-medium text-slate-700">Head Tilt</span>
                  <div className="text-right">
                    <span className="block font-bold text-emerald-600 text-sm">{reportData.posture.head.status}</span>
                    <span className="text-xs text-slate-400">{reportData.posture.head.value}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                  <span className="font-medium text-slate-700">Shoulder Level</span>
                  <div className="text-right">
                    <span className="block font-bold text-amber-500 text-sm">{reportData.posture.shoulders.status}</span>
                    <span className="text-xs text-slate-400">{reportData.posture.shoulders.value}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-slate-700">Hip Alignment</span>
                  <div className="text-right">
                    <span className="block font-bold text-emerald-600 text-sm">{reportData.posture.hips.status}</span>
                    <span className="text-xs text-slate-400">{reportData.posture.hips.value}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* PROGRESS VISUALIZATION */}
            <section>
               <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-bold text-slate-800">
                  Progress Visualization
                </h3>
              </div>
              {isLoadingHistory ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin"/> Loading previous history...
                  </div>
              ) : history.length > 0 ? (
                  <>
                      <p className="text-sm text-slate-500 mb-6">
                        Changes since your last scan.
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        <ProgressCard 
                          label="Weight" 
                          change={reportData.progress.weightChange} 
                          unit="lbs" 
                        />
                        <ProgressCard 
                          label="Body Fat" 
                          change={reportData.progress.fatChange} 
                          unit="%" 
                        />
                        <ProgressCard 
                          label="Lean Mass" 
                          change={reportData.progress.leanChange} 
                          unit="lbs" 
                          inverse 
                        />
                      </div>
                  </>
              ) : (
                  <p className="text-sm text-slate-400 italic">No previous history available for comparison.</p>
              )}
            </section>

            <button className="w-full mt-8 py-4 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors">
              <Download className="w-5 h-5" />
              Download Full PDF Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- SUBCOMPONENTS ---

const Row: React.FC<{ label: string; value: string; boldValue?: boolean }> = ({ label, value, boldValue }) => (
  <div className="flex justify-between items-center border-b border-slate-50 last:border-0 pb-1">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className={`text-slate-900 ${boldValue ? 'font-bold' : ''}`}>{value}</span>
  </div>
);

const SummaryCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between h-24">
    <span className="text-xs text-slate-500 font-medium">{label}</span>
    <span className="text-xl font-extrabold text-slate-900">{value}</span>
  </div>
);

const MetricDetail: React.FC<{ 
  title: string; 
  description: string; 
  value: number; 
  unit: string;
  min: number;
  max: number;
  type?: 'standard' | 'inverse';
}> = ({ title, description, value, unit, min, max, type = 'standard' }) => {
  const percentage = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);

  return (
    <div>
      <h4 className="font-bold text-slate-800 mb-1">{title}</h4>
      <p className="text-xs text-slate-500 leading-relaxed mb-4">{description}</p>
      
      <div className="relative h-4 rounded-full w-full bg-gradient-to-r from-emerald-400 via-yellow-400 to-red-500 mb-2">
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-slate-900 rounded-full border-2 border-white shadow-md transition-all duration-1000"
          style={{ left: `${percentage}%` }}
        />
      </div>
      
      <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 tracking-wider">
        <span>Low</span>
        <span>Healthy</span>
        <span>High</span>
      </div>
    </div>
  );
};

const MetabolismCard: React.FC<{ title: string; calories: number; subtitle: string; bmr?: number }> = ({ 
  title, 
  calories, 
  subtitle,
  bmr
}) => (
  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col items-center text-center">
    <h5 className="font-bold text-slate-800 text-sm mb-3">{title}</h5>
    <div className="text-2xl font-extrabold text-slate-900 mb-1">{calories}</div>
    <div className="text-xs text-slate-400 mb-1">calories/day</div>
    <div className="text-xs text-slate-500 font-medium">{subtitle}</div>
    {bmr && <div className="text-[10px] text-slate-400 mt-2">BMR: {bmr}</div>}
  </div>
);

const ProgressCard: React.FC<{ label: string; change: number; unit: string; inverse?: boolean }> = ({ 
  label, 
  change, 
  unit,
  inverse = false
}) => {
  const safeChange = isNaN(change) ? 0 : change;
  const isPositiveChange = safeChange > 0;
  const isGood = inverse ? isPositiveChange : !isPositiveChange;
  const colorClass = isGood ? 'text-emerald-600' : 'text-rose-500';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center">
      <span className="text-xs text-slate-500 mb-1">{label}</span>
      <div className={`text-lg font-bold flex items-center gap-1 ${colorClass}`}>
        {isPositiveChange ? <Activity className="w-4 h-4 rotate-180" /> : <ArrowDown className="w-4 h-4" />}
        {Math.abs(safeChange)} {unit}
      </div>
    </div>
  );
};
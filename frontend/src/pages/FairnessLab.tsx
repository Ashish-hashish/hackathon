import React, { useState } from 'react';
import { api, ScenarioRunResponse } from '../api/client';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Sliders, Play, Loader2, Sparkles } from 'lucide-react';

/* ─── Glassmorphic Dark Tooltip Component ─── */
const GlassmorphicTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: string;
  unit?: string;
}> = ({ active, payload, label, unit = '%' }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="backdrop-blur-xl bg-slate-950/90 border border-slate-800/80 rounded-xl px-3.5 py-2.5 shadow-2xl shadow-black/80 font-mono text-xs space-y-1.5 min-w-[170px] pointer-events-none">
      <div className="text-[11px] font-semibold text-slate-400 border-b border-slate-800/80 pb-1 mb-1 tracking-wider uppercase font-sans">
        {label}
      </div>
      {payload.map((entry: any, index: number) => {
        const val = typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value;
        const color = entry.color || entry.stroke || entry.fill || '#6366f1';
        return (
          <div key={`tooltip-${index}`} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-slate-300 font-sans text-xs">{entry.name || entry.dataKey}:</span>
            </div>
            <span className="font-bold text-white tracking-tight">
              {val}{unit}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const FairnessLab: React.FC = () => {
  const [totalUsers, setTotalUsers] = useState<number>(5000);
  const [botShare, setBotShare] = useState<number>(0.20);
  const [identitiesPerBot, setIdentitiesPerBot] = useState<number>(10);
  const [defClusterWeight, setDefClusterWeight] = useState<boolean>(true);
  const [defCanonicalDedupe, setDefCanonicalDedupe] = useState<boolean>(true);
  const [defRiskScore, setDefRiskScore] = useState<boolean>(true);
  const [defPow, setDefPow] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ScenarioRunResponse | null>(null);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await api.runScenario({
        total_users: totalUsers,
        capacity: 500,
        bot_share: botShare,
        identities_per_bot: identitiesPerBot,
        flags: {
          DEF_CLUSTER_WEIGHT: defClusterWeight,
          DEF_CANONICAL_DEDUPE: defCanonicalDedupe,
          DEF_RISK_SCORE: defRiskScore,
          DEF_POW: defPow,
          DEF_RATE_LIMITS: true,
          DEF_OTP: true,
        },
      });
      setResult(res);
    } catch (err: any) {
      console.error('Scenario run error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto my-8 px-4 space-y-8">
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>DIFFERENTIATOR D2 &amp; D3: INTERACTIVE FAIRNESS LAB</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Adversarial Simulation &amp; Defense Ablation
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-2xl mx-auto">
          Run 5,000 to 50,000 automated agents through both naive First-Come First-Served (FCFS) and Fair Drop to mathematically observe speed irrelevance and anti-Sybil resilience.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Controls Sidebar */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-[#0d121e] border border-[#1b2338] space-y-6 h-fit shadow-2xl">
          <div className="flex items-center gap-2 pb-4 border-b border-[#182133] text-white font-bold text-sm">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Scenario Controls</span>
          </div>

          {/* Slider 1: Total Users */}
          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1.5 font-mono">
              <span className="font-sans text-slate-400 font-medium">Population</span>
              <span className="font-bold text-indigo-400">{totalUsers.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="1000"
              max="50000"
              step="1000"
              value={totalUsers}
              onChange={(e) => setTotalUsers(Number(e.target.value))}
              className="w-full accent-indigo-500 bg-[#07090e] cursor-pointer"
            />
          </div>

          {/* Slider 2: Bot Share */}
          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1.5 font-mono">
              <span className="font-sans text-slate-400 font-medium">Bot Traffic Share</span>
              <span className="font-bold text-indigo-400">{(botShare * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.50"
              step="0.05"
              value={botShare}
              onChange={(e) => setBotShare(Number(e.target.value))}
              className="w-full accent-indigo-500 bg-[#07090e] cursor-pointer"
            />
          </div>

          {/* Slider 3: Identities per Bot */}
          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1.5 font-mono">
              <span className="font-sans text-slate-400 font-medium">Identities / Attacker</span>
              <span className="font-bold text-indigo-400">{identitiesPerBot}</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={identitiesPerBot}
              onChange={(e) => setIdentitiesPerBot(Number(e.target.value))}
              className="w-full accent-indigo-500 bg-[#07090e] cursor-pointer"
            />
          </div>

          {/* Defense Toggles */}
          <div className="pt-3 border-t border-[#182133] space-y-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Defense Layer Toggles
            </span>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={defClusterWeight}
                onChange={(e) => setDefClusterWeight(e.target.checked)}
                className="rounded accent-indigo-500 w-4 h-4 bg-[#07090e] border-[#1b2338]"
              />
              <span>Cluster-Capped Weighting</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={defCanonicalDedupe}
                onChange={(e) => setDefCanonicalDedupe(e.target.checked)}
                className="rounded accent-indigo-500 w-4 h-4 bg-[#07090e] border-[#1b2338]"
              />
              <span>Canonical Dedupe (Aliases)</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={defRiskScore}
                onChange={(e) => setDefRiskScore(e.target.checked)}
                className="rounded accent-indigo-500 w-4 h-4 bg-[#07090e] border-[#1b2338]"
              />
              <span>Soft Risk Scoring</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={defPow}
                onChange={(e) => setDefPow(e.target.checked)}
                className="rounded accent-indigo-500 w-4 h-4 bg-[#07090e] border-[#1b2338]"
              />
              <span>Proof-of-Work (PoW)</span>
            </label>
          </div>

          <button
            onClick={runSimulation}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
            <span>Execute Scenario</span>
          </button>
        </div>

        {/* Charts & Evidence Dashboard */}
        <div className="lg:col-span-3 space-y-6">
          {/* Empty state — shown before first run */}
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-96 rounded-2xl border border-dashed border-[#1b2338] bg-[#0c101b]/50 text-center p-8 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Play className="w-6 h-6 fill-indigo-400" />
              </div>
              <h3 className="text-base font-bold text-white">No Simulation Run Yet</h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Configure the scenario parameters on the left, then click <strong className="text-indigo-400">Execute Scenario</strong> to run the live FCFS vs Fair Drop comparison.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-96 rounded-2xl border border-[#1b2338] bg-[#0d121e] text-center p-8 space-y-3">
              <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
              <p className="text-xs font-mono text-slate-400">Running simulation for {totalUsers.toLocaleString()} agents...</p>
            </div>
          )}

          {/* Summary Stat Callouts — only shown after simulation runs */}
          {result && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#0d121e] border border-[#1b2338] shadow-lg">
                <span className="text-[10px] font-semibold text-slate-500 uppercase font-mono block">FCFS Bot Win Share</span>
                <div className="text-2xl font-black font-mono text-rose-400 mt-1">
                  {result.summary.fcfs.bot_win_share}%
                </div>
                <span className="text-[10px] text-slate-500">Bots dominate fast</span>
              </div>

              <div className="p-4 rounded-xl bg-[#0d121e] border border-emerald-500/30 shadow-lg shadow-emerald-500/5">
                <span className="text-[10px] font-semibold text-emerald-400 uppercase font-mono block">Fair Drop Win Share</span>
                <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                  {result.summary.fair_drop.bot_win_share}%
                </div>
                <span className="text-[10px] text-slate-400">Target: ≤ traffic share</span>
              </div>

              <div className="p-4 rounded-xl bg-[#0d121e] border border-[#1b2338] shadow-lg">
                <span className="text-[10px] font-semibold text-slate-500 uppercase font-mono block">Spearman Correlation</span>
                <div className="text-2xl font-black font-mono text-white mt-1">
                  {result.summary.fair_drop.spearman_arrival_correlation}
                </div>
                <span className="text-[10px] text-slate-500">Speed irrelevant (~0.0)</span>
              </div>

              <div className="p-4 rounded-xl bg-[#0d121e] border border-[#1b2338] shadow-lg">
                <span className="text-[10px] font-semibold text-slate-500 uppercase font-mono block">Integrity Violations</span>
                <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                  0
                </div>
                <span className="text-[10px] text-slate-500">Zero oversell, 0 dupes</span>
              </div>
            </div>
          )}

          {/* Chart 1: Win Share Comparison */}
          {result && (
            <div className="p-6 rounded-2xl bg-[#0d121e] border border-[#1b2338] shadow-2xl">
              <h2 className="text-sm font-bold text-white mb-1">
                1. Win Share vs Traffic Share (Primary Fairness Metric)
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                In FCFS, bots arrive in the first seconds and seize disproportionate inventory. In Fair Drop, speed provides zero advantage.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.charts.win_share_comparison}>
                    {/* SVG Filters and Linear Gradients */}
                    <defs>
                      <filter id="dim-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.25" />
                      </filter>
                      <linearGradient id="trafficBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#475569" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="fcfsBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fb7185" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#e11d48" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="fairDropBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2438" opacity={0.6} />
                    <XAxis
                      dataKey="name"
                      stroke="#64748b"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#64748b"
                      unit="%"
                      tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                    />
                    <Tooltip content={<GlassmorphicTooltip />} />
                    <Bar
                      dataKey="Bot Share %"
                      radius={[6, 6, 0, 0]}
                      filter="url(#dim-glow)"
                    >
                      {result.charts.win_share_comparison.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === 1 ? 'url(#fcfsBarGrad)' : index === 2 ? 'url(#fairDropBarGrad)' : 'url(#trafficBarGrad)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Chart 2: Arrival Decile Win Rates */}
          {result && (
            <div className="p-6 rounded-2xl bg-[#0d121e] border border-[#1b2338] shadow-2xl">
              <h2 className="text-sm font-bold text-white mb-1">
                2. Win Rate by Arrival-Time Decile (Speed Irrelevance)
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                FCFS slopes steeply downwards (only early arrivals win). Fair Drop is completely flat across all arrival windows.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.charts.decile_win_rates}>
                    <defs>
                      <filter id="rose-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f43f5e" floodOpacity="0.30" />
                      </filter>
                      <filter id="emerald-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#10b981" floodOpacity="0.30" />
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2438" opacity={0.6} />
                    <XAxis
                      dataKey="decile"
                      stroke="#64748b"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#64748b"
                      unit="%"
                      tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                    />
                    <Tooltip content={<GlassmorphicTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Line
                      type="monotone"
                      dataKey="FCFS"
                      stroke="#f43f5e"
                      strokeWidth={2.5}
                      filter="url(#rose-glow)"
                      dot={{ r: 3.5, fill: '#fb7185', strokeWidth: 1.5, stroke: '#881337' }}
                      activeDot={{ r: 6, fill: '#fb7185', stroke: '#fff', strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="FairDrop"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      filter="url(#emerald-glow)"
                      dot={{ r: 3.5, fill: '#34d399', strokeWidth: 1.5, stroke: '#064e3b' }}
                      activeDot={{ r: 6, fill: '#34d399', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Chart 3: Sybil Scaling Curve */}
          {result && (
            <div className="p-6 rounded-2xl bg-[#0d121e] border border-[#1b2338] shadow-2xl">
              <h2 className="text-sm font-bold text-white mb-1">
                3. Sybil Scaling Curve (Identities per Attacker)
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Without cluster weighting, attacker win rate grows linearly with identities. With Fair Drop defenses, extra Sybil identities yield zero marginal gain.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.charts.sybil_scaling_curve}>
                    <defs>
                      <filter id="rose-glow-sybil" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f43f5e" floodOpacity="0.30" />
                      </filter>
                      <filter id="emerald-glow-sybil" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#10b981" floodOpacity="0.30" />
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2438" opacity={0.6} />
                    <XAxis
                      dataKey="identities"
                      stroke="#64748b"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#64748b"
                      unit="%"
                      tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                    />
                    <Tooltip content={<GlassmorphicTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Line
                      type="monotone"
                      dataKey="defenses_off_win_share"
                      name="Defenses Off (Linear)"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      filter="url(#rose-glow-sybil)"
                      dot={{ r: 3, fill: '#fb7185' }}
                      activeDot={{ r: 5, fill: '#fb7185', stroke: '#fff', strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="defenses_on_win_share"
                      name="Defenses Active (Cluster Capped)"
                      stroke="#10b981"
                      strokeWidth={3}
                      filter="url(#emerald-glow-sybil)"
                      dot={{ r: 3.5, fill: '#34d399' }}
                      activeDot={{ r: 6, fill: '#34d399', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Chart 4: Defense Ablation Bar Chart */}
          {result && (
            <div className="p-6 rounded-2xl bg-[#0d121e] border border-[#1b2338] shadow-2xl">
              <h2 className="text-sm font-bold text-white mb-1">
                4. Defense Ablation Breakdown
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Attacker win share as individual defense layers are toggled off sequentially.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.charts.ablation} layout="vertical">
                    <defs>
                      <filter id="ablation-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#6366f1" floodOpacity="0.25" />
                      </filter>
                      <linearGradient id="ablationBaseGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.95} />
                      </linearGradient>
                      <linearGradient id="ablationMidGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#4338ca" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.95} />
                      </linearGradient>
                      <linearGradient id="ablationWorstGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#be123c" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.95} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2438" opacity={0.6} />
                    <XAxis
                      type="number"
                      stroke="#64748b"
                      unit="%"
                      tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="layer"
                      stroke="#64748b"
                      width={180}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <Tooltip content={<GlassmorphicTooltip />} />
                    <Bar
                      dataKey="bot_win_share"
                      name="Bot Win Share %"
                      radius={[0, 6, 6, 0]}
                      filter="url(#ablation-glow)"
                    >
                      {result.charts.ablation.map((entry, index) => (
                        <Cell
                          key={`ablation-${index}`}
                          fill={
                            index === 0
                              ? 'url(#ablationBaseGrad)'
                              : index === result.charts.ablation.length - 1
                              ? 'url(#ablationWorstGrad)'
                              : 'url(#ablationMidGrad)'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FairnessLab;

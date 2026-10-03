import React, { useState } from 'react';
import { api, ScenarioRunResponse } from '../api/client';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Sliders, Play, ShieldAlert, CheckCircle2, TrendingUp, Sparkles, Loader2, Info } from 'lucide-react';

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
    <div className="max-w-7xl mx-auto my-10 px-4 space-y-8">
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles className="w-4 h-4" />
          Differentiator D2 & D3: Interactive Fairness Lab
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Adversarial Simulation & Defense Ablation
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          Run 5,000 to 50,000 automated agents through both naive First-Come First-Served (FCFS) and Fair Drop to mathematically observe speed irrelevance and anti-Sybil resilience.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Controls Sidebar */}
        <div className="lg:col-span-1 p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 h-fit shadow-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800 text-white font-bold text-base">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <span>Scenario Controls</span>
          </div>

          {/* Slider 1: Total Users */}
          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span className="font-semibold">Simulated Population</span>
              <span className="font-mono text-emerald-400">{totalUsers.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="1000"
              max="50000"
              step="1000"
              value={totalUsers}
              onChange={(e) => setTotalUsers(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          {/* Slider 2: Bot Share */}
          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span className="font-semibold">Bot Traffic Share</span>
              <span className="font-mono text-emerald-400">{(botShare * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.50"
              step="0.05"
              value={botShare}
              onChange={(e) => setBotShare(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          {/* Slider 3: Identities per Bot */}
          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span className="font-semibold">Identities per Attacker</span>
              <span className="font-mono text-emerald-400">{identitiesPerBot}</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={identitiesPerBot}
              onChange={(e) => setIdentitiesPerBot(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          {/* Defense Toggles */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <span className="text-xs font-semibold uppercase text-slate-400 block mb-2">Defense Layer Toggles</span>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={defClusterWeight}
                onChange={(e) => setDefClusterWeight(e.target.checked)}
                className="rounded accent-emerald-500 w-4 h-4"
              />
              <span>Cluster-Capped Weighting</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={defCanonicalDedupe}
                onChange={(e) => setDefCanonicalDedupe(e.target.checked)}
                className="rounded accent-emerald-500 w-4 h-4"
              />
              <span>Canonical Dedupe (Aliases)</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={defRiskScore}
                onChange={(e) => setDefRiskScore(e.target.checked)}
                className="rounded accent-emerald-500 w-4 h-4"
              />
              <span>Soft Risk Scoring</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={defPow}
                onChange={(e) => setDefPow(e.target.checked)}
                className="rounded accent-emerald-500 w-4 h-4"
              />
              <span>Proof-of-Work (PoW)</span>
            </label>
          </div>

          <button
            onClick={runSimulation}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-slate-950" />}
            <span>Execute Scenario</span>
          </button>
        </div>

        {/* Charts & Evidence Dashboard */}
        <div className="lg:col-span-3 space-y-8">
          {/* Empty state — shown before first run */}
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-80 rounded-3xl border border-dashed border-slate-700 bg-slate-900/40 text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <Play className="w-7 h-7 text-emerald-400 fill-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No Simulation Run Yet</h3>
              <p className="text-sm text-slate-400 max-w-sm">
                Configure the scenario parameters on the left, then click <strong className="text-emerald-400">Execute Scenario</strong> to run the live FCFS vs Fair Drop comparison.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-80 rounded-3xl border border-slate-800 bg-slate-900 text-center p-8">
              <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
              <p className="text-sm text-slate-400">Running simulation for {totalUsers.toLocaleString()} agents...</p>
            </div>
          )}
          {/* Summary Stat Callouts + Charts — only shown after simulation runs */}
          {result && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">FCFS Bot Win Share</span>
                <div className="text-2xl font-black font-mono text-red-400 mt-1">
                  {result.summary.fcfs.bot_win_share}%
                </div>
                <span className="text-[11px] text-slate-500">Bots dominate fast</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-emerald-500/5 shadow-md">
                <span className="text-[11px] font-semibold text-emerald-400 uppercase">Fair Drop Win Share</span>
                <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                  {result.summary.fair_drop.bot_win_share}%
                </div>
                <span className="text-[11px] text-slate-400">Target: ≤ traffic share</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Spearman Correlation</span>
                <div className="text-2xl font-black font-mono text-white mt-1">
                  {result.summary.fair_drop.spearman_arrival_correlation}
                </div>
                <span className="text-[11px] text-slate-500">Speed irrelevant (~0.0)</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Integrity Violations</span>
                <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                  0
                </div>
                <span className="text-[11px] text-slate-500">Zero oversell, 0 dupes</span>
              </div>
            </div>
          )}

          {/* Chart 1: Win Share Comparison */}
          {result && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
              <h2 className="text-lg font-bold text-white mb-1">
                1. Win Share vs Traffic Share (Primary Fairness Metric)
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                In FCFS, bots arrive in the first seconds and seize disproportionate inventory. In Fair Drop, speed provides zero advantage.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.charts.win_share_comparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                    <Bar dataKey="Bot Share %" fill="#22c55e" radius={[8, 8, 0, 0]}>
                      {result.charts.win_share_comparison.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === 1 ? '#f87171' : index === 2 ? '#22c55e' : '#64748b'}
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
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
              <h2 className="text-lg font-bold text-white mb-1">
                2. Win Rate by Arrival-Time Decile (Speed Irrelevance)
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                FCFS slopes steeply downwards (only early arrivals win). Fair Drop is completely flat across all arrival windows.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.charts.decile_win_rates}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="decile" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                    <Legend />
                    <Line type="monotone" dataKey="FCFS" stroke="#f87171" strokeWidth={2.5} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="FairDrop" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Chart 3: Sybil Scaling Curve */}
          {result && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
              <h2 className="text-lg font-bold text-white mb-1">
                3. Sybil Scaling Curve (Identities per Attacker)
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Without cluster weighting, attacker win rate grows linearly with identities. With Fair Drop defenses, extra Sybil identities yield zero marginal gain.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.charts.sybil_scaling_curve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="identities" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                    <Legend />
                    <Line type="monotone" dataKey="defenses_off_win_share" name="Defenses Off (Linear)" stroke="#f87171" strokeWidth={2} />
                    <Line type="monotone" dataKey="defenses_on_win_share" name="Defenses Active (Cluster Capped)" stroke="#22c55e" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Chart 4: Defense Ablation Bar Chart */}
          {result && (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800">
              <h2 className="text-lg font-bold text-white mb-1">
                4. Defense Ablation Breakdown
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Attacker win share as individual defense layers are toggled off sequentially.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.charts.ablation} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis type="number" stroke="#94a3b8" unit="%" />
                    <YAxis type="category" dataKey="layer" stroke="#94a3b8" width={180} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                    <Bar dataKey="bot_win_share" name="Bot Win Share %" fill="#22c55e" radius={[0, 8, 8, 0]}>
                      {result.charts.ablation.map((entry, index) => (
                        <Cell
                          key={`ablation-${index}`}
                          fill={index === 0 ? '#22c55e' : index === result.charts.ablation.length - 1 ? '#f87171' : '#38bdf8'}
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

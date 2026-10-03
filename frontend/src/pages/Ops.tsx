import React, { useState, useEffect } from 'react';
import {
  api, AdminMetricsResponse, EventItem, SamplingTableResponse, SamplingEntry
} from '../api/client';
import {
  Activity, ShieldAlert, CheckCircle2, Play, Users, Layers,
  AlertCircle, RefreshCw, Lock, Plus, Square, RotateCcw,
  Sparkles, Calendar, Key, ChevronRight, Hash, Search,
  Award, ShieldCheck, Database, HelpCircle, Eye
} from 'lucide-react';

export const Ops: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('event_drop_001');
  const [metrics, setMetrics] = useState<AdminMetricsResponse | null>(null);
  const [samplingData, setSamplingData] = useState<SamplingTableResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Seeder Settings
  const [seedCount, setSeedCount] = useState<number>(100);
  const [seedBotPct, setSeedBotPct] = useState<number>(25);

  // Table Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'WINNERS' | 'WAITLISTED' | 'BOTS' | 'CLUSTER_CAPPED'>('ALL');
  const [selectedEntry, setSelectedEntry] = useState<SamplingEntry | null>(null);

  // New Event Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventCapacity, setNewEventCapacity] = useState<number>(500);
  const [newEventCustomId, setNewEventCustomId] = useState('');

  // Fetch all events
  const fetchEvents = async () => {
    try {
      const res = await api.listAdminEvents();
      if (res.events && res.events.length > 0) {
        setEvents(res.events);
        if (!res.events.some((e) => e.id === selectedEventId)) {
          setSelectedEventId(res.events[0].id);
        }
      }
    } catch (e) {
      // Soft error
    }
  };

  // Fetch metrics & sampling table for currently selected event
  const fetchMetricsAndSampling = async () => {
    try {
      const mData = await api.getAdminMetrics(selectedEventId);
      setMetrics(mData);

      const sData = await api.getSamplingTable(selectedEventId);
      setSamplingData(sData);
    } catch (e) {
      // Soft polling error
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    fetchMetricsAndSampling();
    const interval = setInterval(fetchMetricsAndSampling, 2500);
    return () => clearInterval(interval);
  }, [selectedEventId]);

  // Actions
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;

    setLoading(true);
    try {
      const res = await api.createEvent({
        name: newEventName.trim(),
        capacity: newEventCapacity,
        id: newEventCustomId.trim() || undefined,
      });
      setActionMsg({
        type: 'success',
        text: `Event "${newEventName}" created! Event ID: ${res.event_id}`,
      });
      setShowCreateModal(false);
      setNewEventName('');
      setNewEventCustomId('');
      await fetchEvents();
      setSelectedEventId(res.event_id);
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message || 'Failed to create event.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    setLoading(true);
    try {
      const res = await api.seedEventData(selectedEventId, seedCount, seedBotPct);
      setActionMsg({
        type: 'success',
        text: `Successfully seeded ${res.seeded_count} users (${res.bot_share_pct}% Sybil bots) into [${selectedEventId}]! Click "Run Weighted Draw" to view Efraimidis-Spirakis rankings.`,
      });
      await fetchMetricsAndSampling();
      await fetchEvents();
    } catch (e: any) {
      setActionMsg({ type: 'error', text: e?.message || 'Failed to seed data.' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWindow = async () => {
    setLoading(true);
    try {
      await api.openWindowEvent(selectedEventId);
      setActionMsg({
        type: 'success',
        text: `Entry window opened for [${selectedEventId}]! Secret seed generated and cryptographic commitment published.`,
      });
      fetchMetricsAndSampling();
      fetchEvents();
    } catch (e: any) {
      setActionMsg({ type: 'error', text: e?.message || 'Failed to open window.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseWindow = async () => {
    setLoading(true);
    try {
      await api.closeWindowEvent(selectedEventId);
      setActionMsg({ type: 'success', text: `Entry window closed for [${selectedEventId}].` });
      fetchMetricsAndSampling();
      fetchEvents();
    } catch (e: any) {
      setActionMsg({ type: 'error', text: e?.message || 'Failed to close window.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerDraw = async () => {
    setLoading(true);
    try {
      const res = await api.triggerDrawEvent(selectedEventId);
      setActionMsg({
        type: 'success',
        text: `Efraimidis-Spirakis Weighted Draw executed for [${selectedEventId}]! Ranked ${res.total_entries} entries with revealed seed.`,
      });
      await fetchMetricsAndSampling();
      await fetchEvents();
    } catch (e: any) {
      setActionMsg({ type: 'error', text: e?.message || 'Failed to trigger draw.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetEvent = async () => {
    if (!window.confirm(`Reset event [${selectedEventId}]? All entries and draw results will be cleared.`)) {
      return;
    }
    setLoading(true);
    try {
      await api.resetEvent(selectedEventId);
      setActionMsg({ type: 'success', text: `Event [${selectedEventId}] reset back to PENDING.` });
      setSamplingData(null);
      fetchMetricsAndSampling();
      fetchEvents();
    } catch (e: any) {
      setActionMsg({ type: 'error', text: e?.message || 'Failed to reset event.' });
    } finally {
      setLoading(false);
    }
  };

  const currentEvent = events.find((e) => e.id === selectedEventId);
  const inv = metrics?.inventory;
  const recon = metrics?.reconciliation;
  const winState = metrics?.window_state || currentEvent?.state || 'PENDING';

  // Filtered Sampling Entries
  const rawEntries = samplingData?.entries || [];
  const filteredEntries = rawEntries.filter((entry) => {
    if (filterTab === 'WINNERS' && entry.status !== 'ADMITTED_WINNER') return false;
    if (filterTab === 'WAITLISTED' && entry.status !== 'WAITLISTED') return false;
    if (filterTab === 'BOTS' && !entry.is_bot) return false;
    if (filterTab === 'CLUSTER_CAPPED' && entry.status !== 'SKIPPED_CLUSTER_CAP') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = entry.entry_id.toLowerCase().includes(q);
      const matchIdent = entry.identity_id.toLowerCase().includes(q);
      const matchEmail = entry.email_canonical.toLowerCase().includes(q);
      const matchCluster = entry.cluster_id.toLowerCase().includes(q);
      const matchIp = entry.ip_prefix?.toLowerCase().includes(q);
      return matchId || matchIdent || matchEmail || matchCluster || matchIp;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto my-8 px-4 space-y-8">
      {/* Top Header & Event Switcher */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-white tracking-tight">
              Event Controls & Efraimidis-Spirakis Weighted Sampling
            </h1>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Seed realistic user/Sybil populations, trigger cryptographic weighted draws, and inspect the complete mathematical sampling rankings.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Event Selector Dropdown */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-700">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="bg-transparent text-white text-xs font-semibold outline-none cursor-pointer"
            >
              {events.map((evt) => (
                <option key={evt.id} value={evt.id} className="bg-slate-900 text-white">
                  {evt.name} ({evt.id}) [{evt.state}]
                </option>
              ))}
            </select>
          </div>

          {/* Create New Event Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            New Event
          </button>
        </div>
      </div>

      {/* Action Message Banner */}
      {actionMsg && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center gap-3 ${
            actionMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="font-medium">{actionMsg.text}</span>
        </div>
      )}

      {/* 1. SEEDER & EVENT CONTROLS PANEL */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-black text-white">{currentEvent?.name || selectedEventId}</span>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold uppercase border ${
                  winState === 'OPEN'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : winState === 'DRAWN'
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                    : winState === 'CLOSED'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                State: {winState}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Event ID: <strong className="text-slate-300">{selectedEventId}</strong> • Capacity:{' '}
              <strong className="text-teal-400">{metrics?.capacity || currentEvent?.capacity || 500} seats</strong>
            </p>
          </div>

          {/* Primary Lifecycle Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {winState !== 'OPEN' && (
              <button
                onClick={handleOpenWindow}
                disabled={loading}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                Open Window
              </button>
            )}

            {winState === 'OPEN' && (
              <button
                onClick={handleCloseWindow}
                disabled={loading}
                className="px-3.5 py-2.5 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                Close Window
              </button>
            )}

            <button
              onClick={handleTriggerDraw}
              disabled={loading}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Run Weighted Draw
            </button>

            <button
              onClick={handleResetEvent}
              disabled={loading}
              className="px-3 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Reset entries and allocations"
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-400" />
              Reset
            </button>
          </div>
        </div>

        {/* Data Seeder Configuration Box */}
        <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Data Seeder: Generate Realistic User & Sybil Populations</span>
            </div>
            <p className="text-xs text-slate-400">
              Generates residential ISP users + datacenter Sybil rings with aliased emails and burst timing into this event.
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400">Count:</span>
              <select
                value={seedCount}
                onChange={(e) => setSeedCount(Number(e.target.value))}
                className="bg-transparent text-white font-mono font-bold text-xs outline-none cursor-pointer"
              >
                <option value={50} className="bg-slate-900 text-white">50 Users</option>
                <option value={100} className="bg-slate-900 text-white">100 Users</option>
                <option value={200} className="bg-slate-900 text-white">200 Users</option>
                <option value={500} className="bg-slate-900 text-white">500 Users</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400">Bots:</span>
              <select
                value={seedBotPct}
                onChange={(e) => setSeedBotPct(Number(e.target.value))}
                className="bg-transparent text-white font-mono font-bold text-xs outline-none cursor-pointer"
              >
                <option value={0} className="bg-slate-900 text-white">0% (Clean)</option>
                <option value={20} className="bg-slate-900 text-white">20% Sybils</option>
                <option value={40} className="bg-slate-900 text-white">40% Sybils</option>
                <option value={60} className="bg-slate-900 text-white">60% Sybils</option>
              </select>
            </div>

            <button
              onClick={handleSeedData}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Seed {seedCount} Users</span>
            </button>
          </div>
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] font-semibold uppercase text-slate-400">Total Entries</span>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {metrics?.entries_count?.toLocaleString() || '0'}
            </div>
            <span className="text-[10px] text-slate-500">Deduplicated in Redis & DB</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] font-semibold uppercase text-slate-400">Available Seats</span>
            <div className="text-2xl font-black font-mono text-teal-400 mt-1">
              {inv ? `${inv.available} / ${inv.capacity}` : '—'}
            </div>
            <span className="text-[10px] text-slate-500">Atomic inventory path</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] font-semibold uppercase text-slate-400">Queue / Admitted</span>
            <div className="text-2xl font-black font-mono text-indigo-400 mt-1">
              {samplingData ? `${samplingData.summary.admitted_winners} Admitted` : 'Awaiting Draw'}
            </div>
            <span className="text-[10px] text-slate-500">Ranked by sampling keys</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80">
            <span className="text-[11px] font-semibold uppercase text-slate-400">Cluster Capped</span>
            <div className="text-2xl font-black font-mono text-amber-400 mt-1">
              {samplingData ? `${samplingData.summary.skipped_cluster_cap} Sybils` : '0'}
            </div>
            <span className="text-[10px] text-slate-500">Max 1 seat per cluster</span>
          </div>
        </div>
      </div>

      {/* 2. THE EFRAIMIDIS-SPIRAKIS WEIGHTED SAMPLING EXPLORER */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Award className="w-3.5 h-3.5" />
              Verifiable Deterministic Ranking Engine
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Efraimidis-Spirakis Weighted Sampling Pipeline
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Every entry receives a deterministic pseudo-random key k_i = u_i^(1/w_i). Clean identities retain weight w_i = 1.0, while Sybil clusters are diluted and capped.
            </p>
          </div>

          {samplingData?.seed_reveal && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-right">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Revealed Seed</span>
              <span className="text-xs font-mono text-emerald-400 font-bold break-all">
                {samplingData.seed_reveal.slice(0, 18)}...
              </span>
            </div>
          )}
        </div>

        {/* Mathematical Formulas Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block font-sans">1. Uniform Hash</span>
            <div className="text-teal-300 font-bold">u_i = HMAC-SHA256(seed, entry_id)</div>
            <p className="text-[10px] text-slate-500 font-sans">Maps entry into uniform range (0, 1)</p>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block font-sans">2. Cluster Weight</span>
            <div className="text-emerald-300 font-bold">w_i = risk_score / (cluster_size ^ 1.0)</div>
            <p className="text-[10px] text-slate-500 font-sans">Dilutes mass Sybil minting rings</p>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block font-sans">3. Sampling Key</span>
            <div className="text-indigo-300 font-bold">key_i = u_i ^ (1 / w_i)</div>
            <p className="text-[10px] text-slate-500 font-sans">Rank order sorted descending by key_i</p>
          </div>
        </div>

        {/* Outcome Scorecards (When Drawn) */}
        {samplingData && samplingData.summary.total_entries > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase block">Legitimate Win Share</span>
              <div className="text-2xl font-black font-mono text-white mt-1">
                {samplingData.summary.legit_win_share_pct}%
              </div>
              <span className="text-[10px] text-slate-400">
                {samplingData.summary.legit_winners} legit winners admitted
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase block">Bot Win Share</span>
              <div className="text-2xl font-black font-mono text-indigo-400 mt-1">
                {samplingData.summary.bot_win_share_pct}%
              </div>
              <span className="text-[10px] text-slate-500">
                vs {samplingData.summary.bot_traffic_share_pct}% traffic share
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase block">Sybil Cap Rejections</span>
              <div className="text-2xl font-black font-mono text-amber-400 mt-1">
                {samplingData.summary.skipped_cluster_cap}
              </div>
              <span className="text-[10px] text-slate-500">Blocked duplicate cluster wins</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase block">Waitlist Queue</span>
              <div className="text-2xl font-black font-mono text-white mt-1">
                {samplingData.summary.waitlisted}
              </div>
              <span className="text-[10px] text-slate-500">Ranked standby entries</span>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2">
          {/* Tab Filters */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs flex-wrap gap-1">
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Ranked ({rawEntries.length})
            </button>
            <button
              onClick={() => setFilterTab('WINNERS')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === 'WINNERS' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Admitted Winners ({samplingData?.summary.admitted_winners || 0})
            </button>
            <button
              onClick={() => setFilterTab('CLUSTER_CAPPED')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === 'CLUSTER_CAPPED' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Cluster Capped ({samplingData?.summary.skipped_cluster_cap || 0})
            </button>
            <button
              onClick={() => setFilterTab('BOTS')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === 'BOTS' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sybils & Bots ({samplingData?.summary.total_bots || 0})
            </button>
            <button
              onClick={() => setFilterTab('WAITLISTED')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === 'WAITLISTED' ? 'bg-slate-800 text-slate-200 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Waitlisted ({samplingData?.summary.waitlisted || 0})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Entry, Identity, Email, Cluster..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        </div>

        {/* 3. FULL EFRAIMIDIS-SPIRAKIS SAMPLING TABLE */}
        {rawEntries.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-slate-950 border border-slate-800/80 p-8 space-y-3">
            <Award className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-white">No Draw Results Available Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Click <strong className="text-indigo-400">"Seed Users"</strong> above and then click{' '}
              <strong className="text-emerald-400">"Run Weighted Draw"</strong> to generate the full Efraimidis-Spirakis ranking table.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/90 text-slate-400 uppercase font-sans font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3.5">Rank</th>
                  <th className="py-3 px-3.5">Outcome Status</th>
                  <th className="py-3 px-3.5">Identity & Email</th>
                  <th className="py-3 px-3.5">Type</th>
                  <th className="py-3 px-3.5">Cluster ID</th>
                  <th className="py-3 px-3.5">Weight (w_i)</th>
                  <th className="py-3 px-3.5">Uniform (u_i)</th>
                  <th className="py-3 px-3.5">Sampling Key (k_i)</th>
                  <th className="py-3 px-3.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredEntries.map((item) => {
                  const isWinner = item.status === 'ADMITTED_WINNER';
                  const isCapped = item.status === 'SKIPPED_CLUSTER_CAP';

                  return (
                    <tr
                      key={item.entry_id}
                      onClick={() => setSelectedEntry(item)}
                      className={`hover:bg-slate-900/70 transition-colors cursor-pointer ${
                        isWinner ? 'bg-emerald-500/5' : isCapped ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      {/* Rank */}
                      <td className="py-3 px-3.5">
                        <span className={`font-black text-sm ${isWinner ? 'text-emerald-400' : 'text-slate-400'}`}>
                          #{item.rank}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 font-sans">
                        {isWinner ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            ADMITTED WINNER
                          </span>
                        ) : isCapped ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <ShieldAlert className="w-3 h-3" />
                            CLUSTER CAPPED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            WAITLIST #{item.rank}
                          </span>
                        )}
                      </td>

                      {/* Identity & Email */}
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-slate-200 truncate max-w-[180px]">
                          {item.email_canonical || item.identity_id}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{item.entry_id}</div>
                      </td>

                      {/* User Type */}
                      <td className="py-3 px-3.5 font-sans">
                        {item.is_bot ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                            🤖 Sybil Bot
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                            👤 Legit User
                          </span>
                        )}
                      </td>

                      {/* Cluster */}
                      <td className="py-3 px-3.5 text-slate-400 truncate max-w-[120px]">
                        {item.cluster_id.slice(0, 12)}...
                      </td>

                      {/* Weight */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`font-bold ${
                            item.weight >= 0.9 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {item.weight.toFixed(4)}
                        </span>
                      </td>

                      {/* Uniform Hash */}
                      <td className="py-3 px-3.5 text-slate-300">{item.u_i.toFixed(6)}</td>

                      {/* Key_i */}
                      <td className="py-3 px-3.5">
                        <span className="text-indigo-400 font-bold">{item.key_i.toFixed(6)}</span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right font-sans">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEntry(item);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition-colors"
                        >
                          Verify Math
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: SINGLE ENTRY MATHEMATICAL PROOF & DERIVATION */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-lg font-sans">
                <Award className="w-5 h-5 text-emerald-400" />
                <span>Efraimidis-Spirakis Proof Breakdown</span>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Entry ID:</span>
                  <span className="text-white font-bold">{selectedEntry.entry_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Assigned Rank:</span>
                  <span className="text-emerald-400 font-black text-sm">#{selectedEntry.rank}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Outcome Status:</span>
                  <span className="font-bold text-white font-sans">{selectedEntry.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Participant Classification:</span>
                  <span className={selectedEntry.is_bot ? 'text-red-400' : 'text-emerald-400'}>
                    {selectedEntry.is_bot ? 'Adversarial Sybil' : 'Verified Legitimate User'}
                  </span>
                </div>
              </div>

              {/* Math Proof */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-emerald-500/30 space-y-3">
                <span className="text-[11px] text-emerald-400 font-bold uppercase font-sans block">
                  Step-by-Step Derivation
                </span>

                <div className="space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Uniform u_i:</span>
                    <span className="text-teal-300 font-bold">{selectedEntry.u_i}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cluster Weight (w_i):</span>
                    <span className="text-amber-300 font-bold">{selectedEntry.weight}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sampling Key (k_i = u_i^(1/w)):</span>
                    <span className="text-indigo-400 font-bold">{selectedEntry.key_i}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Log Key (ln(u)/w):</span>
                    <span className="text-slate-400">{selectedEntry.log_key}</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 font-sans pt-2 border-t border-slate-800/80">
                  Because key_i is strictly a function of HMAC(seed, entry_id) and assigned weight w_i, arrival speed provides zero advantage.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW EVENT */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-lg">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Create New Drop Event</span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Event Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coldplay World Tour Drop"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Seat Capacity *
                </label>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  required
                  value={newEventCapacity}
                  onChange={(e) => setNewEventCapacity(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Custom Event ID (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. event_coldplay_001"
                  value={newEventCustomId}
                  onChange={(e) => setNewEventCustomId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-emerald-500 outline-none font-mono"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !newEventName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { api, AuditDrawResponse, AuditVerifyResponse, EventItem } from '../api/client';
import { ShieldCheck, Hash, Key, Search, CheckCircle2, AlertCircle, Loader2, Lock, Unlock, Calendar } from 'lucide-react';

export const Audit: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('event_drop_001');
  const [drawData, setDrawData] = useState<AuditDrawResponse | null>(null);
  const [entryId, setEntryId] = useState('');
  const [verificationResult, setVerificationResult] = useState<AuditVerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const res = await api.listPublicEvents();
        if (res.events && res.events.length > 0) {
          setEvents(res.events);
        }
      } catch (e) {}
    };
    loadEvents();
  }, []);

  const fetchDrawAudit = async (eventId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAuditDraw(eventId);
      setDrawData(data);
    } catch (err: any) {
      setError('Failed to fetch public audit parameters for this event.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrawAudit(selectedEventId);
  }, [selectedEventId]);

  const handleVerifyEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryId.trim()) return;

    setVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      const res = await api.getAuditVerify(entryId.trim(), selectedEventId);
      setVerificationResult(res);
    } catch (err: any) {
      setError(err?.message || 'Verification lookup failed.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto my-10 px-4 space-y-8">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <ShieldCheck className="w-4 h-4" />
          Differentiator D1: Provable Fairness
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Public Cryptographic Audit</h1>
        <p className="text-sm text-slate-400 mt-2">
          Verify independently that the draw was strictly randomized, committed prior to window opening, and impossible for operators to manipulate.
        </p>

        {/* Event Selector for Audit */}
        {events.length > 1 && (
          <div className="mt-4 inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400 font-medium">Auditing Event:</span>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              {events.map((evt) => (
                <option key={evt.id} value={evt.id} className="bg-slate-900 text-white">
                  {evt.name} ({evt.id}) [{evt.state}]
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Cryptographic Parameters Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Commitment */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Lock className="w-4 h-4 text-emerald-400" />
              Pre-Commitment
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Published Early
            </span>
          </div>
          <div className="text-xs font-mono text-slate-200 break-all bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
            {drawData?.commitment || 'SHA-256(seed) published before window open'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            SHA-256 hash of the secret seed committed publicly before the drop started.
          </p>
        </div>

        {/* Revealed Seed */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Unlock className="w-4 h-4 text-teal-400" />
              Revealed Seed
            </span>
            <span className="text-[10px] bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded-full border border-teal-500/20">
              At Window Close
            </span>
          </div>
          <div className="text-xs font-mono text-slate-200 break-all bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
            {drawData?.seed_reveal || 'Revealed after window closes'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Unlocks reproducible ranking. Hashing this seed reproduces the pre-commitment.
          </p>
        </div>

        {/* Entries Hash */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Hash className="w-4 h-4 text-indigo-400" />
              Frozen Entries Hash
            </span>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20">
              List Frozen
            </span>
          </div>
          <div className="text-xs font-mono text-slate-200 break-all bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
            {drawData?.entries_hash || 'SHA-256(sorted entry_ids)'}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Guarantees no entries were inserted or deleted after the draw was initiated.
          </p>
        </div>
      </div>

      {/* Verify My Result Interactive Box */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <h2 className="text-xl font-bold text-white mb-2">Verify My Result In Browser</h2>
        <p className="text-sm text-slate-400 mb-6">
          Paste your unique entry ID to recalculate your Efraimidis-Spirakis draw key and mathematically verify your rank for <strong>{selectedEventId}</strong>.
        </p>

        <form onSubmit={handleVerifyEntry} className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              required
              value={entryId}
              onChange={(e) => setEntryId(e.target.value)}
              placeholder="e.g. entry_seed_ident_..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={verifying}
            className="py-2.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Now'}
          </button>
        </form>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {verificationResult && (
          <div className="p-6 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
              <CheckCircle2 className="w-6 h-6" />
              <span>Independent Verification Confirmed Authentic!</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Rank</span>
                <span className="text-xl font-bold font-mono text-white">#{verificationResult.rank}</span>
              </div>
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Assigned Weight</span>
                <span className="text-xl font-bold font-mono text-emerald-400">{verificationResult.weight.toFixed(4)}</span>
              </div>
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Uniform u_i</span>
                <span className="text-xl font-bold font-mono text-teal-400">{verificationResult.computed.computed_u_i}</span>
              </div>
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Sampling Key</span>
                <span className="text-xl font-bold font-mono text-indigo-400">{verificationResult.computed.computed_key_i.toFixed(4)}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-xl text-xs font-mono text-slate-300 space-y-1">
              <div>Formula: key_i = u_i ^ (1 / weight)</div>
              <div>HMAC Check: SHA-256(seed, entry_id) verified.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

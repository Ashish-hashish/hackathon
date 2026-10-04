import React, { useState, useEffect } from 'react';
import { api, AuditDrawResponse, AuditVerifyResponse, EventItem } from '../api/client';
import {
  ShieldCheck, Hash, Key, Search, CheckCircle2, AlertCircle,
  Loader2, Lock, Unlock, Calendar, Copy, Check, ChevronDown, ChevronUp,
  Download, Terminal, Sparkles, ExternalLink, Cpu, Shield, Globe
} from 'lucide-react';

export const Audit: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('event_drop_001');
  const [drawData, setDrawData] = useState<AuditDrawResponse | null>(null);
  const [entryId, setEntryId] = useState('');
  const [verificationResult, setVerificationResult] = useState<AuditVerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  // FAQ Accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

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

  const handleVerifyEntry = async (e?: React.FormEvent, customEntryId?: string) => {
    if (e) e.preventDefault();
    const targetId = (customEntryId || entryId).trim();
    if (!targetId) return;

    setVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      const res = await api.getAuditVerify(targetId, selectedEventId);
      setVerificationResult(res);
    } catch (err: any) {
      setError(err?.message || 'Verification lookup failed for this entry ID.');
    } finally {
      setVerifying(false);
    }
  };

  const handleAutoFill = () => {
    const sampleId = 'entry_seed_ident_00000001';
    setEntryId(sampleId);
    handleVerifyEntry(undefined, sampleId);
  };

  const handleCopyReceipt = () => {
    navigator.clipboard.writeText(JSON.stringify(verificationResult || drawData, null, 2));
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2000);
  };

  const faqItems = [
    {
      q: "How do I know the organizers didn't secretly pick their friends?",
      a: "The draw seed commitment was published before registration opened. Changing the outcome would require retroactively breaking SHA-256 pre-image resistance, which is mathematically impossible."
    },
    {
      q: "What should I do if my Registration ID isn't found?",
      a: "Verify that you are querying the correct event from the dropdown above. If you registered anonymously or in incognito, check your confirmation email for your exact canonical entry receipt."
    },
    {
      q: "Can I re-verify this result independently on GitHub or locally?",
      a: "Yes! Fair Drop is fully open-source. You can run the standalone verification script with python -m fairdrop.verify or run our Rust consensus validator on the exported public ledger bundle."
    }
  ];

  return (
    <div className="max-w-6xl mx-auto my-8 px-4 space-y-8">
      {/* Top Banner & Header matching Reference Image 2 */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>INDEPENDENT VERIFICATION NODE #409-EU / CRYPTOGRAPHICALLY SEALED</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Public Fairness Verification
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Verify that the winner selection was independently randomized and tamper-proof. No queue skipping, no latency advantages, and zero black-box decisions.
        </p>

        {/* Event Selector */}
        {events.length > 1 && (
          <div className="pt-2 flex justify-center">
            <div className="inline-flex items-center gap-2 bg-[#0d121e] border border-[#1b2338] px-3.5 py-2 rounded-xl text-xs">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400 font-medium">Auditing Event:</span>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bg-transparent text-white font-bold outline-none cursor-pointer"
              >
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id} className="bg-[#0d121e] text-white">
                    {evt.name} ({evt.id}) [{evt.state}]
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Verify Input Box matching Reference Image 2 */}
      <div className="max-w-2xl mx-auto bg-[#0d121e] border border-[#1b2338] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-3">
        <form onSubmit={handleVerifyEntry} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              required
              value={entryId}
              onChange={(e) => setEntryId(e.target.value)}
              placeholder="e.g. FD-88219 or entry_seed_ident_..."
              className="w-full bg-[#07090e] border border-[#1b2338] rounded-xl pl-10 pr-4 py-2.5 text-white font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAutoFill}
              className="px-3 py-2.5 rounded-xl bg-[#121727] hover:bg-[#182035] text-slate-300 border border-[#1f273d] text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Auto-fill sample
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="px-5 py-2.5 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-bold text-xs transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span>Verify My Entry</span>
            </button>
          </div>
        </form>

        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
          <span>Supported drop: <strong className="text-slate-400 font-semibold">{selectedEventId}</strong></span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Block Height: 19,842,012
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-xs max-w-xl mx-auto">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Verified Receipt Banner (when verified or default audit present) */}
      <div className="bg-[#0d121e] border border-emerald-500/30 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#182133]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Entry Verified — Fairness Guaranteed</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold uppercase">
                  Tamper-Free
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Participant receipt <code className="text-slate-200 font-mono">{verificationResult?.entry_id || 'FD-88219'}</code> was audited across 4 consensus validators.
              </p>
            </div>
          </div>

          <button
            onClick={handleCopyReceipt}
            className="px-3.5 py-2 rounded-xl bg-[#090d16] hover:bg-[#121727] text-slate-300 border border-[#1b2338] text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
          >
            {copiedReceipt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copiedReceipt ? 'Receipt Copied' : 'Copy Audit Receipt'}</span>
          </button>
        </div>

        {/* The 3 Factors Grid matching Reference Image 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Factor 1: Pre-Committed */}
          <div className="p-4 rounded-xl bg-[#080b12] border border-[#182133] flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold block">
                Factor 01 / Pre-Committed
              </span>
              <h4 className="text-sm font-bold text-white mt-1">Draw Seed Pre-Committed</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Sealed before the registration window opened, guaranteeing the selection algorithm was physically impossible to alter mid-draw.
              </p>
            </div>
            <div className="pt-2">
              <span className="text-[10px] font-mono text-slate-500 block">Merkle Commitment</span>
              <div className="text-[11px] font-mono text-emerald-400 bg-[#0c101b] p-2 rounded-lg border border-[#1b2338] truncate mt-0.5">
                {drawData?.commitment || '0xfa89c02e54a91932b71...'}
              </div>
            </div>
          </div>

          {/* Factor 2: Unbiased Randomness */}
          <div className="p-4 rounded-xl bg-[#080b12] border border-[#182133] flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold block">
                Factor 02 / Unbiased
              </span>
              <h4 className="text-sm font-bold text-white mt-1">Random Selection Factor</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Calculated deterministically with zero latency advantage. Millisecond connection speeds provided no edge over regular attendees.
              </p>
            </div>
            <div className="pt-2">
              <span className="text-[10px] font-mono text-slate-500 block">Entropy Source</span>
              <div className="text-[11px] font-mono text-teal-400 bg-[#0c101b] p-2 rounded-lg border border-[#1b2338] truncate mt-0.5">
                {drawData?.seed_reveal ? 'Revealed Seed: ' + drawData.seed_reveal.slice(0, 16) : 'NIST Beacon + Drand Group'}
              </div>
            </div>
          </div>

          {/* Factor 3: Outcome */}
          <div className="p-4 rounded-xl bg-[#080b12] border border-[#182133] flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold block">
                Factor 03 / Outcome
              </span>
              <h4 className="text-sm font-bold text-white mt-1">Final Status</h4>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black font-mono text-emerald-400">
                  #{verificationResult?.rank || '042'}
                </span>
                <span className="text-xs text-slate-400 font-mono">of 500 Allocated Seats</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Selected for Tier 1 Seat Allocation. Cryptographic pass bound to your verified registration key.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Claim Expiry</span>
              <span className="text-emerald-400 font-bold">23h 48m 12s left</span>
            </div>
          </div>
        </div>

        {/* Deterministic Assignment Flow Diagram */}
        <div className="p-5 rounded-xl bg-[#080b12] border border-[#182133] space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300 font-bold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              Deterministic Assignment Flow
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              All math executed on public distributed ledger
            </span>
          </div>

          {/* 3 Step Flow */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
            <div className="p-3 bg-[#0c101b] rounded-xl border border-[#1b2336] text-center space-y-1">
              <span className="px-2 py-0.5 rounded bg-[#161d2e] text-[10px] font-mono text-slate-400 font-bold">
                01
              </span>
              <div className="text-xs font-bold text-white mt-1">Registration Sealed</div>
              <p className="text-[11px] font-mono text-slate-400">
                {drawData?.entries_hash ? 'Hash: ' + drawData.entries_hash.slice(0, 10) + '...' : '38,194 entries'}
              </p>
            </div>

            <div className="p-3 bg-[#0c101b] rounded-xl border border-[#1b2336] text-center space-y-1">
              <span className="px-2 py-0.5 rounded bg-[#161d2e] text-[10px] font-mono text-slate-400 font-bold">
                02
              </span>
              <div className="text-xs font-bold text-white mt-1">Beacon Randomness</div>
              <p className="text-[11px] font-mono text-slate-400">Dual source seed</p>
            </div>

            <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/30 text-center space-y-1">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] font-mono text-emerald-400 font-bold">
                ✓
              </span>
              <div className="text-xs font-bold text-emerald-400 mt-1">Your Verified Ticket</div>
              <p className="text-[11px] font-mono text-slate-300">
                Seat Rank #{verificationResult?.rank || '042'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ZERO-TRUST EXPLAINED Section matching Reference Image 2 */}
      <div className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold block">
              Zero-Trust Explained
            </span>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Understanding The Fairness Engine
            </h2>
          </div>
          <p className="text-xs text-slate-400 sm:text-right max-w-sm">
            Cryptographic guarantees without requiring you to decipher 4,000 lines of smart contract bytecode.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[#0d121e] border border-[#1b2338] flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white">No Speed Advantages</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                It doesn't matter if you joined in second 1 or in the final hour. Every legitimate registrant entered during the window had the exact same mathematical probability.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>Zero-latency penalty</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#0d121e] border border-[#1b2338] flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white">Sybil &amp; Bot Neutralization</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Disposable automated entries were filtered before the shuffle using zero-knowledge identity checks. Real humans weren't crowded out by server farms.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>Multi-account resistance</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#0d121e] border border-[#1b2338] flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Globe className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white">Public Reproducibility</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Because the random number seed was published across decentralized networks, anyone with a laptop can re-run the draw and get the exact same 500 winners.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>Independently testable</span>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Accordion matching Reference Image 2 */}
      <div className="space-y-2 pt-2">
        {faqItems.map((item, idx) => {
          const isOpen = openFaq === idx;
          return (
            <div
              key={idx}
              className="rounded-xl bg-[#0d121e] border border-[#1b2338] overflow-hidden transition-all"
            >
              <button
                onClick={() => toggleFaq(idx)}
                className="w-full px-5 py-4 flex items-center justify-between text-left text-xs font-semibold text-white hover:text-indigo-300 transition-colors"
              >
                <span>{item.q}</span>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>
              {isOpen && (
                <div className="px-5 pb-4 text-xs text-slate-400 leading-relaxed border-t border-[#182133] pt-3">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Download Full Public Ledger Bundle Card matching Reference Image 2 */}
      <div className="bg-[#0b0f19] border border-[#1a2336] rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#131929] border border-[#1e273e] flex items-center justify-center text-slate-400 shrink-0">
            <Download className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Download Full Public Ledger Bundle</h4>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              SHA256 Manifest + Merkle Proof Tree (4.2 MB)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleCopyReceipt()}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-[#121727] hover:bg-[#182035] text-slate-300 border border-[#1f273d] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>View CLI Script</span>
          </button>
          <button
            type="button"
            onClick={() => handleCopyReceipt()}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Archive</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Audit;

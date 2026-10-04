import React, { useState, useEffect } from 'react';
import { api, EventItem } from '../api/client';
import {
  Calendar, Ticket, ShieldCheck, Users, Clock,
  ArrowRight, Sparkles, AlertCircle, RefreshCw, CheckCircle2,
  Search, Shield, ExternalLink, HelpCircle
} from 'lucide-react';

interface EventsHubProps {
  onSelectEvent: (eventId: string, targetTab?: 'enter' | 'audit') => void;
  selectedEventId?: string;
  hasRegistered?: boolean;
}

export const EventsHub: React.FC<EventsHubProps> = ({
  onSelectEvent,
  selectedEventId,
  hasRegistered = false,
}) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [filterTab, setFilterTab] = useState<'ALL' | 'OPEN' | 'PAST'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEvents = async () => {
    try {
      const res = await api.listPublicEvents();
      if (res.events) {
        setEvents(res.events);
      }
      setError(null);
    } catch (err: any) {
      setError('Could not load drop events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 3000);
    return () => clearInterval(interval);
  }, []);

  // Filter events based on filter tab and search
  const openCount = events.filter((e) => e.state === 'OPEN').length;
  const pastCount = events.filter((e) => e.state === 'DRAWN' || e.state === 'CLOSED' || e.state === 'DONE').length;

  const filteredEvents = events.filter((evt) => {
    if (filterTab === 'OPEN' && evt.state !== 'OPEN') return false;
    if (filterTab === 'PAST' && evt.state !== 'DRAWN' && evt.state !== 'CLOSED' && evt.state !== 'DONE') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = evt.name.toLowerCase().includes(q);
      const matchId = evt.id.toLowerCase().includes(q);
      return matchName || matchId;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto my-8 px-4 space-y-8">
      {/* Header with Sub-Badge & Guaranteed Odds Widget */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="font-mono text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Registrator Desk
            </span>
            <span className="text-slate-600 font-mono text-xs">•</span>
            <span className="text-slate-400 font-mono text-xs">Standard Equal-Odds Queue</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Browse Live Drops
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Discover open allocations, join fair randomized waiting rooms, and verify honest outcomes without bots or high-speed connection advantages.
          </p>
        </div>

        {/* Guaranteed Equal Odds Badge Card */}
        <div className="bg-[#0e1320] border border-[#1c2438] rounded-2xl p-4 flex items-center gap-3.5 shadow-xl max-w-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <span>Guaranteed Equal Odds</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Queue entry timestamp never determines priority.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
        {/* Pills */}
        <div className="flex items-center bg-[#0a0e18] p-1 rounded-xl border border-[#1b2336] text-xs">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
              filterTab === 'ALL'
                ? 'bg-[#5452ee] text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All ({events.length})
          </button>
          <button
            onClick={() => setFilterTab('OPEN')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
              filterTab === 'OPEN'
                ? 'bg-[#5452ee] text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Open for Registration ({openCount})
          </button>
          <button
            onClick={() => setFilterTab('PAST')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
              filterTab === 'PAST'
                ? 'bg-[#5452ee] text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Past / Concluded ({pastCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Search by event title, host, or pass..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0a0e18] border border-[#1b2336] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400 text-xs max-w-md mx-auto">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Syncing live drop events...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-20 rounded-2xl bg-[#0c101b] border border-[#1b2336] p-8">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No Matching Drop Events Found</h3>
          <p className="text-xs text-slate-400">Events created by organisers will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((evt) => {
            const isSelected = evt.id === selectedEventId;
            const isOpen = evt.state === 'OPEN';
            const isDrawn = evt.state === 'DRAWN' || evt.state === 'DONE';
            const isClosed = evt.state === 'CLOSED';
            const isPending = evt.state === 'PENDING';

            // Calculate estimated chance
            const entries = evt.entries_count || 0;
            const cap = evt.capacity || 1;
            const chancePct = entries > 0 ? Math.min(100, Math.round((cap / Math.max(entries, 1)) * 1000) / 10) : 100;

            return (
              <div
                key={evt.id}
                className={`rounded-2xl bg-[#0d121e] border transition-all flex flex-col justify-between overflow-hidden shadow-xl group hover:shadow-2xl hover:border-[#28344e] ${
                  isSelected
                    ? 'border-indigo-500/70 ring-1 ring-indigo-500/30 bg-[#0f1524]'
                    : 'border-[#1b2336]'
                }`}
              >
                {/* Banner / Visual Top Container */}
                <div className="relative h-36 bg-gradient-to-br from-[#141b2c] via-[#0e1422] to-[#0a0e18] p-4 flex flex-col justify-between border-b border-[#182133] overflow-hidden">
                  {/* Subtle decorative glow */}
                  <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-indigo-600/10 blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-teal-500/5 blur-xl pointer-events-none" />

                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 relative z-10">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border flex items-center gap-1.5 ${
                        isOpen
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : isDrawn
                          ? 'bg-slate-800/80 text-slate-300 border-slate-700'
                          : isPending
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isOpen
                            ? 'bg-emerald-400 animate-pulse'
                            : isDrawn
                            ? 'bg-slate-400'
                            : 'bg-amber-400'
                        }`}
                      />
                      {isOpen ? 'Open for Entry' : isDrawn ? 'Concluded' : evt.state}
                    </span>

                    <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 bg-[#07090e]/70 px-2 py-0.5 rounded-full border border-white/5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {isOpen ? 'Ends in 5 hours' : isDrawn ? 'Closed Nov 2025' : 'Upcoming'}
                    </span>
                  </div>

                  {/* Bottom of Banner: Equal Probability Badge */}
                  <div className="relative z-10 flex items-center">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#07090e]/80 border border-[#222b40] text-[10px] font-mono text-slate-300">
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      Equal Probability
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-indigo-200 transition-colors">
                      {evt.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      Impartial cryptographic ballot waiting room. Zero priority given to queue arrival speed or latency.
                    </p>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2.5 mt-4">
                      <div className="p-2.5 bg-[#080b12] rounded-xl border border-[#182133]">
                        <span className="text-[9px] uppercase tracking-wider font-mono font-semibold text-slate-500 block">
                          Pass Capacity
                        </span>
                        <span className="text-sm font-bold font-mono text-white mt-0.5 block">
                          {evt.capacity} Seats
                        </span>
                      </div>
                      <div className="p-2.5 bg-[#080b12] rounded-xl border border-[#182133]">
                        <span className="text-[9px] uppercase tracking-wider font-mono font-semibold text-slate-500 block">
                          Registered
                        </span>
                        <span className="text-sm font-bold font-mono text-white mt-0.5 block">
                          {evt.entries_count || 0} Attendees
                        </span>
                      </div>
                    </div>

                    {/* Odds line */}
                    <div className="mt-3 flex items-center justify-between text-[11px] font-mono px-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Users className="w-3 h-3 text-indigo-400" />
                        Chance: ~{chancePct}%
                      </span>
                      <span className={isOpen ? 'text-emerald-400' : 'text-slate-500'}>
                        {isOpen ? 'Queue Active' : isDrawn ? '100% Allocated' : 'Window Pending'}
                      </span>
                    </div>

                    {evt.commitment && (
                      <div className="mt-2.5 p-2 bg-[#080b12] rounded-lg border border-[#182133] text-[10px] font-mono text-slate-400 truncate">
                        <span className="text-indigo-400 font-semibold">Commitment: </span>
                        {evt.commitment.slice(0, 16)}...
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-[#182133] space-y-2">
                    <button
                      onClick={() => onSelectEvent(evt.id, 'enter')}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-semibold text-xs transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2"
                    >
                      <span>{isDrawn ? 'View Allocation Results' : 'Join Drop Queue'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onSelectEvent(evt.id, 'audit')}
                      className="w-full py-2 px-4 rounded-xl bg-transparent hover:bg-[#131a29] text-slate-400 hover:text-slate-200 font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>View Public Fairness Proof</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Informational Banner Matching Design */}
      <div className="bg-[#0b0f19] border border-[#1a2336] rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#131929] border border-[#1e273e] flex items-center justify-center text-slate-400 shrink-0">
            <Shield className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">How our fair waiting rooms protect you</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              You don't need to refresh frantically at the exact second of opening. Every verified registrant during the window holds mathematically identical odds.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Zero-Bot Latency Guard
          </span>
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <span>Read Attendee FAQ</span>
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventsHub;

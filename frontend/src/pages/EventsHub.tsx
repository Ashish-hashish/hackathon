import React, { useState, useEffect } from 'react';
import { api, EventItem } from '../api/client';
import {
  Calendar, Ticket, ShieldCheck, Users, Clock,
  ArrowRight, Sparkles, AlertCircle, RefreshCw, CheckCircle2
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

  return (
    <div className="max-w-7xl mx-auto my-10 px-4 space-y-8">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles className="w-4 h-4" />
          Active & Upcoming Drop Events
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Browse Live Drop Events
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          Select any event to pre-register, join the randomized waiting room, or view cryptographic audit commitments.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400 text-sm max-w-md mx-auto">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading events...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 rounded-3xl bg-slate-900 border border-slate-800 p-8">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">No Active Events Found</h3>
          <p className="text-xs text-slate-400">Events created by organisers will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((evt) => {
            const isSelected = evt.id === selectedEventId;
            const isOpen = evt.state === 'OPEN';
            const isDrawn = evt.state === 'DRAWN';
            const isPending = evt.state === 'PENDING';

            return (
              <div
                key={evt.id}
                className={`p-6 rounded-3xl bg-slate-900 border transition-all flex flex-col justify-between space-y-6 relative overflow-hidden shadow-xl ${
                  isSelected
                    ? 'border-emerald-500/60 ring-2 ring-emerald-500/20 bg-slate-900/90'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Top Badge & State */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-mono font-bold text-slate-400 truncate max-w-[160px]">
                      {evt.id}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border flex items-center gap-1.5 ${
                        isOpen
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : isDrawn
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                          : isPending
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {isOpen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>}
                      {evt.state}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white tracking-tight">{evt.name}</h3>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Seat Capacity</span>
                      <span className="text-base font-bold font-mono text-teal-400">{evt.capacity} seats</span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Total Entries</span>
                      <span className="text-base font-bold font-mono text-white">{evt.entries_count || 0}</span>
                    </div>
                  </div>

                  {evt.commitment && (
                    <div className="mt-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800/60 text-[10px] font-mono text-slate-400 truncate">
                      <span className="text-emerald-400 font-semibold">Commitment: </span>
                      {evt.commitment.slice(0, 16)}...
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <button
                    onClick={() => onSelectEvent(evt.id, 'enter')}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    <Ticket className="w-4 h-4 fill-slate-950" />
                    <span>Join / Enter Drop Queue</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onSelectEvent(evt.id, 'audit')}
                    className="w-full py-2 px-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>View Cryptographic Audit</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

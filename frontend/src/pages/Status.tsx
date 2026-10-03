import React, { useState, useEffect } from 'react';
import { api, UserStatusResponse } from '../api/client';
import {
  Clock, CheckCircle2, AlertTriangle, Shield, Award,
  ArrowRight, Loader2, Sparkles, RefreshCw, Zap, Radio, Calendar
} from 'lucide-react';

interface StatusProps {
  initialStatus?: UserStatusResponse | null;
  eventId?: string;
  onConfirmSuccess?: () => void;
  onBrowseEvents?: () => void;
}

export const Status: React.FC<StatusProps> = ({
  initialStatus,
  eventId,
  onConfirmSuccess,
  onBrowseEvents,
}) => {
  const [statusData, setStatusData] = useState<UserStatusResponse | null>(initialStatus || null);
  const [countdown, setCountdown] = useState<number>(0);
  const [confirming, setConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep statusData in sync if initialStatus updates
  useEffect(() => {
    if (initialStatus) {
      setStatusData(initialStatus);
      if (initialStatus.hold?.expires_at) {
        const nowSec = Math.floor(Date.now() / 1000);
        const rem = Math.max(0, initialStatus.hold.expires_at - nowSec);
        setCountdown(rem);
      }
    }
  }, [initialStatus]);

  const targetEventId = eventId || statusData?.event_id;

  const pollStatus = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await api.getMyStatus(targetEventId);
      setStatusData(data);

      if (data.hold?.expires_at) {
        const nowSec = Math.floor(Date.now() / 1000);
        const rem = Math.max(0, data.hold.expires_at - nowSec);
        setCountdown(rem);
      }
    } catch (e) {
      // Soft error during polling
    } finally {
      if (isManual) setRefreshing(false);
    }
  };

  // Poll /me every 2.5 seconds with jitter
  useEffect(() => {
    let timerId: any = null;

    const runPollLoop = async () => {
      await pollStatus(false);
      const jitter = Math.random() * 500;
      timerId = setTimeout(runPollLoop, 2500 + jitter);
    };

    runPollLoop();
    return () => clearTimeout(timerId);
  }, [targetEventId]);

  // Hold countdown tick
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const handleConfirm = async () => {
    if (!statusData?.hold?.hold_id) return;
    setConfirming(true);
    setError(null);

    const idempotencyKey = `confirm_${statusData.identity_id}_${statusData.hold.hold_id}`;
    try {
      await api.confirmSeat(statusData.hold.hold_id, idempotencyKey);
      const updated = await api.getMyStatus(targetEventId);
      setStatusData(updated);
      if (onConfirmSuccess) onConfirmSuccess();
    } catch (err: any) {
      setError(err?.message || 'Seat confirmation failed.');
    } finally {
      setConfirming(false);
    }
  };

  const currentStatus = statusData?.status || 'ENTERED';
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="max-w-2xl mx-auto my-12 p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative overflow-hidden">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800/80">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-mono text-emerald-400 font-semibold uppercase">Live Telemetry Active</span>
          {targetEventId && (
            <span className="text-slate-500 font-mono text-[11px] hidden sm:inline">
              • {targetEventId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onBrowseEvents && (
            <button
              onClick={onBrowseEvents}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-teal-400" />
              <span>All Events</span>
            </button>
          )}

          <button
            onClick={() => pollStatus(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* State 1: ENTERED (Waiting for Draw) */}
      {currentStatus === 'ENTERED' && (
        <div className="text-center py-4 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center mx-auto shadow-lg shadow-teal-500/10">
            <Radio className="w-8 h-8 animate-pulse" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Zap className="w-3.5 h-3.5" />
              Live Waiting Room
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              You're in the Waiting Room!
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
              Your ticket has been cryptographically registered in the pool. When the window closes, the verifiable random draw will run.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400 py-1 border-b border-slate-800/60">
              <span>Event:</span>
              <span className="font-semibold text-white">
                {statusData?.event_name || targetEventId}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 py-1 border-b border-slate-800/60">
              <span>Window State:</span>
              <span className="font-semibold text-emerald-400 uppercase tracking-wider">
                {statusData?.window_state || 'OPEN'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 py-1 border-b border-slate-800/60">
              <span>Your Entry ID:</span>
              <span className="font-mono text-slate-200 font-semibold truncate max-w-[200px] sm:max-w-none">
                {statusData?.entry_id || 'Generating...'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 py-1 border-b border-slate-800/60">
              <span>Identity Hash:</span>
              <span className="font-mono text-slate-400 text-[11px] truncate max-w-[200px] sm:max-w-none">
                {statusData?.identity_id || 'Verified'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 py-1">
              <span>Lottery Algorithm:</span>
              <span className="font-medium text-emerald-400">
                Efraimidis-Spirakis Weighted Sampling
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs text-slate-400 text-left flex items-start gap-3">
            <Shield className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
            <span>
              <strong>Zero-Speed Advantage Guaranteed:</strong> Entering at second 1 or minute 5 produces identical mathematical winning odds. Keep this tab open; your results will sync live.
            </span>
          </div>
        </div>
      )}

      {/* State 2: DRAWN (Bucket Rank Displayed) */}
      {currentStatus === 'DRAWN' && (
        <div className="text-center py-4 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/10">
            <Award className="w-8 h-8 animate-bounce" />
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Draw Complete!</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
              The cryptographic draw has executed. Inventory is currently being admitted in ranked batches.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 text-center">
            <span className="text-xs uppercase font-semibold tracking-wider text-indigo-400">Your Allocation Tier</span>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">
              {statusData?.rank_bucket || 'Processing Tier...'}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Exact numerical ranks remain sealed during live admission to prevent secondary market waitlist speculation.
            </p>
          </div>
        </div>
      )}

      {/* State 3: ADMITTED (Hold Active, Countdown Ticking) */}
      {currentStatus === 'ADMITTED' && (
        <div className="text-center py-4 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2 animate-bounce">
            <Sparkles className="w-4 h-4" />
            Seat Reserved for You!
          </div>

          <div>
            <h2 className="text-3xl font-black text-white tracking-tight">Claim Your Reserved Seat</h2>
            <p className="text-sm text-slate-300 mt-2 max-w-md mx-auto">
              Inventory has been atomically reserved for your verified identity. You have an exclusive hold window to lock it in.
            </p>
          </div>

          {/* Countdown Clock */}
          <div className="p-6 rounded-2xl bg-slate-950 border border-emerald-500/30 max-w-sm mx-auto shadow-inner">
            <span className="text-xs font-semibold uppercase text-slate-400">Hold Expires In</span>
            <div className={`text-5xl font-mono font-black mt-1 ${countdown < 30 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
              {formatTime(countdown)}
            </div>
            <span className="text-[11px] text-slate-500 mt-2 block">
              If expired, your hold is safely returned to the waitlist.
            </span>
          </div>

          <button
            onClick={handleConfirm}
            disabled={confirming || countdown === 0}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-slate-950 font-black text-lg transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {confirming ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Confirming Allocation...</span>
              </>
            ) : (
              <>
                <span>Confirm & Lock In Seat</span>
                <ArrowRight className="w-6 h-6" />
              </>
            )}
          </button>
        </div>
      )}

      {/* State 4: CONFIRMED */}
      {currentStatus === 'CONFIRMED' && (
        <div className="text-center py-6 space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <h2 className="text-3xl font-black text-white">Seat Confirmed!</h2>
            <p className="text-sm text-slate-300 mt-2 max-w-md mx-auto">
              Your seat allocation has been permanently written to PostgreSQL source of truth.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Status:</span>
              <span className="font-bold text-emerald-400 uppercase">Confirmed & Final</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Identity ID:</span>
              <span className="font-mono text-slate-200">{statusData?.identity_id}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Integrity Invariant:</span>
              <span className="text-emerald-400 font-medium">Guaranteed Exactly-Once Allocation</span>
            </div>
          </div>

          {onBrowseEvents && (
            <button
              onClick={onBrowseEvents}
              className="py-3 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition-all"
            >
              Browse More Events
            </button>
          )}
        </div>
      )}

      {/* State 5: EXPIRED */}
      {currentStatus === 'EXPIRED' && (
        <div className="text-center py-6 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Hold Expired for This Event</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
              The reservation window for <strong>{statusData?.event_name || targetEventId}</strong> closed before confirmation. The seat has been recycled back to the waitlist.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            {onBrowseEvents && (
              <button
                onClick={onBrowseEvents}
                className="py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-slate-950 font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Calendar className="w-4 h-4" />
                <span>Browse Other Live Drop Events</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* State 6: SKIPPED_CLUSTER_CAP */}
      {currentStatus === 'SKIPPED_CLUSTER_CAP' && (
        <div className="text-center py-6 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Cluster Seat Cap Reached</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
              To prevent Sybil attacks, Fair Drop limits allocations to 1 confirmed seat per cluster (shared device/phone/network signals).
            </p>
          </div>

          {onBrowseEvents && (
            <button
              onClick={onBrowseEvents}
              className="py-3 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition-all"
            >
              Browse Other Events
            </button>
          )}
        </div>
      )}
    </div>
  );
};

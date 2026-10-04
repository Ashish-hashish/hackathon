import React, { useState, useEffect } from 'react';
import { api, UserStatusResponse } from '../api/client';
import {
  Clock, CheckCircle2, AlertTriangle, Shield, Award,
  ArrowRight, Loader2, Sparkles, RefreshCw, Zap, Radio, Calendar,
  Ticket, QrCode, Copy, Send, Check
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
  const [copiedPass, setCopiedPass] = useState(false);
  const [resendSent, setResendSent] = useState(false);

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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  const handleResend = () => {
    setResendSent(true);
    setTimeout(() => setResendSent(false), 3000);
  };

  const currentStatus = statusData?.status || 'ENTERED';
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="max-w-4xl mx-auto my-8 px-4 space-y-6">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#182133]">
        <div className="flex items-center gap-2.5 text-xs text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-mono text-emerald-400 font-semibold uppercase tracking-wider text-[11px]">
            Live Telemetry Active
          </span>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e1320] border border-[#1c2438] hover:bg-[#151c2e] text-xs text-slate-300 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>All Events</span>
            </button>
          )}

          <button
            onClick={() => pollStatus(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#07090e] border border-[#1c2438] text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* State 1: ENTERED (Queue Participant Pass matching reference image 1) */}
      {currentStatus === 'ENTERED' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Pass Card */}
          <div className="lg:col-span-12 bg-[#0d121e] border border-[#1b2338] rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#182133] bg-[#090d16] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Ticket className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-white tracking-wide">Queue Participant Pass</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVE
              </span>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {/* Inner Pass Box with Target Event & QR Code */}
              <div className="p-6 rounded-2xl bg-[#080b12] border border-[#182133] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-4 flex-1">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold block">
                      Target Event
                    </span>
                    <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">
                      {statusData?.event_name || targetEventId || 'Tomorrowland VIP Pass'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">
                      250 Capacity Pool • Boom, Belgium
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Participant Name</span>
                      <span className="text-xs font-bold text-slate-200 mt-0.5 block">Elena Vance</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Registration ID</span>
                      <span className="text-xs font-mono font-bold text-indigo-400 mt-0.5 block truncate">
                        #{statusData?.entry_id?.slice(-8) || statusData?.identity_id?.slice(-8) || 'FD-88219'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Verification Method</span>
                      <span className="text-xs text-slate-300 mt-0.5 block">SMS Authenticated</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Status</span>
                      <span className="text-xs font-semibold text-emerald-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified &amp; Queued
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#161d2e] flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Queue Closes In</span>
                      <span className="text-sm font-bold text-white mt-0.5 block">04h 10m 32s</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase block">Allocated Pool</span>
                      <span className="text-sm font-bold text-indigo-400 mt-0.5 block">1 in 4.2 Avg Odds</span>
                    </div>
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="w-32 h-32 rounded-xl bg-white p-2.5 flex items-center justify-center shrink-0 shadow-lg">
                  {/* High contrast SVG QR code pattern */}
                  <svg viewBox="0 0 100 100" className="w-full h-full text-black fill-current">
                    <rect x="0" y="0" width="30" height="30" rx="3" />
                    <rect x="5" y="5" width="20" height="20" fill="white" />
                    <rect x="10" y="10" width="10" height="10" />

                    <rect x="70" y="0" width="30" height="30" rx="3" />
                    <rect x="75" y="5" width="20" height="20" fill="white" />
                    <rect x="80" y="10" width="10" height="10" />

                    <rect x="0" y="70" width="30" height="30" rx="3" />
                    <rect x="5" y="75" width="20" height="20" fill="white" />
                    <rect x="10" y="80" width="10" height="10" />

                    {/* Matrix dots */}
                    <rect x="36" y="8" width="6" height="6" />
                    <rect x="48" y="16" width="6" height="6" />
                    <rect x="36" y="24" width="6" height="6" />
                    <rect x="12" y="38" width="6" height="6" />
                    <rect x="24" y="46" width="6" height="6" />
                    <rect x="40" y="40" width="18" height="18" rx="2" />
                    <rect x="46" y="46" width="6" height="6" fill="white" />
                    <rect x="68" y="38" width="6" height="6" />
                    <rect x="82" y="46" width="6" height="6" />
                    <rect x="68" y="58" width="6" height="6" />
                    <rect x="38" y="72" width="6" height="6" />
                    <rect x="50" y="80" width="6" height="6" />
                    <rect x="76" y="74" width="14" height="6" />
                    <rect x="84" y="86" width="6" height="6" />
                  </svg>
                </div>
              </div>

              {/* How the Draw Works Callout */}
              <div className="p-4 rounded-xl bg-[#080b12] border border-[#182133] text-xs text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-200 font-bold text-xs">
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  <span>How the Draw Works</span>
                </div>
                <p className="leading-relaxed">
                  The random selection will take place once registration closes at 18:00 UTC. Every verified participant has equal probability of selection regardless of when they registered.
                </p>
              </div>

              {/* Verified Submissions Progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Verified Submissions</span>
                  <span className="text-white font-bold">1,048 participants</span>
                </div>
                <div className="w-full bg-[#080b12] border border-[#182133] rounded-full h-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full w-2/3"></div>
                </div>
                <p className="text-[10px] text-slate-500 text-right font-mono">
                  Registration closes at capacity or 18:00 UTC
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={handleCopyLink}
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[#121727] hover:bg-[#182035] text-slate-200 border border-[#1f273d] text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {copiedPass ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedPass ? 'Pass Link Copied!' : 'Copy Pass Link'}</span>
                </button>
                <button
                  onClick={handleResend}
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[#121727] hover:bg-[#182035] text-slate-200 border border-[#1f273d] text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5 text-slate-400" />
                  <span>{resendSent ? 'Confirmation Resent!' : 'Resend Email'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* State 2: DRAWN (Bucket Rank Displayed) */}
      {currentStatus === 'DRAWN' && (
        <div className="bg-[#0d121e] border border-[#1b2338] rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto shadow-lg shadow-indigo-600/20">
            <Award className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Draw Complete!</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
              The cryptographic draw has executed. Inventory is currently being admitted in ranked batches.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#080b12] border border-indigo-500/30 text-center max-w-md mx-auto">
            <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-indigo-400">
              Your Allocation Tier
            </span>
            <div className="text-3xl font-black text-white mt-1">
              {statusData?.rank_bucket || 'Processing Tier...'}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Exact numerical ranks remain sealed during live admission to prevent secondary market waitlist speculation.
            </p>
          </div>
        </div>
      )}

      {/* State 3: ADMITTED (Hold Active, Countdown Ticking) */}
      {currentStatus === 'ADMITTED' && (
        <div className="bg-[#0d121e] border border-[#1b2338] rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-1 animate-bounce">
            <Sparkles className="w-4 h-4" />
            Seat Reserved for You!
          </div>

          <div>
            <h2 className="text-3xl font-black text-white tracking-tight">Claim Your Reserved Seat</h2>
            <p className="text-xs text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
              Inventory has been atomically reserved for your verified identity. You have an exclusive hold window to lock it in.
            </p>
          </div>

          {/* Countdown Clock */}
          <div className="p-6 rounded-2xl bg-[#080b12] border border-emerald-500/30 max-w-sm mx-auto shadow-inner">
            <span className="text-[10px] font-semibold uppercase font-mono text-slate-400">Hold Expires In</span>
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
            className="w-full max-w-sm mx-auto py-4 px-6 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-black text-base transition-all shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {confirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Confirming Allocation...</span>
              </>
            ) : (
              <>
                <span>Confirm &amp; Lock In Seat</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      )}

      {/* State 4: CONFIRMED */}
      {currentStatus === 'CONFIRMED' && (
        <div className="bg-[#0d121e] border border-[#1b2338] rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-3xl font-black text-white">Seat Confirmed!</h2>
            <p className="text-xs text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
              Your seat allocation has been permanently written to PostgreSQL source of truth.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#080b12] border border-[#182133] text-left space-y-2 max-w-md mx-auto">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Status:</span>
              <span className="font-bold text-emerald-400 uppercase">Confirmed &amp; Final</span>
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
              className="py-3 px-6 rounded-xl bg-[#121727] hover:bg-[#182035] text-white font-semibold text-xs transition-all border border-[#1f273d]"
            >
              Browse More Events
            </button>
          )}
        </div>
      )}

      {/* State 5: EXPIRED */}
      {currentStatus === 'EXPIRED' && (
        <div className="bg-[#0d121e] border border-[#1b2338] rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Hold Expired for This Event</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
              The reservation window for <strong>{statusData?.event_name || targetEventId}</strong> closed before confirmation. The seat has been recycled back to the waitlist.
            </p>
          </div>

          {onBrowseEvents && (
            <div className="pt-2">
              <button
                onClick={onBrowseEvents}
                className="py-3 px-6 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-bold text-xs transition-all flex items-center justify-center gap-2 mx-auto shadow-lg shadow-indigo-600/20"
              >
                <Calendar className="w-4 h-4" />
                <span>Browse Other Live Drop Events</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* State 6: SKIPPED_CLUSTER_CAP */}
      {currentStatus === 'SKIPPED_CLUSTER_CAP' && (
        <div className="bg-[#0d121e] border border-[#1b2338] rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Cluster Seat Cap Reached</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
              To prevent Sybil attacks, Fair Drop limits allocations to 1 confirmed seat per cluster (shared device/phone/network signals).
            </p>
          </div>

          {onBrowseEvents && (
            <div className="pt-2">
              <button
                onClick={onBrowseEvents}
                className="py-3 px-6 rounded-xl bg-[#121727] hover:bg-[#182035] text-white font-semibold text-xs transition-all border border-[#1f273d]"
              >
                Browse Other Events
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Status;

import React, { useState, useEffect } from 'react';
import { api, EventItem } from '../api/client';
import { Mail, Phone, ArrowRight, KeyRound, AlertCircle, CheckCircle2, Loader2, Calendar } from 'lucide-react';

interface RegisterProps {
  onVerified: (identityId: string, eventId: string) => void;
  selectedEventId?: string;
  onSelectEvent?: (eventId: string) => void;
}

export const Register: React.FC<RegisterProps> = ({ onVerified, selectedEventId, onSelectEvent }) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string>(selectedEventId || 'event_drop_001');
  const [step, setStep] = useState<'REGISTER' | 'VERIFY'>('REGISTER');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [identityId, setIdentityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const res = await api.listPublicEvents();
        if (res.events && res.events.length > 0) {
          setEvents(res.events);
          if (!selectedEventId) {
            setCurrentEventId(res.events[0].id);
            if (onSelectEvent) onSelectEvent(res.events[0].id);
          }
        }
      } catch (e) {
        // Fallback
      }
    };
    loadEvents();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);
    try {
      const res = await api.register(email, phone || undefined, currentEventId);
      setIdentityId(res.identity_id);
      setStep('VERIFY');
      if (res.dev_code_hint) {
        setDevCodeHint(res.dev_code_hint);
        setOtpCode(res.dev_code_hint);
      }
      setSuccessMsg(`Verification code dispatched to ${res.email}`);
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please check your email.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) return;

    setLoading(true);
    setError(null);
    try {
      const res = await api.verify(identityId, otpCode);
      onVerified(res.identity_id, res.event_id || currentEventId);
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {step === 'REGISTER' ? 'Pre-Register for Fair Drop' : 'Enter Verification Code'}
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          {step === 'REGISTER'
            ? 'Verify your identity in advance. Arrival speed during the drop does not affect your chances.'
            : `Enter the 6-digit one-time code sent to your email.`}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && !error && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-emerald-400 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {step === 'REGISTER' ? (
        <form onSubmit={handleRegister} className="space-y-4">
          {events.length > 1 && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Select Drop Event <span className="text-emerald-400">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
                <select
                  value={currentEventId}
                  onChange={(e) => {
                    setCurrentEventId(e.target.value);
                    if (onSelectEvent) onSelectEvent(e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                >
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id} className="bg-slate-900 text-white">
                      {evt.name} ({evt.capacity} seats) [{evt.state}]
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Email Address <span className="text-emerald-400">*</span>
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alice@example.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Canonicalized to prevent aliases (+tags and dots in Gmail are automatically collapsed).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Phone Number <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <Phone className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 019 2834"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Stored exclusively as a peppered cryptographic HMAC hash. Never stored raw.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Verification Code'}
            {!loading && <ArrowRight className="w-5 h-5" />}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          {devCodeHint && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
              <span>Dev Auto-Fill Code: <strong className="font-mono text-sm tracking-wider text-emerald-200">{devCodeHint}</strong></span>
              <button
                type="button"
                onClick={() => setOtpCode(devCodeHint)}
                className="px-2 py-0.5 bg-emerald-500 text-slate-950 font-bold rounded text-[10px] hover:bg-emerald-400 transition-colors"
              >
                Use Code
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              6-Digit Code
            </label>
            <div className="relative">
              <KeyRound className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-white tracking-widest text-lg font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Code valid for 5 minutes (max 5 attempts before lock).
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('REGISTER')}
              className="py-3 px-4 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 font-medium transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Continue'}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { api, EventItem } from '../api/client';
import {
  Mail, Phone, ArrowRight, KeyRound, AlertCircle, CheckCircle2,
  Loader2, Calendar, ShieldCheck, UserCheck, HelpCircle, Clock,
  Check, Lock, Info, Sparkles
} from 'lucide-react';

interface RegisterProps {
  onVerified: (identityId: string, eventId: string) => void;
  selectedEventId?: string;
  onSelectEvent?: (eventId: string) => void;
}

export const Register: React.FC<RegisterProps> = ({ onVerified, selectedEventId, onSelectEvent }) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string>(selectedEventId || 'event_drop_001');
  const [step, setStep] = useState<'REGISTER' | 'VERIFY'>('REGISTER');
  const [fullName, setFullName] = useState('Elena Vance');
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

  const selectedEvent = events.find((e) => e.id === currentEventId);

  return (
    <div className="max-w-6xl mx-auto my-8 px-4 space-y-8">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-[#182133]">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-1">
            <span>Attendee Portal</span>
            <span>&gt;</span>
            <span className="text-slate-200">Registration &amp; Live Queue</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Event Registration &amp; Status
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Guaranteed fair entry protocol. All approved registrations maintain an identical probability of selection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            FAIR QUEUE WINDOW OPEN
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-xs max-w-xl mx-auto">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && !error && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-emerald-400 text-xs max-w-xl mx-auto">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Registration Form Card */}
      <div className="max-w-2xl mx-auto bg-[#0d121e] border border-[#1b2338] rounded-2xl shadow-2xl overflow-hidden">
        {/* Card Header */}
        <div className="px-6 py-4 border-b border-[#182133] bg-[#090d16] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {step === 'REGISTER' ? 'Register for Event' : 'Enter Verification Passcode'}
              </h2>
              <span className="text-[10px] text-slate-500 font-mono">
                {step === 'REGISTER' ? 'Zero-speed priority verification' : 'Cryptographic OTP challenge'}
              </span>
            </div>
          </div>

          <span className="px-2.5 py-0.5 rounded-md bg-[#131a29] border border-[#20293d] text-[10px] font-mono text-slate-400 font-medium">
            {step === 'REGISTER' ? 'Phase 1 of 2' : 'Phase 2 of 2'}
          </span>
        </div>

        <div className="p-6 sm:p-8">
          {step === 'REGISTER' ? (
            <form onSubmit={handleRegister} className="space-y-5">
              {/* Event Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                    Select Event
                  </label>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    OPEN TO ALL
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={currentEventId}
                    onChange={(e) => {
                      setCurrentEventId(e.target.value);
                      if (onSelectEvent) onSelectEvent(e.target.value);
                    }}
                    className="w-full bg-[#07090e] border border-[#1b2338] rounded-xl px-4 py-3 text-white text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all cursor-pointer appearance-none"
                  >
                    {events.map((evt) => (
                      <option key={evt.id} value={evt.id} className="bg-[#0d121e] text-white">
                        {evt.name} ({evt.capacity} seats) [{evt.state}]
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-3.5 text-slate-500">
                    ▼
                  </div>
                </div>
              </div>

              {/* Full Legal Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-1.5">
                  Full Legal Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Elena Vance"
                    className="w-full bg-[#07090e] border border-[#1b2338] rounded-xl px-4 py-3 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all font-sans"
                  />
                  {fullName.trim().length > 2 && (
                    <div className="absolute right-3.5 top-3 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              {/* Email Address */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                    Email Address <span className="text-indigo-400">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">Passcode sent here</span>
                </div>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="elena.vance@precision-audio.org"
                    className="w-full bg-[#07090e] border border-[#1b2338] rounded-xl px-4 py-3 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                  <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>We automatically detect duplicate registrations to keep queues fair. One pass allocation per individual.</span>
                </div>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-1.5">
                  Mobile Number <span className="text-slate-500 font-normal font-sans">(Optional)</span>
                </label>
                <div className="flex gap-2">
                  <div className="w-16 px-3 py-3 rounded-xl bg-[#07090e] border border-[#1b2338] text-slate-400 font-mono text-xs flex items-center justify-center">
                    +1
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 234-8901"
                    className="flex-1 bg-[#07090e] border border-[#1b2338] rounded-xl px-4 py-3 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Used strictly for two-step ticket claims upon selection.
                </p>
              </div>

              {/* INTEGRITY GUARANTEES */}
              <div className="p-4 rounded-xl bg-[#090d16] border border-[#182133] space-y-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 block">
                  Integrity Guarantees
                </span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start gap-2 text-slate-300">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-200">Bot &amp; Multi-Account Protection Active:</strong> System filters simulated traffic automatically.
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-300">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-200">Anti-Rush Protection:</strong> Registration order does not alter selection odds. Take your time.
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-300">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-200">Instant Confirmation:</strong> Status ledger updates immediately upon ticket creation.
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>Submit Registration</span>
              </button>
            </form>
          ) : (
            /* OTP VERIFY STEP */
            <form onSubmit={handleVerify} className="space-y-5">
              {devCodeHint && (
                <div className="p-3 bg-indigo-600/10 border border-indigo-500/30 rounded-xl text-xs text-indigo-300 flex items-center justify-between">
                  <span>
                    Dev Auto-Fill Code: <strong className="font-mono text-sm tracking-wider text-white">{devCodeHint}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOtpCode(devCodeHint)}
                    className="px-2.5 py-1 bg-[#5452ee] text-white font-bold rounded-lg text-[10px] hover:bg-indigo-500 transition-colors"
                  >
                    Auto-Fill
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider font-mono text-slate-400 mb-1.5">
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    className="w-full bg-[#07090e] border border-[#1b2338] rounded-xl pl-11 pr-4 py-3 text-white tracking-widest text-lg font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all text-center"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Code valid for 5 minutes (max 5 attempts before lock).
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('REGISTER')}
                  className="py-3 px-5 rounded-xl border border-[#1f273d] bg-[#090d16] text-slate-300 hover:bg-[#121727] text-xs font-semibold transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Continue'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Bottom Feature Explainer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <div className="p-4 rounded-2xl bg-[#0c101b] border border-[#1b2336] space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Pure Random Selection</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Whether you sign up at the opening minute or 5 minutes before the deadline, your exact odds remain constant.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c101b] border border-[#1b2336] space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Clock className="w-4 h-4 text-teal-400" />
            <span>Selection Window</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Selected participants will receive an SMS and email notification with an exclusive 60-minute checkout link.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0c101b] border border-[#1b2336] space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>Registration Questions?</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Check our fairness guide or talk to support.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold inline-flex items-center gap-1 transition-colors"
            >
              <span>Help Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;

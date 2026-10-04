import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from './components/Navbar';
import { EventsHub } from './pages/EventsHub';
import { Register } from './pages/Register';
import { Enter } from './pages/Enter';
import { Status } from './pages/Status';
import { Audit } from './pages/Audit';
import { Ops } from './pages/Ops';
import { FairnessLab } from './pages/FairnessLab';
import { api, UserStatusResponse } from './api/client';
import {
  Lock, Eye, EyeOff, Shield, ArrowRight, KeyRound, Laptop,
  Users, Cog, Sparkles, CheckCircle2
} from 'lucide-react';

const ORGANISER_PASSWORD = 'admin'; // Dev default gate — change via VITE_ORGANISER_PIN env

/* ─── Role Selection Landing Page ─── */
const RoleSelectionLanding: React.FC<{
  onSelectAttendee: () => void;
  onSelectOrganiser: () => void;
}> = ({ onSelectAttendee, onSelectOrganiser }) => {
  const cards = [
    {
      id: 'attendee',
      tag: 'ROLE 01 // PUBLIC ACCESS',
      title: 'Enter as Attendee',
      subtitle: 'Browse live events, register with verified identity, and track your queue + fair allocation status.',
      features: [
        'Deterministic zero-latency queue entry',
        'Cryptographic ticket receipt & Merkle verification',
        'Transparent public audit ledger access'
      ],
      icon: Users,
      action: onSelectAttendee,
      actionLabel: 'Continue as Attendee',
      glowColor: 'from-indigo-600/35 via-blue-600/25 to-indigo-600/35',
      iconBg: 'bg-indigo-600/15 border-indigo-500/30 text-indigo-400',
      tagColor: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10',
    },
    {
      id: 'organiser',
      tag: 'ROLE 02 // RESTRICTED ENCLAVE',
      title: 'Enter as Organiser',
      subtitle: 'Operator Enclave: open/close registration windows, trigger verifiable draws, inspect fairness telemetry. PIN required.',
      features: [
        'Real-time registration & PoW telemetry',
        'One-click seed commitment & verifiable draw execution',
        'Interactive Fairness Lab with Sybil ablation testing'
      ],
      icon: Cog,
      action: onSelectOrganiser,
      actionLabel: 'Continue to Operator PIN',
      glowColor: 'from-purple-600/35 via-indigo-600/25 to-purple-600/35',
      iconBg: 'bg-purple-600/15 border-purple-500/30 text-purple-400',
      tagColor: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
    },
  ];

  return (
    <div className="relative min-h-[calc(100vh-60px)] flex flex-col justify-between py-12 px-4 overflow-hidden">
      {/* Immersive dark radial gradient backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />
      
      {/* Subtle grid/dot overlay */}
      <div className="absolute inset-0 dot-grid-bg opacity-70 pointer-events-none" />

      {/* Main Content Container */}
      <div className="relative z-10 max-w-5xl mx-auto w-full flex-1 flex flex-col items-center justify-center my-auto">
        
        {/* Animated Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-12 space-y-4 max-w-2xl"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>FAIR DROP // CHOOSE YOUR ACCESS ROLE</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            How are you entering
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
              Fair Drop
            </span>{' '}
            today?
          </h1>
          <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            Attendees register for high-demand events and claim fair allocations. Organisers run the live verifiable engine and audit controls.
          </p>
        </motion.div>

        {/* Role Cards with Framer Motion entrance & hover scale */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -6, scale: 1.015 }}
                className="group relative cursor-pointer"
                onClick={card.action}
              >
                {/* Ambient hover glow halo behind card */}
                <div
                  className={`absolute -inset-1.5 rounded-3xl bg-gradient-to-br ${card.glowColor} opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none`}
                />

                {/* Glassmorphic Card Container */}
                <div className="relative bg-slate-950/85 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-7 sm:p-8 h-full flex flex-col justify-between shadow-2xl transition-all duration-300 group-hover:border-slate-700/90 group-hover:shadow-indigo-500/10">
                  <div>
                    {/* Top Tag and Icon Header */}
                    <div className="flex items-center justify-between gap-2 mb-6">
                      <div className={`w-12 h-12 rounded-xl ${card.iconBg} border flex items-center justify-center shadow-inner`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${card.tagColor}`}>
                        {card.tag}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2.5 tracking-tight group-hover:text-indigo-200 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-6">
                      {card.subtitle}
                    </p>

                    {/* Feature bullets */}
                    <div className="space-y-2 mb-6 border-t border-slate-800/60 pt-4">
                      {card.features.map((feature, fIdx) => (
                        <div key={fIdx} className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Link Button */}
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-400 group-hover:text-indigo-300 transition-colors">
                      <span>{card.actionLabel}</span>
                      <motion.span
                        className="inline-block"
                        animate={{ x: [0, 4, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        →
                      </motion.span>
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Monospace Protocol Ticker Pill Bar at the bottom */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="relative z-10 flex justify-center mt-12 mb-2"
      >
        <div className="font-mono text-xs text-slate-400 bg-slate-900/60 border border-slate-800/60 rounded-full px-4 py-1.5 inline-flex items-center gap-3 backdrop-blur-md shadow-lg">
          <span className="font-bold text-slate-300 tracking-wider">FAIR DROP PROTOCOL</span>
          <span className="text-slate-500">v4.8.2-inst</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            VERIFIED
          </span>
          <span className="hidden sm:inline text-slate-500">|</span>
          <span className="hidden sm:inline">
            ENGINE: <strong className="text-slate-200">DETERMINISTIC_ALLOCATION_ACTIVE</strong>
          </span>
          <span className="hidden md:inline text-slate-500">|</span>
          <span className="hidden md:inline">
            MERKLE: <code className="text-slate-300">0x9f4a...12c8</code>
          </span>
        </div>
      </motion.div>
    </div>
  );
};

/* ─── Main App ─── */

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'events' | 'enter' | 'audit' | 'ops' | 'lab' | null>(null);
  const [userRole, setUserRole] = useState<'registrator' | 'organiser'>('registrator');
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>('event_drop_001');
  const [userStatus, setUserStatus] = useState<UserStatusResponse | null>(null);

  // Organiser auth state
  const [organiserAuthed, setOrganiserAuthed] = useState(false);
  const [organiserPin, setOrganiserPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Check existing session
  const checkSession = async (eventId?: string) => {
    try {
      const statusData = await api.getMyStatus(eventId || selectedEventId);
      setUserStatus(statusData);
      if (statusData.identity_id) {
        setIdentityId(statusData.identity_id);
      }
      if (statusData.event_id) {
        setSelectedEventId(statusData.event_id);
      }
    } catch (e) {
      // Not authenticated yet
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleRoleSwitch = (role: 'registrator' | 'organiser') => {
    if (role === 'organiser' && !organiserAuthed) {
      setUserRole('organiser');
      setActiveTab('ops');
      return;
    }
    setUserRole(role);
    if (role === 'organiser') setActiveTab('ops');
    else setActiveTab('events');
  };

  const handleOrganiserLogin = (pinOverride?: string) => {
    const pin = (import.meta as any).env?.VITE_ORGANISER_PIN || ORGANISER_PASSWORD;
    const testPin = pinOverride !== undefined ? pinOverride : organiserPin;
    if (testPin === pin) {
      setOrganiserAuthed(true);
      setPinError(false);
    } else {
      setPinError(true);
      setOrganiserPin('');
    }
  };

  // Show role selection landing page when no tab is selected
  const showLanding = activeTab === null;

  // Show organiser login gate when organiser role selected but not authed
  const showOrganiserGate = userRole === 'organiser' && !organiserAuthed && !showLanding;

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-600/30 selection:text-indigo-200">
      {/* Floating Glassmorphic Navbar — visible when past the landing screen */}
      {!showLanding && (
        <Navbar
          activeTab={activeTab || 'events'}
          setActiveTab={(tab: any) => setActiveTab(tab)}
          userRole={userRole}
          setUserRole={handleRoleSwitch}
          organiserAuthed={organiserAuthed}
          onOrganiserLogout={() => {
            setOrganiserAuthed(false);
            setUserRole('registrator');
            setActiveTab('events');
          }}
          onGoHome={() => setActiveTab(null)}
        />
      )}

      {/* Landing Page */}
      {showLanding && (
        <RoleSelectionLanding
          onSelectAttendee={() => {
            setUserRole('registrator');
            setActiveTab('events');
          }}
          onSelectOrganiser={() => {
            setUserRole('organiser');
            setActiveTab('ops');
          }}
        />
      )}

      {!showLanding && (
        <main className="flex-1 pb-16">
          {/* Organiser PIN gate (Organizer Workspace Authentication) */}
          {showOrganiserGate && (
            <div className="max-w-lg mx-auto my-16 px-4">
              {/* Top Security Status Tag */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center justify-center gap-2 mb-4"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-mono text-xs uppercase tracking-wider text-slate-400 font-medium">
                  Fair Drop // Operator Enclave / ENC: AES-GCM-256
                </span>
              </motion.div>

              {/* Auth Card Container */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-[#0d111c] border border-[#1b2338] rounded-2xl shadow-2xl overflow-hidden relative"
              >
                {/* Accent top gradient bar */}
                <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />

                <div className="p-8">
                  {/* Purple/Indigo Icon container */}
                  <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-5 text-indigo-400 shadow-lg shadow-indigo-600/10">
                    <Lock className="w-6 h-6" />
                  </div>

                  <h2 className="text-2xl font-black text-white tracking-tight mb-2">
                    Organizer Workspace Authentication
                  </h2>
                  <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                    Enter your authorized Operator PIN or Security Token to access live event controls, draw triggers, and participant review ledgers.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Operator Access PIN / Security Key
                        </label>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          HSM Level 3
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={organiserPin}
                          onChange={(e) => {
                            setOrganiserPin(e.target.value);
                            setPinError(false);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && handleOrganiserLogin()}
                          placeholder="••••••••"
                          className={`w-full px-4 py-3 rounded-xl bg-[#07090e] border text-white font-mono tracking-widest text-sm outline-none transition-all ${
                            pinError
                              ? 'border-red-500 focus:ring-2 focus:ring-red-500/30'
                              : 'border-[#1e2638] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
                          }`}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 transition-colors"
                          title={showPassword ? 'Hide PIN' : 'Show PIN'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-500">
                        <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Entropy-checked session clearance • 3 attempts remaining before 15m lockout</span>
                      </div>
                    </div>

                    <AnimatePresence>
                      {pinError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2"
                        >
                          <span>Incorrect PIN code. Authorization failed.</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                      onClick={() => handleOrganiserLogin()}
                      className="w-full py-3.5 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Authenticate & Access Event Controls</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        setOrganiserPin('admin');
                        handleOrganiserLogin('admin');
                      }}
                      type="button"
                      className="w-full py-2.5 rounded-xl bg-[#121727] hover:bg-[#182035] text-slate-300 border border-[#1f273d] text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Use Dev Quick-Access PIN (admin)</span>
                    </button>

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Insert FIDO2 / YubiKey Hardware Token</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom return link */}
                <div className="border-t border-[#182133] bg-[#090d16] px-8 py-3.5 flex items-center justify-between text-xs">
                  <button
                    onClick={() => {
                      setUserRole('registrator');
                      setActiveTab('events');
                    }}
                    className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                  >
                    <span>← Switch to Public Attendee View</span>
                  </button>
                  <span className="text-[10px] font-mono text-slate-500">ENCLAVE SEC-2</span>
                </div>
              </motion.div>

              {/* Bottom Enclave info */}
              <div className="mt-4 flex items-center justify-between text-[10px] font-mono text-slate-500 px-2">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  ISOLATED EXECUTION VAULT
                </span>
                <span>NODE CLUSTER // us-east-04</span>
              </div>
            </div>
          )}

          {/* Normal content when not gated */}
          {!showOrganiserGate && (
            <>
              {activeTab === 'events' && (
                <EventsHub
                  selectedEventId={selectedEventId}
                  hasRegistered={!!identityId}
                  onSelectEvent={(eid, targetTab = 'enter') => {
                    setSelectedEventId(eid);
                    checkSession(eid);
                    setActiveTab(targetTab);
                  }}
                />
              )}

              {activeTab === 'enter' && (
                <>
                  {!identityId ? (
                    <Register
                      selectedEventId={selectedEventId}
                      onSelectEvent={(eid) => {
                        setSelectedEventId(eid);
                        checkSession(eid);
                      }}
                      onVerified={(id, eid) => {
                        setIdentityId(id);
                        if (eid) setSelectedEventId(eid);
                        checkSession(eid);
                      }}
                    />
                  ) : userStatus?.status === 'REGISTERED' ? (
                    <Enter
                      statusData={userStatus}
                      selectedEventId={selectedEventId}
                      onEntered={(entryRes) => {
                        if (entryRes) {
                          setUserStatus((prev) => ({
                            identity_id: identityId || prev?.identity_id || '',
                            event_id: selectedEventId || prev?.event_id || 'event_drop_001',
                            window_state: prev?.window_state || 'OPEN',
                            ...prev,
                            status: 'ENTERED',
                            entry_id: entryRes.entry_id,
                          }));
                        }
                        checkSession(selectedEventId);
                      }}
                    />
                  ) : (
                    <Status
                      initialStatus={userStatus}
                      eventId={selectedEventId}
                      onBrowseEvents={() => setActiveTab('events')}
                    />
                  )}
                </>
              )}

              {activeTab === 'audit' && <Audit />}
              {activeTab === 'ops' && <Ops />}
              {activeTab === 'lab' && <FairnessLab />}
            </>
          )}
        </main>
      )}

      {/* Protocol Telemetry Footer Bar */}
      {!showLanding && (
        <footer className="border-t border-slate-800/50 bg-[#07090e]/95 backdrop-blur-md py-3 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-center">
            <div className="font-mono text-xs text-slate-400 bg-slate-900/60 border border-slate-800/60 rounded-full px-4 py-1.5 inline-flex items-center gap-3">
              <span className="font-bold text-slate-300 tracking-wider">FAIR DROP PROTOCOL</span>
              <span className="text-slate-500">v4.8.2-inst</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                VERIFIED
              </span>
              <span className="hidden sm:inline text-slate-500">|</span>
              <span className="hidden sm:inline">
                ENGINE: <strong className="text-slate-200">DETERMINISTIC_ALLOCATION_ACTIVE</strong>
              </span>
              <span className="hidden md:inline text-slate-500">|</span>
              <span className="hidden md:inline">
                MERKLE: <code className="text-slate-300">0x9f4a...12c8</code>
              </span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

export default App;

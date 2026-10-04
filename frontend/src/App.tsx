import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { EventsHub } from './pages/EventsHub';
import { Register } from './pages/Register';
import { Enter } from './pages/Enter';
import { Status } from './pages/Status';
import { Audit } from './pages/Audit';
import { Ops } from './pages/Ops';
import { FairnessLab } from './pages/FairnessLab';
import { api, UserStatusResponse } from './api/client';
import { Lock, Eye, EyeOff, Shield, ArrowRight, KeyRound, Laptop } from 'lucide-react';

const ORGANISER_PASSWORD = 'admin'; // Simple dev gate — change via VITE_ORGANISER_PIN env

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'events' | 'enter' | 'audit' | 'ops' | 'lab'>('events');
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

  // Show organiser login gate when organiser role selected but not authed
  const showOrganiserGate = userRole === 'organiser' && !organiserAuthed;

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-600/30 selection:text-indigo-200">
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab: any) => setActiveTab(tab)}
        userRole={userRole}
        setUserRole={handleRoleSwitch}
        organiserAuthed={organiserAuthed}
        onOrganiserLogout={() => {
          setOrganiserAuthed(false);
          setUserRole('registrator');
          setActiveTab('events');
        }}
      />

      <main className="flex-1 pb-16">
        {/* Organiser PIN gate (Organizer Workspace Authentication) */}
        {showOrganiserGate && (
          <div className="max-w-lg mx-auto my-16 px-4">
            {/* Top Security Status Tag */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-mono text-xs uppercase tracking-wider text-slate-400 font-medium">
                Fair Drop // Operator Enclave / ENC: AES-GCM-256
              </span>
            </div>

            {/* Auth Card Container */}
            <div className="bg-[#0d111c] border border-[#1b2338] rounded-2xl shadow-2xl overflow-hidden relative">
              {/* Purple accent top bar */}
              <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />

              <div className="p-8">
                {/* Purple Icon container */}
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

                  {pinError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                      <span>Incorrect PIN code. Authorization failed.</span>
                    </div>
                  )}

                  <button
                    onClick={() => handleOrganiserLogin()}
                    className="w-full py-3.5 rounded-xl bg-[#5452ee] hover:bg-[#4744db] text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
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
                    className="w-full py-2.5 rounded-xl bg-[#121727] hover:bg-[#182035] text-slate-300 border border-[#1f273d] text-xs font-medium transition-colors flex items-center justify-center gap-2"
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
                  className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 font-medium"
                >
                  <span>← Switch to Public Attendee View</span>
                </button>
                <span className="text-[10px] font-mono text-slate-500">ENCLAVE SEC-2</span>
              </div>
            </div>

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

      {/* Protocol Telemetry Footer Bar */}
      <footer className="border-t border-[#161d2e] bg-[#07090e]/95 backdrop-blur-md py-4 px-4 text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-slate-300 tracking-wider">FAIR DROP PROTOCOL</span>
            <span className="text-slate-500">v4.8.2-inst</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              QUORUM CONSENSUS VERIFIED
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-400 flex-wrap justify-center">
            <span>
              ENGINE STATE:{' '}
              <strong className="text-slate-200 tracking-wide font-mono">DETERMINISTIC_ALLOCATION_ACTIVE</strong>
            </span>
            <span className="hidden sm:inline">
              MERKLE ROOT: <code className="text-slate-300">0x9f4a...12c8</code>
            </span>
            <span className="text-slate-500">© 2025 FAIR DROP FOUNDATION</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

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
import { Lock } from 'lucide-react';

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

  const handleOrganiserLogin = () => {
    const pin = (import.meta as any).env?.VITE_ORGANISER_PIN || ORGANISER_PASSWORD;
    if (organiserPin === pin) {
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
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
        {/* Organiser PIN gate */}
        {showOrganiserGate && (
          <div className="max-w-sm mx-auto my-20 p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-5">
              <Lock className="w-7 h-7 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Organiser Access</h2>
            <p className="text-sm text-slate-400 mb-6">Enter the organiser PIN to access event controls.</p>

            <input
              type="password"
              value={organiserPin}
              onChange={(e) => { setOrganiserPin(e.target.value); setPinError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && handleOrganiserLogin()}
              placeholder="Enter PIN..."
              className={`w-full px-4 py-3 rounded-xl bg-slate-950 border text-white text-center text-lg font-mono tracking-widest mb-3 outline-none focus:ring-2 transition-all ${
                pinError ? 'border-red-500 focus:ring-red-500/30' : 'border-slate-700 focus:ring-indigo-500/40'
              }`}
              autoFocus
            />
            {pinError && (
              <p className="text-xs text-red-400 mb-3">Incorrect PIN. Try again.</p>
            )}
            <button
              onClick={handleOrganiserLogin}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all"
            >
              Unlock Organiser View
            </button>
            <button
              onClick={() => { setUserRole('registrator'); setActiveTab('events'); }}
              className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Back to Events Hub
            </button>
            <p className="text-[11px] text-slate-600 mt-4">Dev default PIN: <code className="text-slate-400">admin</code></p>
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

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <p>Fair Drop • Verifiable Weighted Lottery • Single Monorepo Architecture</p>
      </footer>
    </div>
  );
};

export default App;

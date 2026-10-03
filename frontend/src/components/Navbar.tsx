import React from 'react';
import { ShieldCheck, Activity, Award, BarChart3, Ticket, Calendar, LogOut } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userRole: 'registrator' | 'organiser';
  setUserRole: (role: 'registrator' | 'organiser') => void;
  organiserAuthed?: boolean;
  onOrganiserLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  userRole,
  setUserRole,
  organiserAuthed = false,
  onOrganiserLogout,
}) => {
  const registratorTabs = [
    { id: 'events', label: 'Drop Events', icon: Calendar },
    { id: 'enter', label: 'My Registration & Queue', icon: Ticket },
    { id: 'audit', label: 'Public Audit', icon: ShieldCheck },
  ];

  const organiserTabs = [
    { id: 'ops', label: 'Event Controls & Ops', icon: Activity },
    { id: 'lab', label: 'Simulation & Fairness Lab', icon: BarChart3 },
    { id: 'audit', label: 'Cryptographic Audit', icon: ShieldCheck },
  ];

  const currentTabs = userRole === 'organiser' && organiserAuthed ? organiserTabs : registratorTabs;

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setActiveTab(userRole === 'organiser' && organiserAuthed ? 'ops' : 'events')}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Award className="w-6 h-6 text-slate-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">FAIR DROP</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Verifiable
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Zero-Speed Advantage • Anti-Sybil</p>
          </div>
        </div>

        {/* Center: Navigation tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {currentTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Role switcher + logout */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setUserRole('registrator')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                userRole === 'registrator'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Registrator
            </button>
            <button
              onClick={() => setUserRole('organiser')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                userRole === 'organiser'
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {organiserAuthed ? '🔓 Organiser' : 'Organiser'}
            </button>
          </div>

          {/* Logout button — only visible when organiser authed */}
          {userRole === 'organiser' && organiserAuthed && onOrganiserLogout && (
            <button
              onClick={onOrganiserLogout}
              title="Logout from Organiser"
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

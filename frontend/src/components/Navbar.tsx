import React from 'react';
import { ShieldCheck, Activity, Award, BarChart3, Ticket, Calendar, LogOut, Settings, User } from 'lucide-react';

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
    { id: 'ops', label: 'Event Controls', icon: Activity },
    { id: 'lab', label: 'Fairness Lab', icon: BarChart3 },
    { id: 'audit', label: 'Public Audit', icon: ShieldCheck },
  ];

  const currentTabs = userRole === 'organiser' && organiserAuthed ? organiserTabs : registratorTabs;

  return (
    <header className="border-b border-[#182033] bg-[#090d16]/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setActiveTab(userRole === 'organiser' && organiserAuthed ? 'ops' : 'events')}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-600/30 border border-indigo-400/20 group-hover:scale-105 transition-transform">
            <Award className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white font-sans">FAIR DROP</span>
            </div>
            <span className="text-[9px] font-mono tracking-widest uppercase text-slate-400 font-semibold">
              Verifiable Engine
            </span>
          </div>
        </div>

        {/* Center: Navigation tabs */}
        <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1">
          {currentTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#151c2d] text-white border border-[#27324c] shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#111726]/60 border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Role switcher + settings & profile */}
        <div className="flex items-center gap-2">
          {/* Segmented Switcher */}
          <div className="flex items-center bg-[#07090e] p-1 rounded-xl border border-[#1b2338] text-xs">
            <button
              onClick={() => setUserRole('registrator')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                userRole === 'registrator'
                  ? 'bg-[#5452ee] text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Registrator
            </button>
            <button
              onClick={() => setUserRole('organiser')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                userRole === 'organiser'
                  ? 'bg-[#5452ee] text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {organiserAuthed ? '🔓 Organiser' : 'Organiser'}
            </button>
          </div>

          {/* Quick Action Icons */}
          <div className="hidden sm:flex items-center gap-1 border-l border-[#1a2236] pl-2">
            <button
              type="button"
              title="System Settings"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#121827] border border-transparent hover:border-[#1e273e] transition-all"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="User Enclave Profile"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#121827] border border-transparent hover:border-[#1e273e] transition-all"
            >
              <User className="w-4 h-4" />
            </button>
          </div>

          {/* Logout button — only visible when organiser authed */}
          {userRole === 'organiser' && organiserAuthed && onOrganiserLogout && (
            <button
              onClick={onOrganiserLogout}
              title="Logout from Organiser Enclave"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;

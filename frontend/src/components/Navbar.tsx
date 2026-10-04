import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Activity, Award, BarChart3, Ticket, Calendar, LogOut, Settings, User } from 'lucide-react';

export interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userRole: 'registrator' | 'organiser';
  setUserRole: (role: 'registrator' | 'organiser') => void;
  organiserAuthed?: boolean;
  onOrganiserLogout?: () => void;
  onGoHome?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  userRole,
  setUserRole,
  organiserAuthed = false,
  onOrganiserLogout,
  onGoHome,
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
    <header className="sticky top-0 z-50 px-3 sm:px-6 pt-3 pb-1">
      {/* Floating Glassmorphic Container */}
      <div className="max-w-7xl mx-auto rounded-2xl backdrop-blur-xl bg-slate-950/80 border border-slate-800/80 shadow-2xl transition-all duration-300">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          {/* Brand Logo with Return to Home/Role Select */}
          <div
            className="flex items-center gap-3 cursor-pointer group select-none"
            onClick={onGoHome ? onGoHome : () => setActiveTab(userRole === 'organiser' && organiserAuthed ? 'ops' : 'events')}
            title="Fair Drop — Click to return to Role Selection"
          >
            <motion.div
              whileHover={{ scale: 1.08, rotate: -2 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-600/30 border border-indigo-400/30"
            >
              <Award className="w-5 h-5 text-white" />
            </motion.div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white font-sans group-hover:text-indigo-200 transition-colors">
                  FAIR DROP
                </span>
              </div>
              <span className="text-[9px] font-mono tracking-widest uppercase text-slate-400 font-semibold group-hover:text-slate-300 transition-colors">
                Verifiable Engine
              </span>
            </div>
          </div>

          {/* Center: Navigation tabs with animated sliding indicator */}
          <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1 relative">
            {currentTabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap z-10 ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                  }`}
                >
                  {/* Animated pill background */}
                  {isActive && (
                    <motion.div
                      layoutId="navTab"
                      className="absolute inset-0 rounded-xl bg-slate-800/80 border border-slate-700/60 shadow-lg shadow-indigo-500/10 -z-0"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={`w-3.5 h-3.5 relative z-10 transition-colors ${
                      isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Refined "Registrator / Organiser" toggle switch & action icons */}
          <div className="flex items-center gap-2.5">
            {/* Segmented Switcher with spring sliding indicator */}
            <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800/80 text-xs relative shadow-inner">
              {/* Registrator Option */}
              <button
                type="button"
                onClick={() => setUserRole('registrator')}
                className={`relative z-10 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 flex items-center gap-1.5 ${
                  userRole === 'registrator'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {userRole === 'registrator' && (
                  <motion.div
                    layoutId="roleToggleIndicator"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md shadow-indigo-600/30 -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span>Registrator</span>
              </button>

              {/* Organiser Option */}
              <button
                type="button"
                onClick={() => setUserRole('organiser')}
                className={`relative z-10 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 flex items-center gap-1.5 ${
                  userRole === 'organiser'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {userRole === 'organiser' && (
                  <motion.div
                    layoutId="roleToggleIndicator"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 shadow-md shadow-purple-600/30 -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                {organiserAuthed ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Organiser</span>
                  </>
                ) : (
                  <span>Organiser</span>
                )}
              </button>
            </div>

            {/* Quick Action Icons with hover states */}
            <div className="hidden sm:flex items-center gap-1 border-l border-slate-800/70 pl-2">
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                type="button"
                title="System Settings"
                className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent hover:border-slate-700/60 transition-all duration-200"
              >
                <Settings className="w-4 h-4" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                type="button"
                title="User Enclave Profile"
                className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent hover:border-slate-700/60 transition-all duration-200"
              >
                <User className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Logout button — only visible when organiser is authed */}
            {userRole === 'organiser' && organiserAuthed && onOrganiserLogout && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={onOrganiserLogout}
                title="Logout from Organiser Enclave"
                className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-200"
              >
                <LogOut className="w-4 h-4" />
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;

import { createContext, useContext, useState } from 'react';

const AppContext = createContext();

const DASHBOARD_ROLES = ['distributor'];

export function AppProvider({ children }) {
  const [view, setView] = useState('landing'); // 'landing' | 'dashboard'
  const [role, setRole] = useState(null);

  function enterDashboard(selectedRole) {
    setRole(selectedRole);
    if (DASHBOARD_ROLES.includes(selectedRole)) {
      setView('dashboard');
    } else {
      setView('coming-soon');
    }
  }

  function exitDashboard() {
    setView('landing');
    setRole(null);
  }

  return (
    <AppContext value={{ view, role, enterDashboard, exitDashboard }}>
      {children}
    </AppContext>
  );
}

export function useApp() {
  return useContext(AppContext);
}

import { createContext, useContext } from 'react';
import { useApi } from './useApi.js';

const SettingsContext = createContext(null);

// Coordonnées publiques chargées une fois pour tout le site.
export function SettingsProvider({ children }) {
  const { data } = useApi('/public/settings');
  return <SettingsContext.Provider value={data}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

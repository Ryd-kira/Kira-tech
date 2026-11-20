import { createContext, useContext } from 'react';
import { useApi } from './useApi.js';

const SettingsContext = createContext(null);
const ReloadContext = createContext(() => {});

// Coordonnées publiques chargées une fois pour tout le site ; rechargées après une
// modification dans l'administration (logo, bannière…).
export function SettingsProvider({ children }) {
  const { data, retry } = useApi('/public/settings');
  return (
    <ReloadContext.Provider value={retry}>
      <SettingsContext.Provider value={data}>{children}</SettingsContext.Provider>
    </ReloadContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
export const useReloadSettings = () => useContext(ReloadContext);

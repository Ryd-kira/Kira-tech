import { useEffect, useState } from 'react';
import { api } from './api.js';

// Chargement avec annulation : un changement rapide de filtre n'affiche jamais une réponse périmée.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    const ctrl = new AbortController();
    setState((s) => ({ data: s.data, error: null, loading: true }));
    api(path, { signal: ctrl.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ data: null, error, loading: false }); });
    return () => ctrl.abort();
  }, [path, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

import { useCallback, useEffect, useState } from 'react';

export function usePathname(): string {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname || '/');
    window.addEventListener('popstate', sync);
    window.addEventListener('lismun:navigate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('lismun:navigate', sync);
    };
  }, []);

  return pathname;
}

export function navigate(to: string, replace = false): void {
  if (typeof window === 'undefined') return;
  if (replace) {
    window.history.replaceState({}, '', to);
  } else {
    window.history.pushState({}, '', to);
  }
  window.dispatchEvent(new Event('lismun:navigate'));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function useNavigate() {
  return useCallback((to: string, replace = false) => {
    navigate(to, replace);
  }, []);
}

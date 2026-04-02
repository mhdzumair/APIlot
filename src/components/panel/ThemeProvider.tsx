import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.settings.theme);
  const panelZoom = useSettingsStore((s) => s.settings.panelZoom ?? 1.0);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      // system: detect preference
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', dark);
    }
  }, [theme]);

  useEffect(() => {
    // CSS zoom scales the entire panel content, including DevTools sidebar panels
    (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom =
      String(panelZoom);
    return () => {
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = '';
    };
  }, [panelZoom]);

  return <>{children}</>;
}

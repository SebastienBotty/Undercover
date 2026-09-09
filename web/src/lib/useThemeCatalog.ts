'use client';
import { useEffect, useState } from 'react';

export interface SeriesInfo {
  id: string;
  label: string;
  count: number;
}

export interface ThemeInfo {
  id: string;
  label: string;
  count: number;
  series?: SeriesInfo[];
}

export function useThemeCatalog() {
  const [themes, setThemes] = useState<ThemeInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? '';

    fetch(`${serverUrl}/api/themes`)
      .then((res) => res.json())
      .then((data: { themes: ThemeInfo[] }) => {
        if (!cancelled) setThemes(data.themes);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger la liste des thèmes.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { themes, error };
}

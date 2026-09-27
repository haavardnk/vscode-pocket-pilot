export const THEMES = [
  { id: 'system', label: 'System', color: null },
  { id: 'latte', label: 'Latte', color: '#eff1f5' },
  { id: 'frappe', label: 'Frappé', color: '#303446' },
  { id: 'macchiato', label: 'Macchiato', color: '#24273a' },
  { id: 'mocha', label: 'Mocha', color: '#1e1e2e' }
] as const;

export type ThemeChoice = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'pocket-pilot-theme';
const SYSTEM_COLORS = { light: '#eff1f5', dark: '#1e1e2e' };

function isTheme(value: string | null): value is ThemeChoice {
  return THEMES.some((theme) => theme.id === value);
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  const theme = THEMES.find((candidate) => candidate.id === choice);
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  for (const meta of metas) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = theme?.color ?? SYSTEM_COLORS[scheme];
  }
}

class ThemeStore {
  choice = $state<ThemeChoice>('system');

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    this.choice = isTheme(stored) ? stored : 'system';
  }

  set(choice: ThemeChoice): void {
    this.choice = choice;
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
    apply(choice);
  }
}

export const theme = new ThemeStore();

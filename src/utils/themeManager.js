/**
 * Theme Manager for SACCO Portal
 * Supports 6 dynamic color themes with live CSS variable application and persistence.
 */

export const THEMES = [
  {
    id: 'corporate-blue',
    name: 'Corporate Blue',
    emoji: '🔷',
    primary: '#0a6ed1',
    primaryDark: '#0854a0',
    primaryLight: '#e8f2fc',
    gradient: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
    sidebarBg: '#1c2536',
    accent: '#2563eb',
    previewColor: '#0a6ed1',
    headerGradient: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
  },
  {
    id: 'emerald-green',
    name: 'Emerald Forest',
    emoji: '🌲',
    primary: '#107e3e',
    primaryDark: '#0b5c2d',
    primaryLight: '#e8f7ee',
    gradient: 'linear-gradient(135deg, #114b2d 0%, #16a34a 100%)',
    sidebarBg: '#0f291e',
    accent: '#16a34a',
    previewColor: '#107e3e',
    headerGradient: 'linear-gradient(135deg, #114b2d 0%, #16a34a 100%)',
  },
  {
    id: 'royal-indigo',
    name: 'Royal Indigo',
    emoji: '💜',
    primary: '#6366f1',
    primaryDark: '#4f46e5',
    primaryLight: '#eef2ff',
    gradient: 'linear-gradient(135deg, #312e81 0%, #6366f1 100%)',
    sidebarBg: '#1e1b4b',
    accent: '#818cf8',
    previewColor: '#6366f1',
    headerGradient: 'linear-gradient(135deg, #312e81 0%, #6366f1 100%)',
  },
  {
    id: 'amber-gold',
    name: 'Warm Amber',
    emoji: '🌅',
    primary: '#d97706',
    primaryDark: '#b45309',
    primaryLight: '#fffbeb',
    gradient: 'linear-gradient(135deg, #78350f 0%, #d97706 100%)',
    sidebarBg: '#2a1a05',
    accent: '#f59e0b',
    previewColor: '#d97706',
    headerGradient: 'linear-gradient(135deg, #78350f 0%, #d97706 100%)',
  },
  {
    id: 'crimson-ruby',
    name: 'Crimson Ruby',
    emoji: '🔴',
    primary: '#be123c',
    primaryDark: '#9f1239',
    primaryLight: '#fff1f2',
    gradient: 'linear-gradient(135deg, #4c0519 0%, #be123c 100%)',
    sidebarBg: '#270811',
    accent: '#e11d48',
    previewColor: '#be123c',
    headerGradient: 'linear-gradient(135deg, #4c0519 0%, #be123c 100%)',
  },
  {
    id: 'dark-obsidian',
    name: 'Dark Obsidian',
    emoji: '🌑',
    primary: '#38bdf8',
    primaryDark: '#0284c7',
    primaryLight: '#0f172a',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    sidebarBg: '#080d17',
    accent: '#38bdf8',
    previewColor: '#1e293b',
    headerGradient: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
  },
];

export const getStoredTheme = () => {
  const saved = localStorage.getItem('sacco_color_theme');
  return THEMES.find((t) => t.id === saved) || THEMES[0];
};

const hexToRgb = (hex) => {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
};

export const applyColorTheme = (themeId) => {
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  localStorage.setItem('sacco_color_theme', theme.id);

  const root = document.documentElement;
  root.style.setProperty('--cui-primary', theme.primary);
  root.style.setProperty('--cui-primary-rgb', hexToRgb(theme.primary));
  root.style.setProperty('--app-primary', theme.primary);
  root.style.setProperty('--app-primary-dark', theme.primaryDark);
  root.style.setProperty('--app-primary-light', theme.primaryLight);
  root.style.setProperty('--app-primary-gradient', theme.gradient);
  root.style.setProperty('--cui-sidebar-bg', theme.sidebarBg);
  root.style.setProperty('--app-sidebar-bg', theme.sidebarBg);
  root.style.setProperty('--app-accent', theme.accent);
  root.style.setProperty('--app-header-gradient', theme.headerGradient);

  // Broadcast event for reactive UI components
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: theme }));
  return theme;
};

/**
 * Theme & Design System Tokens — Premium Clean Light Theme
 */
export const Colors = {
  // Brand
  primary: '#4F46E5',        // Deep Indigo
  primaryLight: '#818CF8',
  primaryDark: '#3730A3',
  primaryBg: '#EEF2FF',

  secondary: '#10B981',      // Emerald Green (WhatsApp / Success)
  secondaryLight: '#34D399',
  secondaryDark: '#059669',
  secondaryBg: '#D1FAE5',

  accent: '#F43F5E',         // Rose / Alert
  accentLight: '#FB7185',
  accentBg: '#FFE4E6',

  // Surfaces & Backgrounds
  background: '#F8FAFC',     // Clean slate-50
  surface: '#FFFFFF',        // Pure white card
  surfaceElevated: '#FFFFFF',

  // Text
  text: '#0F172A',           // Slate-900 (High contrast)
  textSecondary: '#475569',  // Slate-600
  textMuted: '#94A3B8',      // Slate-400
  textOnPrimary: '#FFFFFF',

  // Borders & Dividers
  border: '#E2E8F0',         // Slate-200
  borderLight: '#F1F5F9',    // Slate-100

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  error: '#EF4444',
  errorBg: '#FEE2E2',
  info: '#3B82F6',
  infoBg: '#DBEAFE',

  // Gradients
  gradientStart: '#4F46E5',
  gradientEnd: '#10B981',

  // Category Colors (Soft vibrant palette)
  categories: {
    rent: '#F43F5E',
    lunch: '#F59E0B',
    food: '#FB923C',
    grocery: '#10B981',
    transport: '#6366F1',
    entertainment: '#EC4899',
    shopping: '#8B5CF6',
    online_shopping: '#F97316',
    grooming: '#E11D48',
    health: '#14B8A6',
    education: '#0EA5E9',
    other: '#64748B',
  } as Record<string, string>,
};

export const Fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    title: 22,
    xl: 20,
    xxl: 24,
    hero: 32,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  full: 9999,
};

export const Shadows = {
  small: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  large: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
};

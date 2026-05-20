import { Dimensions, PixelRatio } from 'react-native';

export const colors = {
  primary: '#00236f',
  primaryContainer: '#1a3a8f',
  primaryFixed: '#dce1ff',
  primaryFixedDim: '#b5c4ff',
  inversePrimary: '#b5c4ff',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#91a9ff',
  onPrimaryFixed: '#00164e',
  onPrimaryFixedVariant: '#224095',

  secondary: '#006398',
  secondaryContainer: '#64bafe',
  secondaryFixed: '#cce5ff',
  secondaryFixedDim: '#93ccff',
  onSecondary: '#ffffff',
  onSecondaryContainer: '#004971',
  onSecondaryFixed: '#001d31',
  onSecondaryFixedVariant: '#004b73',

  tertiary: '#4e1a00',
  tertiaryContainer: '#722a00',
  tertiaryFixed: '#ffdbcc',
  tertiaryFixedDim: '#ffb595',
  onTertiary: '#ffffff',
  onTertiaryContainer: '#fa9261',
  onTertiaryFixed: '#351000',
  onTertiaryFixedVariant: '#7a3005',

  surface: '#f7f9ff',
  background: '#f7f9ff',
  surfaceBright: '#f7f9ff',
  surfaceDim: '#d7dae1',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f1f4fb',
  surfaceContainer: '#ebeef5',
  surfaceContainerHigh: '#e5e8ef',
  surfaceContainerHighest: '#dfe2e9',
  surfaceVariant: '#dfe2e9',
  surfaceTint: '#3d59af',

  onSurface: '#181c21',
  onSurfaceVariant: '#444652',
  onBackground: '#181c21',
  inverseSurface: '#2d3136',
  inverseOnSurface: '#eef1f8',

  outline: '#757683',
  outlineVariant: '#c4c5d3',

  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onError: '#ffffff',
  onErrorContainer: '#93000a',

  success: '#16a34a',
  successContainer: '#dcfce7',
  warning: '#f59e0b',
  warningContainer: '#fef3c7',
};

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
};

const { width } = Dimensions.get('window');

export const isTablet = width >= 768;

export const responsive = {
  isTablet,
  width,
  scale: (size: number) => PixelRatio.roundToNearestPixel(size),
  hPadding: isTablet ? 32 : 20,
};

export const typography = {
  display: { fontSize: isTablet ? 40 : 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  h1: { fontSize: isTablet ? 32 : 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: isTablet ? 26 : 22, fontWeight: '700' as const, letterSpacing: -0.2 },
  h3: { fontSize: isTablet ? 20 : 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyBold: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  labelSm: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 1.5, textTransform: 'uppercase' as const },
};

export const shadows = {
  card: {
    shadowColor: '#181c21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  cardHover: {
    shadowColor: '#00236f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  fab: {
    shadowColor: '#00236f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
};

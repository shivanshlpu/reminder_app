/**
 * Responsive Layout Hook
 * Provides screen width breakpoints and layout helpers for multi-device responsiveness
 * (Mobile phones, tablets, and desktop/laptop screens).
 */
import { useWindowDimensions } from 'react-native';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();

  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const isWide = width >= 768; // Laptop or Tablet

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    columnCount: isDesktop ? 3 : isTablet ? 2 : 1,
    contentPadding: isMobile ? 16 : 24,
  };
}

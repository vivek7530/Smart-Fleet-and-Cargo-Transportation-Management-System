'use client';

import { useTheme } from '@/components/theme-provider';

/**
 * Explicit palettes rather than CSS variables: Recharts writes colours into SVG
 * presentation attributes, and concrete values keep rendering predictable.
 */
const LIGHT = {
  revenue: '#E2601E',
  expenses: '#52525B',
  profit: '#0E9F6E',
  trips: '#2563EB',
  fuel: '#F59E0B',
  maintenance: '#7C3AED',
  driverExpenses: '#DB2777',
  transportation: '#0D9488',
  grid: '#E9E9EC',
  axis: '#71717A',
  tooltipBg: '#ffffff',
  tooltipBorder: '#E4E4E7',
  tooltipText: '#09090B',
};

const DARK = {
  revenue: '#FF8A47',
  expenses: '#A1A1AA',
  profit: '#34D399',
  trips: '#60A5FA',
  fuel: '#FBBF24',
  maintenance: '#A78BFA',
  driverExpenses: '#F472B6',
  transportation: '#2DD4BF',
  grid: '#232327',
  axis: '#8E8E96',
  tooltipBg: '#18181B',
  tooltipBorder: '#2E2E33',
  tooltipText: '#F4F4F5',
};

export type ChartPalette = typeof LIGHT;

export function useChartPalette(): ChartPalette {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark' ? DARK : LIGHT;
}

/** Ordered colours for categorical series such as the expense donut. */
export function categoricalColors(palette: ChartPalette): string[] {
  return [
    palette.fuel,
    palette.maintenance,
    palette.driverExpenses,
    palette.transportation,
    palette.revenue,
    palette.trips,
    palette.profit,
    palette.expenses,
  ];
}

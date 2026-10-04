'use client';

import { useTheme } from '@/components/theme-provider';

/**
 * Explicit palettes rather than CSS variables: Recharts writes colours into SVG
 * presentation attributes, and concrete values keep rendering predictable.
 */
const LIGHT = {
  revenue: '#4f46e5',
  expenses: '#f97316',
  profit: '#059669',
  trips: '#0ea5e9',
  fuel: '#f59e0b',
  maintenance: '#8b5cf6',
  driverExpenses: '#ec4899',
  transportation: '#14b8a6',
  grid: '#e6e8ee',
  axis: '#8a90a2',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e5ec',
  tooltipText: '#1b1f2a',
};

const DARK = {
  revenue: '#818cf8',
  expenses: '#fb923c',
  profit: '#34d399',
  trips: '#38bdf8',
  fuel: '#fbbf24',
  maintenance: '#a78bfa',
  driverExpenses: '#f472b6',
  transportation: '#2dd4bf',
  grid: '#242938',
  axis: '#7b8296',
  tooltipBg: '#161a24',
  tooltipBorder: '#2a3040',
  tooltipText: '#e8eaf0',
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

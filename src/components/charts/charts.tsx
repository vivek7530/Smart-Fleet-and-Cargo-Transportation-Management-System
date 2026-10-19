'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, humanise } from '@/lib/utils';
import { formatCurrency, formatCurrencyCompact, formatNumber } from '@/lib/format';
import type { SeriesPoint } from '@/lib/types';
import { categoricalColors, useChartPalette, type ChartPalette } from './chart-theme';
import { EmptyState } from '@/components/ui/empty-state';

interface TooltipEntry {
  name?: string;
  dataKey?: string | number;
  value?: number;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  palette,
  formatter = formatCurrency,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  palette: ChartPalette;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="min-w-36 rounded-lg border px-3 py-2 shadow-pop"
      style={{ background: palette.tooltipBg, borderColor: palette.tooltipBorder, color: palette.tooltipText }}
    >
      <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="font-semibold tabular">{formatter(entry.value ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const axisProps = (palette: ChartPalette) => ({
  stroke: palette.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
});

/** Revenue vs expenses with the profit line on top. */
export function RevenueExpenseChart({ data, height = 300 }: { data: SeriesPoint[]; height?: number }) {
  const palette = useChartPalette();
  if (!data.length) return <ChartEmpty />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.revenue} stopOpacity={0.32} />
            <stop offset="100%" stopColor={palette.revenue} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.expenses} stopOpacity={0.26} />
            <stop offset="100%" stopColor={palette.expenses} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} stroke={palette.grid} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axisProps(palette)} tickMargin={10} />
        <YAxis {...axisProps(palette)} tickFormatter={(value) => formatCurrencyCompact(value)} width={62} />
        <Tooltip content={<ChartTooltip palette={palette} />} cursor={{ stroke: palette.grid }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 12, color: palette.axis }}
        />

        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={palette.revenue}
          strokeWidth={2}
          fill="url(#fillRevenue)"
        />
        <Area
          type="monotone"
          dataKey="expenses"
          name="Expenses"
          stroke={palette.expenses}
          strokeWidth={2}
          fill="url(#fillExpenses)"
        />
        <Line
          type="monotone"
          dataKey="profit"
          name="Profit"
          stroke={palette.profit}
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 4"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Stacked breakdown of every expense bucket over time. */
export function ExpenseBreakdownChart({ data, height = 300 }: { data: SeriesPoint[]; height?: number }) {
  const palette = useChartPalette();
  if (!data.length) return <ChartEmpty />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={palette.grid} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axisProps(palette)} tickMargin={10} />
        <YAxis {...axisProps(palette)} tickFormatter={(value) => formatCurrencyCompact(value)} width={62} />
        <Tooltip
          content={<ChartTooltip palette={palette} />}
          cursor={{ fill: palette.grid, fillOpacity: 0.35 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />

        <Bar dataKey="fuelExpenses" name="Fuel" stackId="expenses" fill={palette.fuel} radius={[0, 0, 0, 0]} />
        <Bar dataKey="maintenanceExpenses" name="Maintenance" stackId="expenses" fill={palette.maintenance} />
        <Bar dataKey="driverExpenses" name="Driver expenses" stackId="expenses" fill={palette.driverExpenses} />
        <Bar
          dataKey="transportationCosts"
          name="Trip costs"
          stackId="expenses"
          fill={palette.transportation}
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Trip volume per bucket. */
export function TripsChart({ data, height = 260 }: { data: SeriesPoint[]; height?: number }) {
  const palette = useChartPalette();
  if (!data.length) return <ChartEmpty />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={palette.grid} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axisProps(palette)} tickMargin={10} />
        <YAxis {...axisProps(palette)} allowDecimals={false} width={36} />
        <Tooltip
          content={<ChartTooltip palette={palette} formatter={formatNumber} />}
          cursor={{ fill: palette.grid, fillOpacity: 0.35 }}
        />
        <Bar dataKey="trips" name="Trips" fill={palette.trips} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut used for cost composition and fleet status. */
export function DonutChart({
  data,
  height = 260,
  valueFormatter = formatCurrency,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[];
  height?: number;
  valueFormatter?: (value: number) => string;
  centerLabel?: string;
  centerValue?: string;
}) {
  const palette = useChartPalette();
  const colors = categoricalColors(palette);
  const filtered = data.filter((entry) => entry.value > 0);

  if (!filtered.length) return <ChartEmpty />;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {filtered.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip palette={palette} formatter={valueFormatter} />} />
          <Legend
            iconType="circle"
            iconSize={8}
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {centerValue ? (
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center"
          style={{ top: height * 0.32 }}
        >
          <span className="text-lg font-semibold tabular">{centerValue}</span>
          {centerLabel ? <span className="text-2xs text-muted-foreground">{centerLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Tiny inline trend line used inside KPI cards. */
export function Sparkline({
  data,
  dataKey,
  tone = 'revenue',
  height = 40,
}: {
  data: SeriesPoint[];
  dataKey: keyof SeriesPoint;
  tone?: keyof ChartPalette;
  height?: number;
}) {
  const palette = useChartPalette();
  if (data.length < 2) return null;
  const color = palette[tone] as string;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey as string}
          stroke={color}
          strokeWidth={1.75}
          fill={`url(#spark-${String(dataKey)})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for leaderboards (top drivers, trucks, routes). */
export function RankedBars({
  items,
  className,
}: {
  items: { label: string; value: number; secondary?: string }[];
  className?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  if (!items.length) return <ChartEmpty compact />;

  return (
    <ul className={cn('space-y-3', className)}>
      {items.map((item) => (
        <li key={item.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium">{item.label}</span>
            <span className="shrink-0 tabular text-muted-foreground">
              {item.secondary ? <span className="mr-2 text-2xs">{item.secondary}</span> : null}
              {formatCurrency(item.value)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChartEmpty({ compact }: { compact?: boolean }) {
  return (
    <EmptyState
      compact
      title="No data for this period"
      description={compact ? undefined : 'Try widening the date range to see activity here.'}
      className={compact ? 'py-6' : undefined}
    />
  );
}

export { humanise };

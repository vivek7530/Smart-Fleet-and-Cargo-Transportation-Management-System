'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, X } from '@/components/icons';
import { cn, humanise } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/misc';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** Keeps the control on the toolbar instead of inside the filter popover. */
  primary?: boolean;
}

/** Turns an enum tuple into `[{ label: 'In transit', value: 'IN_TRANSIT' }]`. */
export function optionsFrom(values: readonly string[], allLabel = 'All'): FilterOption[] {
  return [{ label: allLabel, value: 'ALL' }, ...values.map((value) => ({ label: humanise(value), value }))];
}

interface ListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  /** Date range filter, rendered inside the filter popover. */
  dateRange?: { from: string; to: string; onChange: (range: { from: string; to: string }) => void };
  actions?: React.ReactNode;
  total?: number;
  loadedCount?: number;
  className?: string;
}

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  dateRange,
  actions,
  total,
  loadedCount,
  className,
}: ListToolbarProps) {
  const primaryFilters = filters.filter((filter) => filter.primary);
  const extraFilters = filters.filter((filter) => !filter.primary);

  const activeCount =
    filters.filter((filter) => filter.value && filter.value !== 'ALL').length +
    (dateRange?.from || dateRange?.to ? 1 : 0);

  const clearAll = () => {
    for (const filter of filters) filter.onChange('ALL');
    dateRange?.onChange({ from: '', to: '' });
    onSearchChange('');
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            startIcon={<Search />}
            endIcon={
              search ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="rounded p-0.5 transition-colors hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X />
                </button>
              ) : undefined
            }
            aria-label={searchPlaceholder}
          />
        </div>

        {primaryFilters.map((filter) => (
          <Select key={filter.key} value={filter.value || 'ALL'} onValueChange={filter.onChange}>
            <SelectTrigger className="h-9 w-auto min-w-[8.5rem] gap-1.5" aria-label={filter.label}>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.value === 'ALL' ? filter.label : option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {extraFilters.length > 0 || dateRange ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="default" className="gap-2">
                <SlidersHorizontal />
                Filters
                {activeCount > 0 ? (
                  <Badge variant="default" size="sm">
                    {activeCount}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[13px] font-semibold">Filters</h4>
                {activeCount > 0 ? (
                  <Button variant="ghost" size="xs" onClick={clearAll}>
                    Reset
                  </Button>
                ) : null}
              </div>

              {extraFilters.map((filter) => (
                <div key={filter.key} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{filter.label}</label>
                  <Select value={filter.value || 'ALL'} onValueChange={filter.onChange}>
                    <SelectTrigger size="sm">
                      <SelectValue placeholder={filter.label} />
                    </SelectTrigger>
                    <SelectContent>
                      {filter.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              {dateRange ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Date range</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={dateRange.from}
                      max={dateRange.to || undefined}
                      onChange={(event) => dateRange.onChange({ ...dateRange, from: event.target.value })}
                      className="h-8 text-[13px]"
                      aria-label="From date"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={dateRange.to}
                      min={dateRange.from || undefined}
                      onChange={(event) => dateRange.onChange({ ...dateRange, to: event.target.value })}
                      className="h-8 text-[13px]"
                      aria-label="To date"
                    />
                  </div>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : null}

        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>

      {(activeCount > 0 || search) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {loadedCount !== undefined && total !== undefined
              ? `Showing ${loadedCount} of ${total}`
              : total !== undefined
                ? `${total} records`
                : null}
          </span>
          {filters
            .filter((filter) => filter.value && filter.value !== 'ALL')
            .map((filter) => (
              <Badge key={filter.key} variant="outline" className="gap-1">
                {filter.label}: {filter.options.find((o) => o.value === filter.value)?.label ?? filter.value}
                <button
                  type="button"
                  onClick={() => filter.onChange('ALL')}
                  className="ml-0.5 rounded-full transition-colors hover:text-foreground"
                  aria-label={`Clear ${filter.label} filter`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          <Button variant="ghost" size="xs" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

/** Consistent page title block used at the top of every screen. */
export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

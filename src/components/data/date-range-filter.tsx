'use client';

import * as React from 'react';
import { CalendarDays } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type RangePreset = 'today' | 'week' | 'month' | 'last-month' | 'year' | 'all' | 'custom';

export interface RangeValue {
  preset: RangePreset;
  from?: string;
  to?: string;
}

const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  'last-month': 'Last month',
  year: 'This year',
  all: 'All time',
  custom: 'Custom range',
};

/** Date range control shared by the dashboard, analytics and reports. */
export function DateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ from: value.from ?? '', to: value.to ?? '' });

  const applyCustom = () => {
    if (!draft.from && !draft.to) return;
    onChange({ preset: 'custom', from: draft.from || undefined, to: draft.to || undefined });
    setOpen(false);
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Select
          value={value.preset}
          onValueChange={(preset) => {
            if (preset === 'custom') {
              setOpen(true);
              return;
            }
            onChange({ preset: preset as RangePreset });
          }}
        >
          <SelectTrigger className="w-auto min-w-[9.5rem] gap-2" aria-label="Date range">
            <CalendarDays className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(PRESET_LABELS) as RangePreset[]).map((preset) => (
              <SelectItem key={preset} value={preset}>
                {PRESET_LABELS[preset]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={value.preset === 'custom' ? 'subtle' : 'outline'}
              size="icon"
              aria-label="Choose a custom date range"
            >
              <CalendarDays />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3">
            <h4 className="text-[13px] font-semibold">Custom range</h4>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="range-from">
                  From
                </label>
                <Input
                  id="range-from"
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(event) => setDraft((prev) => ({ ...prev, from: event.target.value }))}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="range-to">
                  To
                </label>
                <Input
                  id="range-to"
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(event) => setDraft((prev) => ({ ...prev, to: event.target.value }))}
                  className="h-8"
                />
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={applyCustom} disabled={!draft.from && !draft.to}>
              Apply range
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/** Converts the control's value into API query parameters. */
export function rangeParams(value: RangeValue) {
  return {
    preset: value.preset,
    from: value.preset === 'custom' ? value.from : undefined,
    to: value.preset === 'custom' ? value.to : undefined,
  };
}

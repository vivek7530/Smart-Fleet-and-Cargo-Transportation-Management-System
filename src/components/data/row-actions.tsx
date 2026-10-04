'use client';

import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  /** Inserts a divider above this entry. */
  separatorBefore?: boolean;
  hidden?: boolean;
}

/** The "…" menu shown at the end of every list row. */
export function RowActions({ actions, label = 'Row actions' }: { actions: RowAction[]; label?: string }) {
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {visible.map((action, index) => (
          <React.Fragment key={action.label}>
            {action.separatorBefore && index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={action.variant}
              disabled={action.disabled}
              onSelect={(event) => {
                event.preventDefault();
                action.onSelect();
              }}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

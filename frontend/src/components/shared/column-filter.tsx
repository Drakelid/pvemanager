import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Column, FilterFn, RowData } from '@tanstack/react-table';
import { ListFilter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Filter metadata declared per-column via columnDef.meta
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    filter?: 'text' | 'select';
    formatOption?: (value: string) => string;
  }
}

/**
 * Multi-select filter: keeps the row when its (single string) cell value is one
 * of the selected values. Built-in arrIncludesSome expects array cells, so we
 * provide our own. Empty selection passes everything.
 */
export const multiSelectFilter: FilterFn<unknown> = (row, columnId, value: string[]) => {
  if (!value?.length) return true;
  return value.includes(String(row.getValue(columnId)));
};

interface ColumnFilterProps<TData> {
  column: Column<TData, unknown>;
  /** "text" → contains input; "select" → checklist of unique values */
  variant?: 'text' | 'select';
  /** Optional label→value formatter for select options */
  formatOption?: (value: string) => string;
}

/**
 * Funnel-style per-column filter popover for TanStack tables.
 * Text columns filter by substring (filterFn "includesString").
 * Select columns filter by a set of values (filterFn "arrIncludesSome").
 */
export function ColumnFilter<TData>({ column, variant = 'text', formatOption }: ColumnFilterProps<TData>) {
  const { t } = useTranslation();
  const filterValue = column.getFilterValue();
  const isActive =
    variant === 'select'
      ? Array.isArray(filterValue) && filterValue.length > 0
      : !!filterValue;

  const uniqueValues = useMemo(() => {
    if (variant !== 'select') return [];
    return Array.from(column.getFacetedUniqueValues().keys())
      .filter((v): v is string => v != null && String(v).length > 0)
      .map(String)
      .sort();
  }, [variant, column]);

  const selected = (Array.isArray(filterValue) ? filterValue : []) as string[];

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    column.setFilterValue(next.length ? next : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', isActive && 'text-amber-500')}
          />
        }
      >
        <ListFilter className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        {variant === 'text' ? (
          <div className="space-y-2">
            <Input
              autoFocus
              placeholder={t('common.filter', 'Filter…')}
              value={(filterValue as string) ?? ''}
              onChange={(e) => column.setFilterValue(e.target.value || undefined)}
              className="h-8"
            />
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start text-xs text-muted-foreground"
                onClick={() => column.setFilterValue(undefined)}
              >
                <X className="mr-1 h-3 w-3" /> {t('common.reset', 'Reset')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="max-h-60 space-y-0.5 overflow-y-auto">
              {uniqueValues.length === 0 && (
                <span className="px-1 text-xs text-muted-foreground">—</span>
              )}
              {uniqueValues.map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={selected.includes(value)}
                    onChange={() => toggle(value)}
                  />
                  <span className="truncate">{formatOption ? formatOption(value) : value}</span>
                </label>
              ))}
            </div>
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start text-xs text-muted-foreground"
                onClick={() => column.setFilterValue(undefined)}
              >
                <X className="mr-1 h-3 w-3" /> {t('common.reset', 'Reset')}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

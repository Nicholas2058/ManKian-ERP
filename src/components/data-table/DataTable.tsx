import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type Row,
} from '@tanstack/react-table';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { cn, downloadText } from '@/lib/utils';
import { Button, EmptyState, Input } from '@/components/ui/core';
import { Menu, MenuItem, MenuLabel, MenuSep } from '@/components/ui/overlay';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Download, Search, Star, Trash, Check } from '@/components/ui/icons';
import { useSession } from '@/store/session';
import { toast } from 'sonner';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    align?: 'right' | 'center';
    csv?: (row: TData) => string | number;
    className?: string;
    hideOnMobile?: boolean;
    _v?: TValue;
  }
}

export interface DataTableProps<T> {
  id: string;
  data: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
  mobileCard?: (row: T) => React.ReactNode;
  toolbar?: React.ReactNode;
  searchPlaceholder?: string;
  initialSorting?: SortingState;
  pageSize?: number;
  empty?: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
  exportName?: string;
  dense?: boolean;
  hideSearch?: boolean;
  /** When set, only these column ids are shown (e.g. compact master/detail mode). */
  visibleColumns?: string[];
  minWidth?: number;
}

function globalFilterFn<T>(row: Row<T>, _columnId: string, filter: string) {
  if (!filter) return true;
  const hay = row.getAllCells().map((c) => {
    const v = c.getValue();
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  }).join(' ').toLowerCase();
  return filter.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
}

export function DataTable<T>({ id, data, columns, getRowId, onRowClick, mobileCard, toolbar, searchPlaceholder = 'Search…', initialSorting = [], pageSize = 12, empty, rowClassName, exportName, dense, hideSearch, visibleColumns, minWidth = 640 }: DataTableProps<T>) {
  const setSession = useSession((s) => s.set);
  const allViews = useSession((s) => s.savedViews);
  const views = React.useMemo(() => allViews.filter((v) => v.table === id), [allViews, id]);
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [visibility, setVisibility] = React.useState<VisibilityState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize });
  const density = useSession((s) => s.density);

  const table = useReactTable({
    data,
    columns,
    getRowId: getRowId ? (r) => getRowId(r) : undefined,
    state: {
      sorting,
      globalFilter,
      columnVisibility: visibleColumns ? Object.fromEntries(columns.map((c) => [c.id ?? '', visibleColumns.includes(c.id ?? '')])) : visibility,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setVisibility,
    onPaginationChange: setPagination,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [globalFilter, data.length]);

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const compact = dense || density === 'compact';

  const saveView = () => {
    const name = window.prompt('Name this view', `View ${views.length + 1}`);
    if (!name) return;
    const hidden = Object.entries(visibility).filter(([, v]) => !v).map(([k]) => k);
    setSession({ savedViews: [...allViews, { id: `${id}_${Date.now()}`, table: id, name, state: { globalFilter, sorting, hidden } }] });
    toast.success(`Saved view "${name}"`);
  };
  const applyView = (vid: string) => {
    const v = views.find((x) => x.id === vid);
    if (!v) return;
    setGlobalFilter(v.state.globalFilter ?? '');
    setSorting(v.state.sorting ?? []);
    setVisibility(Object.fromEntries((v.state.hidden ?? []).map((h) => [h, false])));
  };
  const exportCsv = () => {
    const cols = table.getAllLeafColumns().filter((c) => c.getIsVisible() && c.id !== 'actions');
    const out = table.getFilteredRowModel().rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const c of cols) {
        const header = typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id;
        o[header] = c.columnDef.meta?.csv ? c.columnDef.meta.csv(r.original) : (r.getValue(c.id) as unknown);
      }
      return o;
    });
    downloadText(`${exportName ?? id}-${new Date().toISOString().slice(0, 10)}.csv`, Papa.unparse(out), 'text/csv');
    toast.success(`Exported ${out.length} rows to CSV`);
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {!hideSearch && (
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="pl-9" aria-label="Search table" />
          </div>
        )}
        <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tabular hidden text-xs text-muted sm:inline">{filteredCount.toLocaleString()} rows</span>
          <Menu
            trigger={
              <Button variant="outline" size="sm" aria-label="Saved views">
                <Star className="size-4" /> <span className="hidden sm:inline">Views</span>
                <ChevronDown className="size-3.5" />
              </Button>
            }
          >
            <MenuLabel>Saved views</MenuLabel>
            {views.length === 0 && <div className="px-2.5 py-1.5 text-xs text-muted">No saved views yet</div>}
            {views.map((v) => (
              <MenuItem key={v.id} onSelect={() => applyView(v.id)} hint={<span role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setSession({ savedViews: allViews.filter((x) => x.id !== v.id) }); }}><Trash className="size-3.5" /></span>}>
                {v.name}
              </MenuItem>
            ))}
            <MenuSep />
            <MenuItem icon={<Star className="size-4" />} onSelect={saveView}>
              Save current view…
            </MenuItem>
          </Menu>
          <Menu
            trigger={
              <Button variant="outline" size="sm" aria-label="Choose columns">
                <Columns3 className="size-4" />
              </Button>
            }
          >
            <MenuLabel>Columns</MenuLabel>
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide() && typeof c.columnDef.header === 'string')
              .map((c) => (
                <MenuItem key={c.id} onSelect={() => c.toggleVisibility()} icon={c.getIsVisible() ? <Check className="size-4 text-brand" /> : <span className="inline-block size-4" />}>
                  {c.columnDef.header as string}
                </MenuItem>
              ))}
          </Menu>
          <Button variant="outline" size="sm" onClick={exportCsv} aria-label="Export CSV">
            <Download className="size-4" /> <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      </div>

      {filteredCount === 0 ? (
        empty ?? <EmptyState title="No matching records" body="Try a different search or clear the filters." />
      ) : (
        <>
          {mobileCard && (
            <div className="space-y-2 md:hidden">
              <AnimatePresence initial={false}>
                {rows.map((r) => (
                  <motion.div
                    key={r.id}
                    layout="position"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={onRowClick ? () => onRowClick(r.original) : undefined}
                    className={cn('rounded-xl border border-line bg-surface p-3', onRowClick && 'cursor-pointer active:bg-surface-2', rowClassName?.(r.original))}
                  >
                    {mobileCard(r.original)}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
          <div className={cn('scrollbar-thin overflow-x-auto rounded-xl border border-line bg-surface', mobileCard && 'hidden md:block')}>
            <table className="w-full border-collapse text-sm" style={{ minWidth }}>
              <thead className="sticky top-0 z-10 bg-surface-2">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-line">
                    {hg.headers.map((h) => {
                      const sorted = h.column.getIsSorted();
                      const meta = h.column.columnDef.meta;
                      return (
                        <th
                          key={h.id}
                          scope="col"
                          aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                          className={cn('whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted', meta?.align === 'right' && 'text-right', meta?.align === 'center' && 'text-center', meta?.className)}
                        >
                          {h.isPlaceholder ? null : h.column.getCanSort() ? (
                            <button className={cn('inline-flex items-center gap-1 hover:text-ink', meta?.align === 'right' && 'flex-row-reverse')} onClick={h.column.getToggleSortingHandler()}>
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {sorted === 'asc' ? <ChevronDown className="size-3 rotate-180" /> : sorted === 'desc' ? <ChevronDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={onRowClick ? () => onRowClick(r.original) : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r.original); } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn('border-b border-line/70 last:border-0 transition-colors', onRowClick && 'cursor-pointer hover:bg-surface-2 focus:bg-surface-2', rowClassName?.(r.original))}
                  >
                    {r.getVisibleCells().map((c) => {
                      const meta = c.column.columnDef.meta;
                      return (
                        <td key={c.id} className={cn('px-3 align-middle text-ink', compact ? 'py-1.5' : 'py-2.5', meta?.align === 'right' && 'tabular text-right', meta?.align === 'center' && 'text-center', meta?.className)}>
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="tabular">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <div className="flex items-center gap-1">
                <select
                  className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs"
                  value={table.getState().pagination.pageSize}
                  onChange={(e) => table.setPageSize(Number(e.target.value))}
                  aria-label="Rows per page"
                >
                  {[12, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

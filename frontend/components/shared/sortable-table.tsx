"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared client-side sorting for plain <table> lists.
//
// Usage:
//   const [sort, toggleSort] = useSortState<Key>({ key: "created_at", direction: "desc" });
//   const rows = useSortedRows(data, sort, { created_at: (r) => r.created_at, ... });
//   <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={toggleSort} />
// ---------------------------------------------------------------------------

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export type SortValue = string | number | boolean | Date | null | undefined;

export type SortAccessors<T, K extends string> = Record<K, (row: T) => SortValue>;

function normalize(value: SortValue): string | number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/** Compare two values. Nulls always sort last regardless of direction. */
export function compareSortValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  const x = normalize(a);
  const y = normalize(b);
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  let result: number;
  if (typeof x === "number" && typeof y === "number") {
    result = x - y;
  } else {
    result = String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
  }
  return direction === "asc" ? result : -result;
}

export function useSortState<K extends string>(
  initial: SortState<K>,
): [SortState<K>, (key: K) => void] {
  const [sort, setSort] = useState<SortState<K>>(initial);
  function toggle(key: K) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }
  return [sort, toggle];
}

export function useSortedRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  accessors: SortAccessors<T, K>,
): T[] {
  return useMemo(() => {
    const accessor = accessors[sort.key];
    if (!accessor) return rows;
    return [...rows].sort((a, b) => compareSortValues(accessor(a), accessor(b), sort.direction));
  }, [rows, sort, accessors]);
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn("font-medium", className)}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </th>
  );
}

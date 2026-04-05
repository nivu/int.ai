"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, Search } from "lucide-react";
import CompareButton from "@/components/admin/compare-button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplicationStatus =
  | "applied"
  | "screened"
  | "interview_sent"
  | "interviewed"
  | "shortlisted"
  | "rejected";

export interface ApplicationRecord {
  id: string;
  hiring_post_id: string;
  candidate_id: string;
  status: ApplicationStatus;
  embedding_score: number | null;
  skill_match_score: number | null;
  experience_match_score: number | null;
  culture_match_score: number | null;
  overall_score: number | null;
  created_at: string;
  candidate: {
    id: string;
    full_name: string;
    email: string;
  };
  resume_data: {
    current_role: string | null;
    experience_years: number | null;
    skills: string[];
  } | null;
  // optional: present when showing all-candidates view
  hiring_post?: {
    id: string;
    title: string;
  };
}

export interface CandidateTableProps {
  data: ApplicationRecord[];
  hiringPostId?: string;
}

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const statusConfig: Record<
  ApplicationStatus,
  { label: string; className: string }
> = {
  applied: {
    label: "Applied",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  screened: {
    label: "Screened",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  interview_sent: {
    label: "Interview Sent",
    className:
      "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  interviewed: {
    label: "Interviewed",
    className:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  },
  shortlisted: {
    label: "Shortlisted",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scorePercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value)}%`;
}

function overallScoreColor(value: number | null | undefined): string {
  if (value == null) return "text-muted-foreground";
  if (value > 70) return "text-green-600 dark:text-green-400";
  if (value >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: { toggleSorting: (desc?: boolean) => void };
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
      onClick={() => column.toggleSorting()}
    >
      {label}
      <ArrowUpDown className="size-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function buildColumns(
  showJobColumn: boolean,
): ColumnDef<ApplicationRecord, unknown>[] {
  const cols: ColumnDef<ApplicationRecord, unknown>[] = [
    // Select checkbox
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          className="size-4 rounded border-gray-300 accent-primary"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="size-4 rounded border-gray-300 accent-primary"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
      enableSorting: false,
      size: 40,
    },
    // Name
    {
      id: "name",
      accessorFn: (row) => row.candidate?.full_name ?? "",
      header: ({ column }) => <SortableHeader label="Name" column={column} />,
      cell: ({ getValue }) => (
        <span className="font-medium">{getValue<string>()}</span>
      ),
    },
    // Email
    {
      id: "email",
      accessorFn: (row) => row.candidate?.email ?? "",
      header: ({ column }) => <SortableHeader label="Email" column={column} />,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue<string>()}</span>
      ),
    },
  ];

  // Optionally show the job column when viewing all candidates
  if (showJobColumn) {
    cols.push({
      id: "job",
      accessorFn: (row) => row.hiring_post?.title ?? "",
      header: ({ column }) => <SortableHeader label="Job" column={column} />,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-sm">
          {getValue<string>()}
        </span>
      ),
    });
  }

  cols.push(
    // Current Role
    {
      id: "current_role",
      accessorFn: (row) => row.resume_data?.current_role ?? "",
      header: "Current Role",
      cell: ({ getValue }) => getValue<string>() || "—",
    },
    // Experience
    {
      id: "experience",
      accessorFn: (row) => row.resume_data?.experience_years ?? null,
      header: ({ column }) => (
        <SortableHeader label="Experience" column={column} />
      ),
      cell: ({ getValue }) => {
        const v = getValue<number | null>();
        return v != null ? `${v} yrs` : "—";
      },
    },
    // Key Skills
    {
      id: "skills",
      accessorFn: (row) => row.resume_data?.skills ?? [],
      header: "Key Skills",
      cell: ({ getValue }) => {
        const skills = getValue<string[]>();
        if (!skills || skills.length === 0) return "—";
        const shown = skills.slice(0, 3);
        const remaining = skills.length - 3;
        return (
          <div className="flex flex-wrap gap-1">
            {shown.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">
                {s}
              </Badge>
            ))}
            {remaining > 0 && (
              <span className="text-xs text-muted-foreground">
                +{remaining}
              </span>
            )}
          </div>
        );
      },
      enableSorting: false,
    },
    // Embedding Score
    {
      id: "embedding_score",
      accessorKey: "embedding_score",
      header: ({ column }) => (
        <SortableHeader label="Embedding" column={column} />
      ),
      cell: ({ getValue }) => (
        <span className="tabular-nums">{scorePercent(getValue<number>())}</span>
      ),
    },
    // Skill Match
    {
      id: "skill_match",
      accessorKey: "skill_match_score",
      header: ({ column }) => (
        <SortableHeader label="Skill Match" column={column} />
      ),
      cell: ({ getValue }) => (
        <span className="tabular-nums">{scorePercent(getValue<number>())}</span>
      ),
    },
    // Experience Match
    {
      id: "experience_match",
      accessorKey: "experience_match_score",
      header: ({ column }) => (
        <SortableHeader label="Exp Match" column={column} />
      ),
      cell: ({ getValue }) => (
        <span className="tabular-nums">{scorePercent(getValue<number>())}</span>
      ),
    },
    // Culture Match
    {
      id: "culture_match",
      accessorKey: "culture_match_score",
      header: ({ column }) => (
        <SortableHeader label="Culture" column={column} />
      ),
      cell: ({ getValue }) => (
        <span className="tabular-nums">{scorePercent(getValue<number>())}</span>
      ),
    },
    // Overall Score
    {
      id: "overall_score",
      accessorKey: "overall_score",
      header: ({ column }) => (
        <SortableHeader label="Overall" column={column} />
      ),
      cell: ({ getValue }) => {
        const v = getValue<number | null>();
        return (
          <span className={`tabular-nums font-semibold ${overallScoreColor(v)}`}>
            {scorePercent(v)}
          </span>
        );
      },
    },
    // Status
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <SortableHeader label="Status" column={column} />,
      cell: ({ getValue }) => {
        const status = getValue<ApplicationStatus>();
        const config = statusConfig[status] ?? statusConfig.applied;
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
          >
            {config.label}
          </span>
        );
      },
    },
  );

  return cols;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CandidateTable({
  data,
  hiringPostId,
}: CandidateTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "overall_score", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const showJobColumn = !hiringPostId;

  const columns = useMemo(() => buildColumns(showJobColumn), [showJobColumn]);

  // Apply status filter
  const filteredData = useMemo(() => {
    if (statusFilter === "all") return data;
    return data.filter((d) => d.status === statusFilter);
  }, [data, statusFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const search = filterValue.toLowerCase();
      const name = (row.original.candidate?.full_name ?? "").toLowerCase();
      const email = (row.original.candidate?.email ?? "").toLowerCase();
      return name.includes(search) || email.includes(search);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
  });

  const selectedCount = Object.keys(rowSelection).length;

  // ---- bulk action handlers (stubs) ----

  function handleBulkAction(action: "send_interview" | "reject" | "shortlist") {
    const selectedIds = Object.keys(rowSelection);
    // TODO: wire to API
    console.log(`Bulk ${action} for:`, selectedIds);
    setRowSelection({});
  }

  // ---- render ----

  return (
    <div className="space-y-4">
      {/* Toolbar: search + status filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="screened">Screened</SelectItem>
            <SelectItem value="interview_sent">Interview Sent</SelectItem>
            <SelectItem value="interviewed">Interviewed</SelectItem>
            <SelectItem value="shortlisted">Shortlisted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedCount} selected
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction("send_interview")}
            >
              Send Interview
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => handleBulkAction("reject")}
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 hover:text-green-700"
              onClick={() => handleBulkAction("shortlist")}
            >
              Advance to Shortlist
            </Button>
            <CompareButton selectedIds={Object.keys(rowSelection)} />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b bg-muted/40 text-left text-muted-foreground"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="whitespace-nowrap px-3 py-2.5 text-xs font-medium"
                    style={{
                      width: header.getSize() !== 150 ? header.getSize() : undefined,
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-muted-foreground"
                >
                  No candidates found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                    idx % 2 === 1 ? "bg-muted/10" : ""
                  } ${row.getIsSelected() ? "bg-primary/5" : ""}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="whitespace-nowrap px-3 py-2.5"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Row count footer */}
      <div className="text-xs text-muted-foreground">
        {table.getFilteredRowModel().rows.length} of {data.length} candidates
      </div>
    </div>
  );
}

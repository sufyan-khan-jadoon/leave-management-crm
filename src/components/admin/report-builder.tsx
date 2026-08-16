"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Table2,
} from "lucide-react";
import { toast } from "sonner";

import { ReportPeoplePicker } from "@/components/admin/report-people-picker";
import { ReportSummary } from "@/components/admin/report-summary";
import { ReportTable } from "@/components/admin/report-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCardSkeleton } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { formatDateTime, toIsoDate, todayUtc } from "@/lib/date";
import {
  describePeopleSelection,
  describeRecordTypes,
  describeReportRefinements,
  peopleSelectionLabel,
  recordTypeLabel,
} from "@/lib/report-labels";
import { MAX_REPORT_RANGE_DAYS } from "@/lib/report-period";
import { cn } from "@/lib/utils";
import type { PeopleSelectionView, ReportPersonView, ReportRecordTypeView, ReportView } from "@/types";

const PERIOD_KINDS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "CUSTOM", label: "Custom range" },
  { value: "DAILY", label: "One day" },
] as const;

type PeriodKind = (typeof PERIOD_KINDS)[number]["value"];

const PEOPLE_OPTIONS: PeopleSelectionView[] = [
  "EVERYONE",
  "ALL_EMPLOYEES",
  "ALL_ADMINS",
  "SELECTED_EMPLOYEES",
  "SELECTED_ADMINS",
];

const RECORD_TYPES: ReportRecordTypeView[] = ["ATTENDANCE", "ABSENT", "LEAVE"];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
  { value: "ON_LEAVE", label: "On leave" },
] as const;

const ROLE_OPTIONS = [
  { value: "ALL", label: "All roles" },
  { value: "EMPLOYEE", label: "Employees" },
  { value: "ADMIN", label: "Administrators" },
] as const;

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, index, 1)),
  ),
}));

/**
 * The three files a generated report can become.
 *
 * One route each rather than a format field, and — the part that matters here —
 * **the same request body posted to all three**. Every one of them re-runs the
 * report through `reportService.generateAll` and renders the document
 * `report-document.ts` builds, so the spreadsheet, the PDF and the CSV hold
 * exactly the rows on screen and describe them in exactly the same words. A file
 * assembled in the browser from what happens to be rendered would be a second
 * implementation of a report that already exists — and it would be page one of
 * it, since the table is paged on the server.
 *
 * The fallback names are only reached if the response arrives without a
 * `Content-Disposition`, which the routes always set; the branded, dated name
 * comes from the server so every copy of one report is named identically.
 */
const EXPORT_FORMATS = {
  xlsx: {
    label: "Export Excel",
    path: "/api/admin/reports/export/xlsx",
    icon: FileSpreadsheet,
    fallback: "Zovencia_Report.xlsx",
  },
  pdf: {
    label: "Download PDF",
    path: "/api/admin/reports/export/pdf",
    icon: FileText,
    fallback: "Zovencia_Report.pdf",
  },
  csv: {
    label: "Export CSV",
    path: "/api/admin/reports/export",
    icon: Table2,
    fallback: "Zovencia_Report.csv",
  },
} as const;

type ExportFormat = keyof typeof EXPORT_FORMATS;

const EXPORT_ORDER: ExportFormat[] = ["xlsx", "pdf", "csv"];

/**
 * Hands a downloaded blob to the browser under the name the server chose.
 *
 * The object URL is released on the next tick rather than immediately: revoking
 * it in the same turn as the click races the download in some browsers, and the
 * file that fails to arrive gives no error to catch.
 */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * What a generated report was generated *from*.
 *
 * Held apart from the draft controls so a report keeps describing what it
 * actually describes after somebody starts editing the filters above it — the
 * banner says the draft has moved on, and the refinements below still apply to
 * the report that exists rather than to the one being composed.
 */
type ReportBasis = {
  period: Record<string, string | number>;
  people: PeopleSelectionView;
  selectedUserIds: string[];
  recordTypes: ReportRecordTypeView[];
};

/** The narrowing applied to a report that already exists. */
type Refinement = {
  search: string;
  role: (typeof ROLE_OPTIONS)[number]["value"];
  status: (typeof STATUS_OPTIONS)[number]["value"];
  page: number;
};

const NO_REFINEMENT: Refinement = { search: "", role: "ALL", status: "ALL", page: 1 };

/**
 * The reports screen: choose a period, choose people, choose records, generate.
 *
 * **Nothing here computes a figure.** Every number rendered — the tiles, the
 * individual summaries, the totals, the page count — came back from
 * `/api/admin/reports`, which read it off the rows. The browser describes a
 * request and renders an answer, which is also why the export re-posts the same
 * body rather than serialising what is on screen: a file assembled here would be
 * a second implementation of a report that already exists, and it is the copy
 * that gets archived where nothing can be checked against the screen.
 *
 * The search, role and status controls beneath a generated report **re-post it**
 * rather than filtering the page in front of somebody. The report is paged, so
 * filtering here would search page one and report that nothing matched, and the
 * summary beside it would go on describing rows the table had stopped showing.
 * One rule holds for the whole screen: every number describes the rows the
 * report currently holds.
 */
export function ReportBuilder({
  /**
   * Whether this administrator may generate reports at all. Resolved on the
   * server from the database, and rendering only — `/api/admin/reports` asks
   * again on every request, so a stale `true` here buys nothing.
   */
  canReport,
}: {
  canReport: boolean;
}) {
  const today = useMemo(() => todayUtc(), []);
  const monthStart = useMemo(
    () => toIsoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
    [today],
  );

  const [periodKind, setPeriodKind] = useState<PeriodKind>("MONTHLY");
  const [month, setMonth] = useState(() => today.getUTCMonth() + 1);
  const [year, setYear] = useState(() => today.getUTCFullYear());
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => toIsoDate(today));
  const [singleDate, setSingleDate] = useState(() => toIsoDate(today));

  const [people, setPeople] = useState<PeopleSelectionView>("EVERYONE");
  const [selected, setSelected] = useState<ReportPersonView[]>([]);
  const [recordTypes, setRecordTypes] = useState<ReportRecordTypeView[]>([...RECORD_TYPES]);

  /**
   * The search box's own value, and the value the report is actually narrowed
   * by, kept apart so a keystroke does not cost a request. `criteria` is what
   * the effect below fetches on; `searchInput` is only what somebody is typing.
   */
  const [searchInput, setSearchInput] = useState("");
  const [criteria, setCriteria] = useState<Refinement>(NO_REFINEMENT);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);

  const [basis, setBasis] = useState<ReportBasis | null>(null);
  const [report, setReport] = useState<ReportView | null>(null);
  const [loading, setLoading] = useState(false);
  /**
   * Which file is being built, or nothing.
   *
   * A format rather than a boolean, so the button somebody pressed is the one
   * that spins — and so a second press of *any* of the three is refused while
   * one is in flight. A large report is a real wait, and three overlapping
   * exports of it is three full generations on the server for one file somebody
   * wanted.
   */
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const years = useMemo(() => {
    const current = today.getUTCFullYear();
    return Array.from({ length: 6 }, (_, index) => current - index);
  }, [today]);

  /** The period half of a request, in the shape its branch of the schema wants. */
  const periodBody = useCallback((): Record<string, string | number> => {
    if (periodKind === "MONTHLY") return { period: "MONTHLY", month, year };
    if (periodKind === "DAILY") return { period: "DAILY", date: singleDate };
    return { period: "CUSTOM", startDate, endDate };
  }, [periodKind, month, year, singleDate, startDate, endDate]);

  const needsPeople = people === "SELECTED_EMPLOYEES" || people === "SELECTED_ADMINS";

  /**
   * What is wrong with the draft, before it is sent.
   *
   * A courtesy exactly as the mark-present dialog's preview is: every one of
   * these is checked again by `reportRequestSchema`, which is the rule. It exists
   * so the answer arrives while the field is still in front of somebody.
   */
  const draftProblem = useMemo(() => {
    if (recordTypes.length === 0) return "Choose at least one record type.";
    if (needsPeople && selected.length === 0) return "Choose the people this report is about.";

    if (periodKind === "CUSTOM") {
      if (!startDate || !endDate) return "Choose a start and an end date.";
      if (startDate > endDate) return "The end date cannot be before the start date.";

      const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
      if (days > MAX_REPORT_RANGE_DAYS) {
        return `A report can cover at most ${MAX_REPORT_RANGE_DAYS} days. Choose a shorter range.`;
      }
    }

    if (periodKind === "DAILY" && !singleDate) return "Choose a date.";

    return null;
  }, [recordTypes, needsPeople, selected, periodKind, startDate, endDate, singleDate]);

  // The typed term becomes the applied one once it settles. Guarded on equality
  // so a debounce landing on a value already applied does not re-fetch, which is
  // what would otherwise happen every time a fresh generation cleared the box.
  useEffect(() => {
    setCriteria((current) =>
      current.search === debouncedSearch ? current : { ...current, search: debouncedSearch, page: 1 },
    );
  }, [debouncedSearch]);

  /**
   * The one place a report is fetched.
   *
   * Generating and refining both come through here — generating by replacing
   * `basis`, refining by replacing `criteria` — so there is no second request
   * path to fall out of step with this one, and no way for a refinement to be
   * applied to a basis that is only half updated. A superseded response cannot
   * overwrite a newer one because each run captures its own inputs and React
   * re-runs the effect with the latest.
   */
  useEffect(() => {
    if (!basis) return;

    let current = true;
    setLoading(true);
    setError(null);
    setFieldErrors({});

    apiClient
      .post<ReportView>("/api/admin/reports", {
        ...basis.period,
        people: basis.people,
        selectedUserIds: basis.selectedUserIds,
        recordTypes: basis.recordTypes,
        ...(criteria.search ? { search: criteria.search } : {}),
        role: criteria.role,
        status: criteria.status,
        page: criteria.page,
        pageSize: 25,
      })
      .then((data) => {
        if (current) setReport(data);
      })
      .catch((caught: unknown) => {
        if (!current) return;

        // The previous report is deliberately left on screen. A refinement that
        // failed should not destroy the answer somebody already had, and the
        // message above says plainly that this one did not land.
        if (caught instanceof ApiClientError) {
          setError(caught.message);
          setFieldErrors(caught.details ?? {});
        } else {
          setError("Couldn't generate that report. Please try again.");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [basis, criteria]);

  function generate() {
    if (draftProblem) {
      setError(draftProblem);
      return;
    }

    // Refinements are cleared on a fresh generation rather than carried over: a
    // search left from the last report would quietly narrow the new one, and the
    // commonest reading of an empty table is that there is nothing there.
    setSearchInput("");
    setCriteria(NO_REFINEMENT);

    // A new object every time, so pressing Generate again re-runs the report
    // even when nothing about it changed — which is what somebody pressing it
    // twice is asking for.
    setBasis({
      period: periodBody(),
      people,
      selectedUserIds: needsPeople ? selected.map((person) => person.id) : [],
      recordTypes,
    });
  }

  function reset() {
    setPeriodKind("MONTHLY");
    setMonth(today.getUTCMonth() + 1);
    setYear(today.getUTCFullYear());
    setStartDate(monthStart);
    setEndDate(toIsoDate(today));
    setSingleDate(toIsoDate(today));
    setPeople("EVERYONE");
    setSelected([]);
    setRecordTypes([...RECORD_TYPES]);
    setSearchInput("");
    setCriteria(NO_REFINEMENT);
    setBasis(null);
    setReport(null);
    setError(null);
    setFieldErrors({});
  }

  async function download(format: ExportFormat) {
    // Refused rather than queued while another file is being built, which is what
    // makes a double click harmless — see `exporting`.
    if (!basis || exporting) return;

    const target = EXPORT_FORMATS[format];
    setExporting(format);

    try {
      // The same body the report was generated from, refinements included, so
      // the file cannot hold rows the screen did not — nor leave out rows it did.
      const response = await fetch(target.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basis.period,
          people: basis.people,
          selectedUserIds: basis.selectedUserIds,
          recordTypes: basis.recordTypes,
          ...(criteria.search ? { search: criteria.search } : {}),
          role: criteria.role,
          status: criteria.status,
        }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const filename =
        response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? target.fallback;

      saveBlob(blob, filename);
      toast.success(`${filename} downloaded.`);
    } catch {
      toast.error("Couldn't export that report. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  function toggleRecordType(type: ReportRecordTypeView) {
    setRecordTypes((current) =>
      current.includes(type) ? current.filter((kept) => kept !== type) : [...current, type],
    );
  }

  function refine(change: Partial<Refinement>) {
    // Any narrowing resets to page one, so results are not hidden behind a page
    // number the new filter no longer reaches.
    setCriteria((current) => ({ ...current, ...change, page: change.page ?? 1 }));
  }

  const refinements = describeReportRefinements({
    search: criteria.search || undefined,
    role: criteria.role,
    status: criteria.status,
  });
  const isNarrowed = refinements.length > 0;

  /**
   * Whether the filters have moved on from the report on screen.
   *
   * Compared as a serialised basis rather than field by field, so a control added
   * later cannot be forgotten here and silently stop marking a report stale.
   */
  const stale =
    basis !== null &&
    JSON.stringify({
      period: periodBody(),
      people,
      selectedUserIds: needsPeople ? selected.map((person) => person.id) : [],
      recordTypes,
    }) !== JSON.stringify(basis);

  if (!canReport) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You cannot generate reports yet"
        description="Reporting across the workforce needs the same permission as viewing administrators as a group. Ask your super administrator to enable it from the Access panel."
      />
    );
  }

  return (
    <div className="grid gap-4">
      <Card className="no-print py-0">
        <CardContent className="space-y-5 p-4 sm:p-6">
          {/* Period ------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold tracking-[-0.012em]">Report period</legend>

            <div className="flex flex-wrap gap-1.5">
              {PERIOD_KINDS.map((option) => (
                <ChoiceChip
                  key={option.value}
                  selected={periodKind === option.value}
                  onClick={() => setPeriodKind(option.value)}
                >
                  {option.label}
                </ChoiceChip>
              ))}
            </div>

            {periodKind === "MONTHLY" && (
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="report-month">Month</Label>
                  <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
                    <SelectTrigger id="report-month" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="report-year">Year</Label>
                  <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                    <SelectTrigger id="report-year" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {periodKind === "CUSTOM" && (
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="report-start">Start date</Label>
                  <Input
                    id="report-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-44"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="report-end">End date</Label>
                  <Input
                    id="report-end"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-44"
                    aria-invalid={Boolean(fieldErrors.endDate)}
                  />
                  {fieldErrors.endDate && (
                    <p className="text-destructive-ink text-xs">{fieldErrors.endDate}</p>
                  )}
                </div>
              </div>
            )}

            {periodKind === "DAILY" && (
              <div className="space-y-1.5">
                <Label htmlFor="report-date">Date</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={singleDate}
                  onChange={(event) => setSingleDate(event.target.value)}
                  className="w-44"
                />
              </div>
            )}
          </fieldset>

          {/* People ------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold tracking-[-0.012em]">People</legend>

            <div className="flex flex-wrap gap-1.5">
              {PEOPLE_OPTIONS.map((option) => (
                <ChoiceChip key={option} selected={people === option} onClick={() => setPeople(option)}>
                  {peopleSelectionLabel(option)}
                </ChoiceChip>
              ))}
            </div>

            {needsPeople && (
              <ReportPeoplePicker
                population={people === "SELECTED_ADMINS" ? "ADMIN" : "EMPLOYEE"}
                selected={selected}
                onChange={setSelected}
              />
            )}
          </fieldset>

          {/* Records ------------------------------------------------------ */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold tracking-[-0.012em]">Record type</legend>

            <div className="flex flex-wrap gap-1.5">
              {/*
                "All" is not a value — it is the three of them chosen, which is
                what the button sets. A fourth literal meaning "the other three"
                would be a second way to say one thing, and the two would drift.
              */}
              <ChoiceChip
                selected={recordTypes.length === RECORD_TYPES.length}
                onClick={() => setRecordTypes([...RECORD_TYPES])}
              >
                All
              </ChoiceChip>

              {RECORD_TYPES.map((type) => (
                <ChoiceChip
                  key={type}
                  selected={recordTypes.includes(type)}
                  onClick={() => toggleRecordType(type)}
                >
                  {recordTypeLabel(type)}
                </ChoiceChip>
              ))}
            </div>

            <p className="text-muted-foreground text-xs">
              Choose any combination. Days the office was closed and weekly days off are never
              records — they are counted in the summary as days off, and cost nobody a leave.
            </p>
          </fieldset>

          {/* Actions ------------------------------------------------------ */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={generate} loading={loading} disabled={draftProblem !== null}>
              <Sparkles className="size-4" />
              Generate report
            </Button>

            <Button variant="ghost" onClick={reset} disabled={loading}>
              <RotateCcw className="size-4" />
              Reset filters
            </Button>

            {draftProblem && <p className="text-muted-foreground text-sm">{draftProblem}</p>}
          </div>

          {error && (
            <p className="text-destructive-ink text-sm" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {loading && !report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <StatCardSkeleton key={index} />
            ))}
          </div>

          <Card className="py-0">
            <CardContent className="space-y-3 p-4 sm:p-6">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {!loading && !report && !error && (
        <EmptyState
          icon={FileBarChart}
          title="No report yet"
          description="Choose a period, who it covers and which records to include, then generate. Attendance, absence and leave are all judged by the same rules the attendance screen uses."
        />
      )}

      {report && (
        <>
          {/*
            What the report on screen actually represents, kept visible above it
            and printed with it. A summary read without its period is a set of
            numbers about nothing in particular.
          */}
          <Card className="py-0">
            <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="text-primary-ink size-4 shrink-0" aria-hidden />
                    <h2 className="text-base font-semibold tracking-[-0.015em]">{report.periodLabel}</h2>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {describePeopleSelection(report.people, report.peopleCount)} ·{" "}
                    {describeRecordTypes(report.recordTypes)} · {report.totalRows}{" "}
                    {report.totalRows === 1 ? "record" : "records"}
                  </p>
                </div>

                <p className="text-muted-foreground text-xs">
                  Generated {formatDateTime(report.generatedAt)}
                </p>
              </div>

              {/*
                The exports sit with the report rather than with the filters that
                produced it, because that is the thing being taken away — and
                because what they carry is the report *as it now stands*, the
                search and status refinements below included, not the draft in
                the panel above. Hidden until a report exists for the same
                reason: there is nothing to export before then.
              */}
              <div className="no-print flex flex-wrap items-center gap-2">
                {EXPORT_ORDER.map((format) => {
                  const option = EXPORT_FORMATS[format];
                  const Icon = option.icon;

                  return (
                    <Button
                      key={format}
                      variant={format === "csv" ? "ghost" : "outline"}
                      size="sm"
                      onClick={() => void download(format)}
                      loading={exporting === format}
                      // Every one of them is disabled while any is in flight, so
                      // a second click cannot start a second full generation of
                      // the same report.
                      disabled={loading || exporting !== null}
                    >
                      <Icon className="size-4" />
                      {option.label}
                    </Button>
                  );
                })}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.print()}
                  disabled={loading || exporting !== null}
                >
                  <Printer className="size-4" />
                  Print
                </Button>
              </div>

              {isNarrowed && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Filtered by</span>
                  {refinements.map((refinement) => (
                    <Badge key={refinement} variant="secondary">
                      {refinement}
                    </Badge>
                  ))}
                </div>
              )}

              {/*
                Ids that matched nobody, named rather than dropped. A report
                quietly covering four of the five people somebody chose is
                indistinguishable from one whose totals are simply low.
              */}
              {report.missingSelections.length > 0 && (
                <p className="text-warning-ink text-sm">
                  {report.missingSelections.length} of the people you selected are no longer available
                  to report on — their accounts may have been deleted, or they may not belong to the
                  population this report covers. They are not included below.
                </p>
              )}

              {stale && (
                <p className="text-warning-ink no-print text-sm">
                  The filters above have changed since this report was generated. It still shows{" "}
                  {report.periodLabel} — press <strong>Generate report</strong> to bring it up to date.
                </p>
              )}
            </CardContent>
          </Card>

          <ReportSummary report={report} />

          <Card className="py-0">
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="no-print flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search this report by name or email…"
                    className="pl-9"
                    aria-label="Search the report"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={criteria.role}
                    onValueChange={(value) => refine({ role: value as Refinement["role"] })}
                  >
                    <SelectTrigger className="w-40" aria-label="Filter by role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={criteria.status}
                    onValueChange={(value) => refine({ status: value as Refinement["status"] })}
                  >
                    <SelectTrigger className="w-36" aria-label="Filter by status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {isNarrowed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchInput("");
                        setCriteria(NO_REFINEMENT);
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="space-y-3 py-2">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <ReportTable
                  report={report}
                  onPageChange={(page) => setCriteria((current) => ({ ...current, page }))}
                  filtered={isNarrowed}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * A filter chip that is on or off.
 *
 * A button rather than a checkbox because the row reads as a set of choices, and
 * `aria-pressed` is what carries the state to a screen reader — the visual
 * treatment alone would leave the selection invisible to one.
 */
function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm font-medium",
        "transition-[background-color,box-shadow,color] duration-200 ease-standard",
        "focus-visible:ring-ring/35 outline-none focus-visible:ring-[3px]",
        selected
          ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/30%)]"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60 shadow-[inset_0_0_0_1px_var(--glass-hairline)]",
      )}
    >
      {children}
    </button>
  );
}

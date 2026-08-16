"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Send, ShieldAlert, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { AdminRecipientPicker, type AdminRecipient } from "@/components/admin/admin-recipient-picker";
import { EmailAttachmentsField } from "@/components/admin/email-attachments-field";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { MAX_EMAIL_SUBJECT_LENGTH } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import type { EmailAudienceView, EmailCapabilitiesView, EmailDispatchView, Pagination } from "@/types";

/** How each audience reads, and what it means for the person choosing it. */
const AUDIENCES: Record<EmailAudienceView, { label: string; hint: string }> = {
  INDIVIDUAL: { label: "One person", hint: "Choose a single person to write to." },
  EMPLOYEES: { label: "All employees", hint: "Everyone with an employee account." },
  ADMINS: {
    label: "All administrators",
    hint: "Every active administrator except you.",
  },
  SELECTED_ADMINS: {
    label: "Selected administrators",
    hint: "Pick the administrators this goes to.",
  },
  ALL_MEMBERS: { label: "Everyone", hint: "Employees and administrators together." },
};

/** The two audiences drawn from the administrator roster. */
const ADMIN_AUDIENCES: EmailAudienceView[] = ["ADMINS", "SELECTED_ADMINS"];

const STATUS: Record<EmailDispatchView["status"], { label: string; variant: "success" | "secondary" | "destructive" }> = {
  SENT: { label: "Sent", variant: "success" },
  PARTIAL: { label: "Partly sent", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
};

type Recipient = { id: string; name: string; role: string; department: string | null };

/**
 * Names the files in the confirmation, because an attachment is the half of an
 * announcement that cannot be corrected by writing again — a wrong file has
 * already been delivered to everybody by the time anybody notices.
 */
function describeAttached(files: File[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) return `, with ${files[0]!.name} attached`;

  return `, with ${files.length} files attached`;
}

/**
 * Names the people a send would reach, and keeps naming them.
 *
 * A count alone tells somebody the send is bigger than they meant; only names
 * tell them it is going to the wrong people, and that is the mistake an email
 * cannot be recalled from. Long lists still lead with names rather than
 * collapsing to a figure — the first few plus a remainder is the shape that
 * stays readable while still being checkable.
 */
function describePeople(people: Array<{ name: string }>): string {
  const names = people.map((person) => person.name);

  if (names.length === 0) return "nobody";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= 5) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

  return `${names.slice(0, 4).join(", ")} and ${names.length - 4} others`;
}

/**
 * Compose and send a message to people here.
 *
 * The audiences offered come from the server's `capabilities`, so an
 * administrator never sees a broadcast option they could not use. That is
 * presentation only — the same rule is enforced again on the send, against the
 * grant read from the database, so a hand-made request gains nothing.
 *
 * Anything reaching more than one person asks first. A message to the whole
 * organisation is not undoable, and the count is the thing worth reading twice.
 */
export function CustomEmailComposer() {
  const [capabilities, setCapabilities] = useState<EmailCapabilitiesView | null>(null);
  const [log, setLog] = useState<EmailDispatchView[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [audience, setAudience] = useState<EmailAudienceView>("INDIVIDUAL");
  const [recipientId, setRecipientId] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");

  // The administrator roster, fetched whole once. It backs both admin
  // audiences: the picker filters it, and "all administrators" counts it — so
  // the number confirmed in the dialog and the list somebody chose from are the
  // same fetch and cannot disagree about who is eligible.
  const [adminRoster, setAdminRoster] = useState<AdminRecipient[]>([]);
  const [adminRosterLoading, setAdminRosterLoading] = useState(false);
  const [selectedAdmins, setSelectedAdmins] = useState<AdminRecipient[]>([]);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const search = useDebouncedValue(recipientSearch, 300);

  const load = useCallback(async () => {
    try {
      const result = await apiClient.get<{
        capabilities: EmailCapabilitiesView;
        items: EmailDispatchView[];
        pagination: Pagination;
      }>(`/api/admin/emails?page=${page}&pageSize=10`);

      setCapabilities(result.capabilities);
      setLog(result.items);
      setPagination(result.pagination);

      // Opens on whatever they may actually use, rather than defaulting to an
      // option that would be refused.
      setAudience((current) =>
        result.capabilities.audiences.includes(current) ? current : (result.capabilities.audiences[0] ?? "INDIVIDUAL"),
      );
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't load the email screen.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (audience !== "INDIVIDUAL" || !capabilities?.canSend) return;

    apiClient
      .get<{ items: Recipient[] }>(
        `/api/admin/emails/recipients?scope=INDIVIDUAL&search=${encodeURIComponent(search)}`,
      )
      .then((result) => setRecipients(result.items))
      .catch(() => setRecipients([]));
  }, [audience, search, capabilities?.canSend]);

  /**
   * Fetched unfiltered, and only once either admin audience is chosen.
   *
   * No `search` in the URL: the picker filters what is already here, and the
   * "all administrators" count has to be the whole population rather than
   * whatever somebody last typed. An administrator who never writes to their
   * colleagues does not pay for the list of the ones they could have.
   */
  useEffect(() => {
    if (!ADMIN_AUDIENCES.includes(audience) || !capabilities?.canSend) return;

    setAdminRosterLoading(true);

    apiClient
      .get<{ items: AdminRecipient[] }>("/api/admin/emails/recipients?scope=ADMINS")
      .then((result) => setAdminRoster(result.items))
      .catch(() => setAdminRoster([]))
      .finally(() => setAdminRosterLoading(false));
  }, [audience, capabilities?.canSend]);

  /**
   * Erases the trail, then reloads rather than emptying the table locally.
   *
   * The count in the toast is the server's, not `pagination.total` — the log is
   * every administrator's and a send may have landed since this page was
   * loaded, so the number worth reporting is the number of rows actually
   * removed. Going back to page one matters for the same reason: the page being
   * viewed no longer exists.
   */
  async function clearLog() {
    setClearing(true);

    try {
      const { removed } = await apiClient.delete<{ removed: number }>("/api/admin/emails");

      toast.success(
        removed === 1 ? "Cleared 1 sent message from the log." : `Cleared ${removed} sent messages from the log.`,
      );

      if (page === 1) await load();
      else setPage(1);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "The log could not be cleared.");
    } finally {
      setClearing(false);
    }
  }

  const chosen = useMemo(() => recipients.find((r) => r.id === recipientId), [recipients, recipientId]);
  const bodyHasText = body.replace(/<[^>]*>/g, "").trim().length > 0;

  /**
   * Who this send would actually reach, named.
   *
   * Used for both the line under the button and the confirmation, so what
   * somebody reads before pressing send is what they read when asked to confirm
   * it. The server resolves the audience again and is the only thing that
   * decides — this is a description, never the instruction.
   */
  const audienceRecipients = useMemo<AdminRecipient[]>(() => {
    if (audience === "ADMINS") return adminRoster;
    if (audience === "SELECTED_ADMINS") return selectedAdmins;

    return [];
  }, [audience, adminRoster, selectedAdmins]);

  const namesRecipients = ADMIN_AUDIENCES.includes(audience);

  // Every audience needs a subject and a body; the two that name people need at
  // least one. The same rule is the server's, which refuses an empty selection
  // in the schema and an ineligible one in the service.
  const ready =
    subject.trim().length >= 3 &&
    bodyHasText &&
    (audience !== "INDIVIDUAL" || Boolean(recipientId)) &&
    (audience !== "SELECTED_ADMINS" || selectedAdmins.length > 0) &&
    (audience !== "ADMINS" || adminRoster.length > 0);

  async function send() {
    setSending(true);

    try {
      // Multipart, not JSON: the files travel as their own parts rather than as
      // base64 inside a string. The text fields are exactly the ones this form
      // always sent — the schema on the other side is unchanged.
      const form = new FormData();
      form.append("audience", audience);
      if (audience === "INDIVIDUAL") form.append("recipientId", recipientId);

      // One comma-joined field rather than a repeated one: the body is
      // multipart, and repeated text parts collapse to a single value on the
      // way in. The schema splits it back and refuses an empty list.
      if (audience === "SELECTED_ADMINS") {
        form.append("recipientIds", selectedAdmins.map((person) => person.id).join(","));
      }

      form.append("subject", subject.trim());
      form.append("body", body);
      for (const file of attachments) form.append("attachments", file);

      const result = await apiClient.postForm<{ message: string }>("/api/admin/emails", form);

      toast.success(result.message);
      setSubject("");
      setBody("");
      setRecipientId("");
      setSelectedAdmins([]);
      setAttachments([]);
      setPage(1);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || sending) return;

    // One person is a message; everyone is an announcement. Only the second
    // needs a second look.
    if (audience === "INDIVIDUAL") void send();
    else setConfirming(true);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (!capabilities?.canSend) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You cannot send emails"
        description="Sending email is granted per administrator. Ask your super administrator to enable it for your account."
      />
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="text-primary-ink size-4" aria-hidden />
            Compose a message
          </CardTitle>
          <CardDescription>
            Sent from the company mailbox, so replies reach a monitored address. Your name is shown
            inside the message.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email-audience">Send to</Label>
                <Select
                  value={audience}
                  onValueChange={(value) => {
                    setAudience(value as EmailAudienceView);
                    // Both recipient choices are cleared on any change of
                    // audience. A selection carried across is the one way this
                    // form could send to people the sender is no longer looking
                    // at.
                    setRecipientId("");
                    setSelectedAdmins([]);
                  }}
                  disabled={sending}
                >
                  <SelectTrigger id="email-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {capabilities.audiences.map((option) => (
                      <SelectItem key={option} value={option}>
                        {AUDIENCES[option].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">{AUDIENCES[audience].hint}</p>
              </div>

              {audience === "INDIVIDUAL" && (
                <div className="space-y-1.5">
                  <Label htmlFor="email-recipient">Recipient</Label>
                  <Input
                    id="email-recipient-search"
                    value={recipientSearch}
                    onChange={(event) => setRecipientSearch(event.target.value)}
                    placeholder="Search by name or department"
                    disabled={sending}
                    className="mb-2"
                  />
                  <Select value={recipientId} onValueChange={setRecipientId} disabled={sending}>
                    <SelectTrigger id="email-recipient">
                      <SelectValue placeholder={recipients.length ? "Choose a person" : "Nobody matches"} />
                    </SelectTrigger>
                    <SelectContent>
                      {recipients.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                          {person.department ? ` · ${person.department}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {audience === "SELECTED_ADMINS" && (
              <AdminRecipientPicker
                candidates={adminRoster}
                selected={selectedAdmins}
                onChange={setSelectedAdmins}
                disabled={sending}
                loading={adminRosterLoading}
              />
            )}

            {/*
              "All administrators" names them rather than only counting them.
              A number is enough to notice that a send is bigger than intended;
              a list is what lets somebody notice it is going to the wrong
              people, which is the mistake an email cannot be recalled from.
            */}
            {audience === "ADMINS" && (
              <div className="border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Users className="text-primary-ink size-4 shrink-0" aria-hidden />
                  <p className="text-sm font-medium">
                    {adminRosterLoading
                      ? "Counting administrators…"
                      : `${adminRoster.length} ${adminRoster.length === 1 ? "recipient" : "recipients"}`}
                  </p>
                </div>

                {!adminRosterLoading && adminRoster.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    There is nobody else with an administrator account to write to.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {adminRoster.map((person) => (
                      <li key={person.id}>
                        <Badge variant="secondary" className="max-w-48 truncate">
                          {person.name}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={MAX_EMAIL_SUBJECT_LENGTH}
                placeholder="e.g. Office timings for next week"
                disabled={sending}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-body">Message</Label>
              <RichTextEditor
                id="email-body"
                value={body}
                onChange={setBody}
                disabled={sending}
                placeholder="Write your message…"
              />
            </div>

            <EmailAttachmentsField files={attachments} onChange={setAttachments} disabled={sending} />

            <div className="flex items-center gap-3">
              <Button type="submit" loading={sending} disabled={!ready}>
                {!sending && <Send className="size-4" />}
                Send email
              </Button>
              {audience === "INDIVIDUAL" && chosen && (
                <span className="text-muted-foreground text-xs">Going to {chosen.name}</span>
              )}
              {namesRecipients && audienceRecipients.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  Going to {describePeople(audienceRecipients)}
                </span>
              )}
              {audience === "SELECTED_ADMINS" && selectedAdmins.length === 0 && (
                <span className="text-muted-foreground text-xs">
                  Choose at least one administrator
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Sent messages</CardTitle>
            <CardDescription>
              {capabilities.seesAllHistory
                ? "Every custom email sent from this system."
                : "Messages you have sent. The message body is never stored."}
            </CardDescription>
          </div>

          {/* Only the owner may erase the trail, and only when there is one to
              erase. Rendered from `canClearHistory` rather than the role in the
              session, so a grant that changes takes the button with it. */}
          {capabilities.canClearHistory && log.length > 0 && (
            <ConfirmDialog
              title="Clear the sent message log?"
              description={`This removes the record of all ${pagination.total} sent ${
                pagination.total === 1 ? "message" : "messages"
              }, across every administrator — who wrote to the organisation, when, and whether it arrived. Delivered mail is untouched and cannot be recalled; what goes is the administrative record of having sent it. Nothing here can undo this.`}
              confirmLabel="Clear the log"
              destructive
              onConfirm={clearLog}
              trigger={
                <Button type="button" variant="outline" size="sm" disabled={clearing}>
                  <Trash2 className="size-4" />
                  Clear log
                </Button>
              }
            />
          )}
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Nothing sent yet"
              description="Messages you send will be recorded here."
              inset={false}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sent</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Recipients</TableHead>
                      {capabilities.seesAllHistory && <TableHead>Sender</TableHead>}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                          {formatDateTime(entry.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-64 truncate font-medium">{entry.subject}</TableCell>
                        {/*
                          A hand-picked send names who it went to, because the
                          audience label cannot: "Selected administrators" is
                          the one row in this table that says nothing about the
                          recipients unless the names are shown. They are the
                          names recorded at send time, so a rename since does
                          not rewrite who was written to.
                        */}
                        <TableCell className="text-muted-foreground max-w-64 truncate text-sm">
                          {entry.recipient?.name ??
                            (entry.recipientNames.length > 0
                              ? entry.recipientNames.join(", ")
                              : AUDIENCES[entry.audience].label)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.deliveredCount === entry.recipientCount
                            ? entry.recipientCount
                            : `${entry.deliveredCount} / ${entry.recipientCount}`}
                        </TableCell>
                        {capabilities.seesAllHistory && (
                          <TableCell className="text-muted-foreground text-sm">{entry.sender.name}</TableCell>
                        )}
                        <TableCell>
                          <Badge variant={STATUS[entry.status].variant}>{STATUS[entry.status].label}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <PaginationControls pagination={pagination} onPageChange={setPage} label="messages" />
            </>
          )}
        </CardContent>
      </Card>

      {/*
        The two admin audiences confirm against the actual recipients rather
        than against the audience's label. "Send to selected administrators?"
        is a question somebody answers yes to without checking; the names and
        the count are the thing worth reading twice.
      */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={
          namesRecipients
            ? `Send to ${audienceRecipients.length} ${audienceRecipients.length === 1 ? "administrator" : "administrators"}?`
            : `Send to ${AUDIENCES[audience].label.toLowerCase()}?`
        }
        description={
          namesRecipients
            ? `"${subject.trim()}" will be emailed to ${describePeople(audienceRecipients)}${describeAttached(attachments)}. This cannot be recalled once sent.`
            : `"${subject.trim()}" will be emailed to ${AUDIENCES[audience].label.toLowerCase()}${describeAttached(attachments)}. This cannot be recalled once sent.`
        }
        confirmLabel="Send email"
        onConfirm={async () => {
          setConfirming(false);
          await send();
        }}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

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
  INDIVIDUAL: { label: "One person", hint: "Choose a single employee or administrator." },
  EMPLOYEES: { label: "All employees", hint: "Everyone with an employee account." },
  ADMINS: { label: "All administrators", hint: "Every administrator. Super administrator only." },
  ALL_MEMBERS: { label: "Everyone", hint: "Employees and administrators together." },
};

const STATUS: Record<EmailDispatchView["status"], { label: string; variant: "success" | "secondary" | "destructive" }> = {
  SENT: { label: "Sent", variant: "success" },
  PARTIAL: { label: "Partly sent", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
};

type Recipient = { id: string; name: string; role: string; department: string | null };

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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
      .get<{ items: Recipient[] }>(`/api/admin/emails/recipients?search=${encodeURIComponent(search)}`)
      .then((result) => setRecipients(result.items))
      .catch(() => setRecipients([]));
  }, [audience, search, capabilities?.canSend]);

  const chosen = useMemo(() => recipients.find((r) => r.id === recipientId), [recipients, recipientId]);
  const bodyHasText = body.replace(/<[^>]*>/g, "").trim().length > 0;
  const ready = subject.trim().length >= 3 && bodyHasText && (audience !== "INDIVIDUAL" || Boolean(recipientId));

  async function send() {
    setSending(true);

    try {
      const result = await apiClient.post<{ message: string }>("/api/admin/emails", {
        audience,
        ...(audience === "INDIVIDUAL" ? { recipientId } : {}),
        subject: subject.trim(),
        body,
      });

      toast.success(result.message);
      setSubject("");
      setBody("");
      setRecipientId("");
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
                    setRecipientId("");
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

            <div className="flex items-center gap-3">
              <Button type="submit" loading={sending} disabled={!ready}>
                {!sending && <Send className="size-4" />}
                Send email
              </Button>
              {audience === "INDIVIDUAL" && chosen && (
                <span className="text-muted-foreground text-xs">Going to {chosen.name}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sent messages</CardTitle>
          <CardDescription>
            {capabilities.seesAllHistory
              ? "Every custom email sent from this system."
              : "Messages you have sent. The message body is never stored."}
          </CardDescription>
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
                        <TableCell className="text-muted-foreground text-sm">
                          {entry.recipient?.name ?? AUDIENCES[entry.audience].label}
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

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Send to ${AUDIENCES[audience].label.toLowerCase()}?`}
        description={`"${subject.trim()}" will be emailed to ${AUDIENCES[audience].label.toLowerCase()}. This cannot be recalled once sent.`}
        confirmLabel="Send email"
        onConfirm={async () => {
          setConfirming(false);
          await send();
        }}
      />
    </div>
  );
}

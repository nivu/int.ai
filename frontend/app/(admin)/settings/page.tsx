"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrgId } from "@/components/admin/org-context";
import { backendFetch } from "@/lib/api/backend";
import { UsageTab } from "@/components/admin/usage-tab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  SortableTh,
  useSortState,
  useSortedRows,
  type SortAccessors,
} from "@/components/shared/sortable-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string;
  email: string | null;
  role: "admin" | "recruiter" | "hiring_manager";
  status: "active" | "invited" | "deactivated";
  created_at: string;
}

type MemberSortKey = "email" | "role" | "status" | "created_at";

async function fetchTeamMembers(): Promise<TeamMember[]> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const res = await backendFetch<{ items: TeamMember[] }>("/api/v1/team", {
    token: session?.access_token,
  });
  return res.items ?? [];
}

const MEMBER_SORT_ACCESSORS: SortAccessors<TeamMember, MemberSortKey> = {
  email: (m) => m.email,
  role: (m) => m.role,
  status: (m) => m.status,
  created_at: (m) => Date.parse(m.created_at),
};

function formatMemberDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface InterviewTemplate {
  id: string;
  name: string;
}

interface OrgSettings {
  screening_threshold?: number;
  default_template_id?: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your team, scoring defaults, data retention, API keys, and usage
        </p>
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="defaults">Defaults</TabsTrigger>
          <TabsTrigger value="retention">Data Retention</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="defaults">
          <DefaultsTab />
        </TabsContent>
        <TabsContent value="retention">
          <DataRetentionTab />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="usage">
          <UsageTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================================================
// Team Tab (T079)
// ===========================================================================

function TeamTab() {
  const supabase = createClient();
  const orgId = useOrgId();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, toggleSort] = useSortState<MemberSortKey>({ key: "created_at", direction: "desc" });
  const sortedMembers = useSortedRows(members, sort, MEMBER_SORT_ACCESSORS);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMember["role"]>("recruiter");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TeamMember | null>(
    null
  );

  // Fetch members through the backend, which resolves each member's email
  // from Supabase Auth (team_members itself stores only user_id).
  useEffect(() => {
    fetchTeamMembers()
      .then((items) => setMembers(items))
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load team members.")
      )
      .finally(() => setLoading(false));
  }, [orgId]);

  // Invite member
  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim() || !orgId) return;
    setInviting(true);
    setInviteError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await backendFetch<{ member: TeamMember; email_sent: boolean }>("/api/v1/team/invite", {
        method: "POST",
        token: session?.access_token,
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      setMembers((prev) => [res.member, ...prev]);
      setInviteEmail("");
      setInviteRole("recruiter");
      setInviteOpen(false);
      if (!res.email_sent) {
        setLoadError("Member added, but the invitation email could not be sent.");
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite member.");
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, supabase, orgId]);

  // Change role
  const handleRoleChange = useCallback(
    async (memberId: string, newRole: TeamMember["role"]) => {
      const { error } = await supabase
        .from("team_members")
        .update({ role: newRole })
        .eq("id", memberId);

      if (!error) {
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
        );
      }
    },
    [supabase]
  );

  // Deactivate
  const handleDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    const { error } = await supabase
      .from("team_members")
      .update({ status: "deactivated" })
      .eq("id", deactivateTarget.id);

    if (!error) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === deactivateTarget.id
            ? { ...m, status: "deactivated" as const }
            : m
        )
      );
    }
    setDeactivateTarget(null);
  }, [deactivateTarget, supabase]);

  const statusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "default" as const;
      case "invited":
        return "secondary" as const;
      case "deactivated":
        return "outline" as const;
      default:
        return "outline" as const;
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Team Members</h2>
        <Button onClick={() => setInviteOpen(true)}>Invite Member</Button>
      </div>

      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">
              Loading team members...
            </p>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No team members found. Invite your first team member to get
              started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <SortableTh label="Email" sortKey="email" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <SortableTh label="Role" sortKey="role" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <SortableTh label="Added" sortKey="created_at" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((member) => (
                    <tr key={member.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{member.email ?? "\u2014"}</td>
                      <td className="py-3 pr-4">
                        {member.status === "deactivated" ? (
                          <Badge variant="outline">{member.role}</Badge>
                        ) : (
                          <Select
                            value={member.role}
                            onValueChange={(val) =>
                              handleRoleChange(
                                member.id,
                                val as TeamMember["role"]
                              )
                            }
                          >
                            <SelectTrigger size="sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="recruiter">
                                Recruiter
                              </SelectItem>
                              <SelectItem value="hiring_manager">
                                Hiring Manager
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={statusVariant(member.status)}>
                          {member.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatMemberDate(member.created_at)}
                      </td>
                      <td className="py-3">
                        {member.status !== "deactivated" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeactivateTarget(member)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation email to a new team member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(val) =>
                  setInviteRole(val as TeamMember["role"])
                }
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="recruiter">Recruiter</SelectItem>
                  <SelectItem value="hiring_manager">
                    Hiring Manager
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={inviting}
            >
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{" "}
              <span className="font-medium">
                {deactivateTarget?.email}
              </span>
              ? They will lose access to the platform.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===========================================================================
// Defaults Tab (T080)
// ===========================================================================

function DefaultsTab() {
  const supabase = createClient();
  const orgId = useOrgId();

  const [threshold, setThreshold] = useState(70);
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<InterviewTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch current settings + templates
  useEffect(() => {
    async function load() {
      if (!orgId) return;

      // Fetch org settings
      const { data: org } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", orgId)
        .single();

      if (org?.settings) {
        const s = org.settings as OrgSettings;
        if (s.screening_threshold != null) setThreshold(s.screening_threshold);
        if (s.default_template_id) setTemplateId(s.default_template_id);
      }

      // Fetch templates
      const { data: tmpl } = await supabase
        .from("interview_templates")
        .select("id, name")
        .eq("org_id", orgId)
        .order("name");

      setTemplates((tmpl as InterviewTemplate[]) ?? []);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Save
  const handleSave = useCallback(async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const settings: OrgSettings = {
        screening_threshold: threshold,
        default_template_id: templateId || undefined,
      };

      const { error } = await supabase
        .from("organizations")
        .update({ settings })
        .eq("id", orgId);

      if (error) throw error;
      setSaved(true);
    } catch (err) {
      console.error("Failed to save defaults:", err);
    } finally {
      setSaving(false);
    }
  }, [supabase, threshold, templateId, orgId]);

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Screening Threshold</CardTitle>
          <CardDescription>
            Minimum overall score (0-100) for a candidate to pass screening.
            The overall score uses fixed weights: resume similarity 15%, skill
            35%, experience 35%, culture 15%.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => {
              setThreshold(Number(e.target.value));
              setSaved(false);
            }}
            className="w-32"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default Interview Template</CardTitle>
          <CardDescription>
            Template used for new jobs unless overridden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={templateId}
            onValueChange={(val) => {
              setTemplateId(val as string);
              setSaved(false);
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Defaults"}
        </Button>
        {saved && (
          <span className="text-sm text-muted-foreground">
            Settings saved successfully.
          </span>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Data Retention Tab (T081)
// ===========================================================================

function DataRetentionTab() {
  const supabase = createClient();

  const [retentionDays, setRetentionDays] = useState("90");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch current retention setting
  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.org_id) return;

      const { data: org } = await supabase
        .from("organizations")
        .select("data_retention_days")
        .eq("id", profile.org_id)
        .single();

      if (org?.data_retention_days != null) {
        setRetentionDays(String(org.data_retention_days));
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.org_id) return;

      const { error } = await supabase
        .from("organizations")
        .update({ data_retention_days: Number(retentionDays) })
        .eq("id", profile.org_id);

      if (error) throw error;
      setSaved(true);
    } catch (err) {
      console.error("Failed to save retention settings:", err);
    } finally {
      setSaving(false);
    }
  }, [supabase, retentionDays]);

  const isShortRetention = Number(retentionDays) < 90;

  return (
    <div className="mt-4 space-y-6">
      {isShortRetention && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-950/20 dark:text-yellow-200">
          <p className="font-medium">Short retention period</p>
          <p className="mt-1">
            A retention period of less than 90 days may cause compliance issues
            and limit your ability to review past hiring decisions. Consider
            using a longer retention period.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Data Retention Period</CardTitle>
          <CardDescription>
            Candidate data (resumes, recordings, transcripts) will be
            automatically deleted{" "}
            <span className="font-medium">{retentionDays} days</span> after a
            final decision is made.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={retentionDays}
            onValueChange={(val) => {
              setRetentionDays(val as string);
              setSaved(false);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="180">180 days</SelectItem>
              <SelectItem value="365">365 days</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Retention Settings"}
        </Button>
        {saved && (
          <span className="text-sm text-muted-foreground">
            Retention settings saved successfully.
          </span>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// API Keys Tab — keys for the hosted MCP server
// ===========================================================================

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  team_member_id: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

type ApiKeySortKey = "name" | "key_prefix" | "status" | "created_at" | "last_used_at";

const API_KEY_SORT_ACCESSORS: SortAccessors<ApiKeyRow, ApiKeySortKey> = {
  name: (k) => k.name,
  key_prefix: (k) => k.key_prefix,
  status: (k) => (k.revoked_at ? "revoked" : "active"),
  created_at: (k) => Date.parse(k.created_at),
  last_used_at: (k) => (k.last_used_at ? Date.parse(k.last_used_at) : null),
};

const MCP_URL = `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/mcp`;

function formatDateTime(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function fetchApiKeys(): Promise<ApiKeyRow[]> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const res = await backendFetch<{ items: ApiKeyRow[] }>("/api/v1/api-keys", {
    token: session?.access_token,
  });
  return res.items ?? [];
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function ApiKeysTab() {
  const supabase = createClient();

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, toggleSort] = useSortState<ApiKeySortKey>({ key: "created_at", direction: "desc" });
  const sortedKeys = useSortedRows(keys, sort, API_KEY_SORT_ACCESSORS);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  // setState only inside promise callbacks so this can run from an effect.
  const loadKeys = useCallback(
    () =>
      fetchApiKeys()
        .then((items) => setKeys(items))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load API keys."))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await backendFetch<ApiKeyRow & { key: string }>("/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
        token: session?.access_token,
      });
      setCreatedKey(res.key);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key.");
    } finally {
      setCreating(false);
    }
  }

  function closeCreate() {
    setCreateOpen(false);
    setNewName("");
    setCreatedKey(null);
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await backendFetch<void>(`/api/v1/api-keys/${revokeTarget.id}`, {
        method: "DELETE",
        token: session?.access_token,
      });
      setRevokeTarget(null);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key.");
    } finally {
      setRevoking(false);
    }
  }

  const claudeCommand = `claude mcp add --transport http int-ai ${MCP_URL} --header "Authorization: Bearer <your-key>"`;
  const desktopConfig = JSON.stringify(
    {
      mcpServers: {
        "int-ai": {
          command: "npx",
          args: ["-y", "mcp-remote", MCP_URL, "--header", "Authorization: Bearer <your-key>"],
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Keys let Claude and other MCP clients create jobs, review candidates, and check pipeline status on your behalf.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Key</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connect to Claude</CardTitle>
          <CardDescription>
            Claude can create jobs, review candidates, and report pipeline status through this MCP endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <ol className="list-decimal space-y-4 pl-5">
            <li className="space-y-2">
              <p className="font-medium">Create an API key</p>
              <p className="text-muted-foreground">
                Click <strong>Create Key</strong> above, give it a name such as the device it will live on, and copy the
                key. It is shown only once.
              </p>
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                Create Key
              </Button>
            </li>

            <li className="space-y-2">
              <p className="font-medium">Hosted MCP URL</p>
              <div className="flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">{MCP_URL}</pre>
                <CopyButton value={MCP_URL} />
              </div>
              <p className="text-muted-foreground">
                Requests must carry the header <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;your-key&gt;</code>.
              </p>
            </li>

            <li className="space-y-2">
              <p className="font-medium">Claude Code</p>
              <p className="text-muted-foreground">Run once in a terminal, replacing <code>&lt;your-key&gt;</code>:</p>
              <div className="flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">{claudeCommand}</pre>
                <CopyButton value={claudeCommand} />
              </div>
            </li>

            <li className="space-y-2">
              <p className="font-medium">Claude Desktop</p>
              <p className="text-muted-foreground">
                Settings → Developer → Edit Config, then add this to <code>claude_desktop_config.json</code> and restart
                Claude Desktop:
              </p>
              <div className="flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">{desktopConfig}</pre>
                <CopyButton value={desktopConfig} />
              </div>
            </li>

            <li className="space-y-1">
              <p className="font-medium">Try it</p>
              <p className="text-muted-foreground">
                Ask Claude: <em>&quot;List my published jobs and show who is shortlisted for each.&quot;</em>
              </p>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Keys act as you, inside your organisation only. Revoke a key below if a device is lost. Claude.ai&apos;s
            connector directory needs OAuth and is not supported yet.
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading API keys...</p>
          ) : keys.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No API keys yet. Create one to connect Claude.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <SortableTh label="Key" sortKey="key_prefix" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <SortableTh label="Last used" sortKey="last_used_at" sort={sort} onSort={toggleSort} className="pb-2 pr-4" />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedKeys.map((key) => (
                    <tr key={key.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{key.name}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{key.key_prefix}\u2026</td>
                      <td className="py-3 pr-4">
                        <Badge variant={key.revoked_at ? "outline" : "default"}>
                          {key.revoked_at ? "revoked" : "active"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{formatDateTime(key.created_at)}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{formatDateTime(key.last_used_at)}</td>
                      <td className="py-3">
                        {!key.revoked_at && (
                          <Button variant="outline" size="sm" onClick={() => setRevokeTarget(key)}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => (!open ? closeCreate() : setCreateOpen(true))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKey ? "Copy your new key" : "Create API key"}</DialogTitle>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This is the only time the full key is shown. Store it somewhere safe.
              </p>
              <div className="flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">{createdKey}</pre>
                <CopyButton value={createdKey} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                placeholder="e.g. Claude Code on my laptop"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
              />
            </div>
          )}
          <DialogFooter>
            {createdKey ? (
              <Button onClick={closeCreate}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeCreate} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={() => void handleCreate()} disabled={!newName.trim() || creating}>
                  {creating ? "Creating..." : "Create"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => (!open ? setRevokeTarget(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Any client using <strong>{revokeTarget?.name}</strong> will stop working immediately. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleRevoke()} disabled={revoking}>
              {revoking ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

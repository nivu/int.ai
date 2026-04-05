"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { backendFetch } from "@/lib/api/backend";
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
  email: string;
  full_name: string | null;
  role: "admin" | "recruiter" | "hiring_manager";
  status: "active" | "invited" | "deactivated";
}

interface InterviewTemplate {
  id: string;
  name: string;
}

interface OrgSettings {
  scoring_weights?: {
    skill: number;
    experience: number;
    culture: number;
  };
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
          Manage your team, scoring defaults, and data retention
        </p>
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="defaults">Defaults</TabsTrigger>
          <TabsTrigger value="retention">Data Retention</TabsTrigger>
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
      </Tabs>
    </div>
  );
}

// ===========================================================================
// Team Tab (T079)
// ===========================================================================

function TeamTab() {
  const supabase = createClient();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMember["role"]>("recruiter");
  const [inviting, setInviting] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<TeamMember | null>(
    null
  );

  // Fetch members
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("team_members")
        .select("id, email, full_name, role, status")
        .order("created_at", { ascending: true });
      setMembers((data as TeamMember[]) ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invite member
  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { data: inserted, error } = await supabase
        .from("team_members")
        .insert({
          email: inviteEmail.trim(),
          role: inviteRole,
          status: "invited",
        })
        .select()
        .single();

      if (error) throw error;

      // Send invitation email via backend
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        try {
          await backendFetch("/api/invitations/send", {
            method: "POST",
            token: session.access_token,
            body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
          });
        } catch {
          // Email send may fail but member is still created
          console.warn("Invitation email could not be sent.");
        }
      }

      setMembers((prev) => [...prev, inserted as TeamMember]);
      setInviteEmail("");
      setInviteRole("recruiter");
      setInviteOpen(false);
    } catch (err) {
      console.error("Failed to invite member:", err);
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, supabase]);

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
                    <th className="pb-2 pr-4 font-medium">Name / Email</th>
                    <th className="pb-2 pr-4 font-medium">Role</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <p className="font-medium">
                          {member.full_name || member.email}
                        </p>
                        {member.full_name && (
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        )}
                      </td>
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
                {deactivateTarget?.full_name || deactivateTarget?.email}
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

  const [weights, setWeights] = useState({ skill: 0.4, experience: 0.35, culture: 0.25 });
  const [threshold, setThreshold] = useState(70);
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<InterviewTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch current settings + templates
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

      // Fetch org settings
      const { data: org } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", profile.org_id)
        .single();

      if (org?.settings) {
        const s = org.settings as OrgSettings;
        if (s.scoring_weights) setWeights(s.scoring_weights);
        if (s.screening_threshold != null) setThreshold(s.screening_threshold);
        if (s.default_template_id) setTemplateId(s.default_template_id);
      }

      // Fetch templates
      const { data: tmpl } = await supabase
        .from("interview_templates")
        .select("id, name")
        .eq("org_id", profile.org_id)
        .order("name");

      setTemplates((tmpl as InterviewTemplate[]) ?? []);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redistribute weights to sum to 1.0 when one slider changes
  function handleWeightChange(
    key: "skill" | "experience" | "culture",
    raw: number
  ) {
    const newVal = Math.max(0, Math.min(1, raw));
    const others = (["skill", "experience", "culture"] as const).filter(
      (k) => k !== key
    );
    const remaining = 1 - newVal;
    const otherSum = others.reduce((s, k) => s + weights[k], 0);

    const updated = { ...weights, [key]: newVal };
    if (otherSum > 0) {
      for (const k of others) {
        updated[k] = (weights[k] / otherSum) * remaining;
      }
    } else {
      for (const k of others) {
        updated[k] = remaining / others.length;
      }
    }

    setWeights(updated);
    setSaved(false);
  }

  // Save
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

      const settings: OrgSettings = {
        scoring_weights: {
          skill: Math.round(weights.skill * 1000) / 1000,
          experience: Math.round(weights.experience * 1000) / 1000,
          culture: Math.round(weights.culture * 1000) / 1000,
        },
        screening_threshold: threshold,
        default_template_id: templateId || undefined,
      };

      const { error } = await supabase
        .from("organizations")
        .update({ settings })
        .eq("id", profile.org_id);

      if (error) throw error;
      setSaved(true);
    } catch (err) {
      console.error("Failed to save defaults:", err);
    } finally {
      setSaving(false);
    }
  }, [supabase, weights, threshold, templateId]);

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Scoring Weights</CardTitle>
          <CardDescription>
            Adjust how much each dimension contributes to the overall score.
            Weights automatically redistribute to sum to 1.0.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["skill", "experience", "culture"] as const).map((key) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="capitalize">{key}</Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {(weights[key] * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(weights[key] * 100)}
                onChange={(e) =>
                  handleWeightChange(key, Number(e.target.value) / 100)
                }
                className="w-full accent-primary"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Screening Threshold</CardTitle>
          <CardDescription>
            Minimum overall score (0-100) for a candidate to pass screening.
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

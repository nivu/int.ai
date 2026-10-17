"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { backendFetch, BackendError } from "@/lib/api/backend";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Types (mirror backend/app/api/client_access.py)
// ---------------------------------------------------------------------------

interface ClientGrant {
  id: string;
  hiring_post_id: string;
  email: string;
  client_company: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface InviteClientResponse {
  grant: ClientGrant;
  email_sent: boolean;
}

async function getToken(): Promise<string | undefined> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof BackendError) return error.detail || error.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClientAccessCard({ jobId }: { jobId: string }) {
  const [grants, setGrants] = useState<ClientGrant[] | null>(null);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const token = await getToken();
        const response = await backendFetch<{ items: ClientGrant[] }>(
          `/api/v1/jobs/${jobId}/client-access`,
          { token }
        );
        if (!cancelled) setGrants(response.items ?? []);
      } catch (err) {
        console.warn("Client access unavailable for this job:", err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Hidden while loading and on any load error (e.g. recruiters get 403).
  if (grants === null) return null;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setWarning(null);
    try {
      const token = await getToken();
      const result = await backendFetch<InviteClientResponse>(
        `/api/v1/jobs/${jobId}/client-access`,
        {
          method: "POST",
          body: JSON.stringify({ email, client_company: company }),
          token,
        }
      );
      setGrants((prev) => [result.grant, ...(prev ?? [])]);
      setEmail("");
      setCompany("");
      if (!result.email_sent) {
        setWarning("Access granted, but the invitation email could not be sent.");
      }
    } catch (err) {
      setError(describeError(err, "Failed to grant access."));
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(grant: ClientGrant) {
    if (!window.confirm(`Revoke access for ${grant.email}?`)) return;
    setError(null);
    setWarning(null);
    try {
      const token = await getToken();
      await backendFetch<{ status: string }>(
        `/api/v1/jobs/${jobId}/client-access/${grant.id}`,
        { method: "DELETE", token }
      );
      setGrants((prev) => (prev ?? []).filter((g) => g.id !== grant.id));
    } catch (err) {
      setError(describeError(err, "Failed to revoke access."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client access</CardTitle>
        <CardDescription>
          Give a client read-only access to this job. Clients can see this
          job&apos;s candidates, screening scores, interview reports, recruiter
          notes and scoring settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleInvite}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="client-company">Company (optional)</Label>
            <Input
              id="client-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={inviting}>
            {inviting ? "Inviting..." : "Invite"}
          </Button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {warning && <p className="text-sm text-amber-600">{warning}</p>}

        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No clients have access yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {grants.map((grant) => (
              <li
                key={grant.id}
                className="flex items-center justify-between gap-4 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{grant.email}</p>
                  <p className="text-muted-foreground">
                    {grant.client_company ? `${grant.client_company} · ` : ""}
                    {new Date(grant.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="outline" onClick={() => handleRevoke(grant)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

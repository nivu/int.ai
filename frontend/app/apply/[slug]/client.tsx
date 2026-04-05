"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplicationForm } from "@/components/candidate/application-form";

interface HiringPost {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  description: string | null;
  shareSlug: string;
}

interface ApplyPageClientProps {
  hiringPost: HiringPost;
}

export function ApplyPageClient({ hiringPost }: ApplyPageClientProps) {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="text-xl">Application Submitted!</CardTitle>
            <CardDescription>
              Check your email for a confirmation with your portal link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Thank you for applying to{" "}
              <span className="font-medium text-foreground">
                {hiringPost.title}
              </span>
              . We will review your application and get back to you shortly.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      {/* Job details */}
      <div className="mb-8 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {hiringPost.title}
        </h1>

        <div className="flex flex-wrap gap-2">
          {hiringPost.department && (
            <Badge variant="secondary">{hiringPost.department}</Badge>
          )}
          {hiringPost.location && (
            <Badge variant="outline">{hiringPost.location}</Badge>
          )}
        </div>

        {hiringPost.description && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: hiringPost.description }}
          />
        )}
      </div>

      {/* Divider */}
      <hr className="mb-8 border-muted-foreground/20" />

      {/* Application form */}
      <Card>
        <CardHeader>
          <CardTitle>Apply for this position</CardTitle>
          <CardDescription>
            Fill out the form below to submit your application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationForm
            hiringPostId={hiringPost.id}
            shareSlug={hiringPost.shareSlug}
            onSuccess={() => setSubmitted(true)}
          />
        </CardContent>
      </Card>
    </main>
  );
}

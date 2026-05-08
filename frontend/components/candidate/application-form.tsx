"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/shared/file-upload";

interface ApplicationFormProps {
  hiringPostId: string;
  shareSlug: string;
  onSuccess: () => void;
}

interface FormData {
  full_name: string;
  email: string;
  phone: string;
  current_role: string;
  current_company: string;
  years_experience: string;
  location: string;
}

const initialFormData: FormData = {
  full_name: "",
  email: "",
  phone: "",
  current_role: "",
  current_company: "",
  years_experience: "",
  location: "",
};

export function ApplicationForm({
  hiringPostId,
  shareSlug,
  onSuccess,
}: ApplicationFormProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  const isValid =
    formData.full_name.trim() !== "" &&
    formData.email.trim() !== "" &&
    resumePath !== null;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      // Submit via Next.js proxy (avoids cross-origin issues)
      const res = await fetch("/api/applications/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hiring_post_id: hiringPostId,
          full_name: formData.full_name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim() || null,
          current_role: formData.current_role.trim() || null,
          current_company: formData.current_company.trim() || null,
          years_experience: formData.years_experience
            ? parseInt(formData.years_experience, 10)
            : null,
          location: formData.location.trim() || null,
          photo_url: photoPath || null,
          resume_url: resumePath,
          resume_filename: resumeFilename || "resume",
        }),
      });

      console.log("[ApplicationForm] submit response status:", res.status);

      if (res.status === 409) {
        setAlreadyApplied(true);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.detail ?? "Something went wrong. Please try again.");
        return;
      }

      // Trigger confirmation email (best-effort, fire-and-forget)
      fetch("/api/email/application-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_email: formData.email.trim().toLowerCase(),
          candidate_name: formData.full_name.trim(),
          hiring_post_id: hiringPostId,
          share_slug: shareSlug,
        }),
      }).catch(() => {});

      onSuccess();
    } catch (err) {
      console.error("[ApplicationForm] submit error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyApplied) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-6 py-8 text-center space-y-3">
        <p className="text-2xl">📋</p>
        <p className="font-semibold text-amber-900 dark:text-amber-100">
          You&apos;ve already applied for this position
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          We already have an application on file for{" "}
          <strong>{formData.email.trim().toLowerCase()}</strong>. Check your
          email for your application confirmation and portal link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Personal Information */}
      <div className="space-y-4">
        <h3 className="text-base font-medium">Personal Information</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full_name">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="full_name"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              placeholder="Jane Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="jane@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="San Francisco, CA"
            />
          </div>
        </div>
      </div>

      {/* Professional Information */}
      <div className="space-y-4">
        <h3 className="text-base font-medium">Professional Background</h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="current_role">Current Role</Label>
            <Input
              id="current_role"
              name="current_role"
              value={formData.current_role}
              onChange={handleChange}
              placeholder="Software Engineer"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="current_company">Current Company</Label>
            <Input
              id="current_company"
              name="current_company"
              value={formData.current_company}
              onChange={handleChange}
              placeholder="Acme Inc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="years_experience">Years of Experience</Label>
            <Input
              id="years_experience"
              name="years_experience"
              type="number"
              min="0"
              max="50"
              value={formData.years_experience}
              onChange={handleChange}
              placeholder="5"
            />
          </div>
        </div>
      </div>

      {/* Photo Upload */}
      <FileUpload
        label="Photo (optional)"
        accept=".jpg,.jpeg,.png"
        bucket="photos"
        path={`candidates`}
        onUpload={(storagePath) => setPhotoPath(storagePath)}
      />

      {/* Resume Upload */}
      <FileUpload
        label="Resume *"
        accept=".pdf,.docx"
        maxSize={5 * 1024 * 1024}
        bucket="resumes"
        path={`applications/${hiringPostId}`}
        onFileSelect={(file) => setResumeFilename(file.name)}
        onUpload={(storagePath) => setResumePath(storagePath)}
      />

      <Button
        type="submit"
        size="lg"
        disabled={!isValid || submitting}
        className="w-full"
      >
        {submitting ? "Submitting..." : "Submit Application"}
      </Button>
    </form>
  );
}

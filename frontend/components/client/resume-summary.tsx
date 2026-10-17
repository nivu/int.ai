import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ResumeSummaryProps {
  candidate: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
  } | null;
  resumeData: {
    parsed_name: string | null;
    parsed_summary: string | null;
    parsed_skills: string[] | null;
    parsed_experience: { company?: string; role?: string; title?: string; duration?: string; description?: string }[] | null;
    parsed_education: { degree?: string; institution?: string }[] | null;
  } | null;
}

export function ResumeSummary({ candidate, resumeData }: ResumeSummaryProps) {
  const name = candidate?.full_name || resumeData?.parsed_name;
  const linkedin = candidate?.linkedin_url;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {name && <p>Name: {name}</p>}
          {candidate?.email && <p>Email: {candidate.email}</p>}
          {candidate?.phone && <p>Phone: {candidate.phone}</p>}
          {linkedin && (
            <p>
              LinkedIn:{" "}
              {/^https?:\/\//i.test(linkedin) ? (
                <a
                  href={linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {linkedin}
                </a>
              ) : (
                linkedin
              )}
            </p>
          )}
          {resumeData?.parsed_name &&
            candidate?.full_name &&
            resumeData.parsed_name !== candidate.full_name && (
              <p className="text-xs text-muted-foreground">
                Name on resume: {resumeData.parsed_name}
              </p>
            )}
        </CardContent>
      </Card>

      {resumeData ? (
        <>
          {resumeData.parsed_summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{resumeData.parsed_summary}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {(resumeData.parsed_skills ?? []).map((skill, i) => (
                  <Badge key={i} variant="secondary">
                    {skill}
                  </Badge>
                ))}
                {(resumeData.parsed_skills ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No skills parsed</p>
                )}
              </div>
            </CardContent>
          </Card>

          {(resumeData.parsed_experience ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Experience</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(resumeData.parsed_experience ?? []).map((exp, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium">
                      {exp.title ?? exp.role ?? "Role"}{" "}
                      {exp.company && (
                        <span className="text-muted-foreground">at {exp.company}</span>
                      )}
                    </p>
                    {exp.duration && (
                      <p className="text-xs text-muted-foreground">{exp.duration}</p>
                    )}
                    {exp.description && <p className="mt-0.5">{exp.description}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(resumeData.parsed_education ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Education</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(resumeData.parsed_education ?? []).map((edu, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium">{edu.degree ?? edu.institution ?? "Education"}</p>
                    {edu.institution && edu.degree && (
                      <p className="text-xs text-muted-foreground">{edu.institution}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No resume data available
          </CardContent>
        </Card>
      )}
    </div>
  );
}

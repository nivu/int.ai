"use client";

import CandidateTable, { type ApplicationRecord } from "@/components/admin/candidate-table";
import { ExportCsvButton } from "@/components/client/export-csv-button";
import { RequestChangeDialog } from "@/components/client/request-change-dialog";
import { DownloadAllResumesButton } from "@/components/shared/resume-download";

export default function ClientCandidates({
  jobId,
  jobTitle,
  data,
}: {
  jobId: string;
  jobTitle: string;
  data: ApplicationRecord[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Candidates</h2>
        <div className="flex items-start gap-2">
          <ExportCsvButton rows={data} jobTitle={jobTitle} />
          <DownloadAllResumesButton jobId={jobId} />
          <RequestChangeDialog jobId={jobId} />
        </div>
      </div>
      <CandidateTable
        data={data}
        hiringPostId={jobId}
        readOnly
        detailHref={(appId) => `/client/jobs/${jobId}/candidates/${appId}`}
      />
    </div>
  );
}

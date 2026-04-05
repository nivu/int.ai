import { LoadingSpinner } from "@/components/shared/loading-spinner";

export default function PortalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

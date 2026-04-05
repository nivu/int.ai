import { LoadingSpinner } from "@/components/shared/loading-spinner";

export default function ApplyLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

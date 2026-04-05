"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface CompareButtonProps {
  selectedIds: string[];
}

export default function CompareButton({ selectedIds }: CompareButtonProps) {
  const router = useRouter();
  const count = selectedIds.length;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={count < 2}
      onClick={() =>
        router.push(`/candidates/compare?ids=${selectedIds.join(",")}`)
      }
    >
      Compare Selected ({count})
    </Button>
  );
}

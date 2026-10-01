"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import MatchDetailView from "./MatchDetailView";
import Skeleton from "./ui/Skeleton";

export default function MatchDetail({ listingId }: { listingId: Id<"listings"> }) {
  const detail = useQuery(api.matchesApi.detail, { listingId });

  if (detail === undefined) {
    return (
      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-hairline bg-surface p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (detail === null) {
    return <p className="mt-3 text-sm text-muted">No details available.</p>;
  }
  return <MatchDetailView detail={detail} />;
}

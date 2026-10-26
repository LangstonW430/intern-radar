import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "ingest simplify listings",
  { hours: 1 },
  internal.ingest.run,
  {},
);

// Hourly tick; each profile's frequency window (instant/daily/weekly)
// decides whether anything actually sends.
crons.hourly("digest tick", { minuteUTC: 40 }, internal.digest.tick, {});

// Strips JD text/extract/embedding from listings the feed dropped 14+ days
// ago and deletes their matches (storage budget; see prune.ts).
crons.daily(
  "prune inactive listings",
  { hourUTC: 9, minuteUTC: 15 },
  internal.prune.pruneInactive,
  {},
);

export default crons;

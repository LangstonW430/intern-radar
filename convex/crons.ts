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

export default crons;

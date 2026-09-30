import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "ingest simplify listings",
  { hours: 1 },
  internal.ingest.run,
  {},
);

export default crons;

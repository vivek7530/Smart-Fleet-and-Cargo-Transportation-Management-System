# Performance optimization notes

## Changes in this pass

- Staff dashboard and report summary now combine current/previous totals and chart-series data in one MongoDB aggregation per source collection, with `$facet` producing all results. This replaces 17 period-total and chart aggregations with 5 (12 fewer aggregation operations per request).
- Overdue-trip counting now compares `startDate` against the start of today in Asia/Kolkata directly, allowing MongoDB to use the trip status/date index instead of formatting each candidate date.
- Staff and driver dashboard views are separate client chunks. Production build output reported the dashboard first-load JavaScript changing from 384 kB to 253 kB.
- Development and production now use separate output folders (`.next-dev` and `.next`) so their manifests and vendor chunks cannot overwrite each other.
- Added trip completion-period indexes and a driver/date fuel index for report queries.
- Added `npm run db:performance-indexes` to create the new indexes in deployments where Mongoose automatic index creation is disabled. The command was not run against the configured database.

## Verify in a safe environment

1. Run `npm run typecheck` and `npm run build`.
2. Against an isolated copy of the database, compare dashboard and report totals before and after for the same date range, including current/previous estimated maintenance.
3. Use MongoDB `explain('executionStats')` on the report queries and compare documents examined and execution time.
4. For a production deployment, run `npm run db:performance-indexes` during a planned database maintenance window after reviewing the target connection.

## Limits

No live database was available for latency measurements or query-plan verification. End-to-end speed depends on the MongoDB host, network, dataset size, and deployment resources; this pass reduces known report-query work but does not establish a measured whole-site speedup.

# Monthly contracts

Creating a monthly contract or converting an open lead automatically selects the tenant's `Post Sale` workflow and its matching duration column. Standard durations are 12, 24, 36, 48, 60 and 72 months. WON and LOST stages support closing and remain outside the open monthly columns. Older custom durations remain supported by the API and receive a separate column. Setup is serialized per tenant, reuses existing open columns and creates missing ones without changing their IDs or names.

Monthly transfers remain in this workflow. Future occurrences inherit the workflow and duration column. An in-flight scheduler skips a root whose workflow has changed before its transaction claims that root.

Existing records require an explicit tenant-specific regrouping; the release does not move other workspaces' records at startup. After a database backup, run:

```sh
NODE_PATH=/app/node_modules node regroup-monthly-deals.cjs <Post-Sale-pipeline-id> <private-snapshot-path>
```

The target must be named `Post Sale` and contain the relevant open duration columns. The script saves a private snapshot, moves all monthly occurrences in that tenant, records stage history, and preserves amounts, customer links, monthly counters and OPEN/WON/LOST outcomes. Re-running it adds no duplicate moves. Keep the snapshot with the database backup for rollback.

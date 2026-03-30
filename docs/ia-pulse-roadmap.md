# IA Pulse Roadmap

## Product Focus

IA Pulse should become the operational cockpit for a salesperson working a live lead, not just a page that returns text.

Core product pillars:

1. Context first
IA Pulse must assemble CRM reality before making recommendations: deal stage, client data, task pressure, invoice history, related deals, proposal presence, and stage history.

2. Recommendations that can be executed
Every insight should map to an immediate action such as creating a task, sending a follow-up, moving stage, opening client record, or preparing a proposal.

3. Commercial coaching
The page should explain why a lead is healthy or blocked, highlight proof points, and surface the next action with a deadline.

## Delivered On `dev`

1. CRM 360 endpoint
Backend endpoint `POST /ia/crm-360` now aggregates lead context, tasks, invoices, related deals, stage history, signals, and coach suggestions.

2. Lead 360 UI
The IA Pulse page now shows a 360 card with:
- client snapshot
- key signals
- alerts
- recent tasks
- recent invoices
- related deals
- stage history

3. Action center
The page now exposes:
- coach priority
- proof points
- blockers
- one-click "use 360 context"
- one-click "copy 360 brief"
- one-click "open client record"
- task creation from suggested actions

4. Stronger lead analysis UX
CRM lead analysis now reuses the 360 context and displays strengths and risks in addition to reasons and next actions.

## Next 7 Days

1. Add timeline activity feed
Merge stage moves, tasks, invoices, notes, and proposal uploads into a single chronological feed.

2. Add one-click follow-up generation
Map coach suggestions to generated email and WhatsApp drafts directly, not only task creation.

3. Add proposal intelligence
When a PDF proposal exists, let IA Pulse summarize it, extract objections/risk, and compare it to the current deal stage.

4. Add lead comparison
Compare the current lead to recent won and lost deals from the same pipeline.

## Next 30 Days

1. Sales copilot panel inside CRM
Expose IA Pulse in a side panel from each pipeline card without leaving the board.

2. Forecast intelligence
Aggregate lead scores into weekly and monthly close forecasts by owner and pipeline.

3. Objection memory
Store recurring objections, preferred channels, decision patterns, and response latency per account.

4. Automated sequences
Generate follow-up sequences by stage and trigger reminders when a lead is stalling.

## Guardrails

1. Never hide raw CRM facts behind AI summaries.
2. Recommendations should always cite concrete signals.
3. Actions must stay tenant-scoped and traceable.
4. The page should remain useful when external AI providers fail.

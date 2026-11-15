# Planning documents (not implementation)

Everything in this folder is **planning**. Nothing here has been built, migrated, deployed or activated, and nothing here is an implementation decision until it appears in `APPROVED_DECISIONS.md` with the owner's approval.

| Document                                                                 | Purpose                                                                                                           | Status                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [`APPROVED_DECISIONS.md`](APPROVED_DECISIONS.md)                         | The owner's recorded decisions and the limits on them. The only file here that binds the work.                    | Approved 2026-11-15                         |
| [`V1_IMPLEMENTATION_SEQUENCE.md`](V1_IMPLEMENTATION_SEQUENCE.md)         | Ordered V1 build steps, split by what existing infrastructure covers, what needs content, and what needs approval | **For review. Not started.**                |
| [`SQL_PROPOSALS_NOT_APPLIED.md`](SQL_PROPOSALS_NOT_APPLIED.md)           | Exact SQL and tests for pathway preferences, fasting plans and dance styles                                       | **Proposal. Not a migration. Not applied.** |
| [`DANCEHALL_REGGAE_CONTENT_PLAN.md`](DANCEHALL_REGGAE_CONTENT_PLAN.md)   | How original or licensed Dancehall and reggae choreography can enter the product                                  | Proposal                                    |
| [`LOCAL_NOTIFICATIONS_EVALUATION.md`](LOCAL_NOTIFICATIONS_EVALUATION.md) | Evaluation of local reminders (no dependency added, no build)                                                     | Evaluation only                             |
| [`../WEIGHT_MANAGEMENT_EXPANSION.md`](../WEIGHT_MANAGEMENT_EXPANSION.md) | The audit, engine design, safety requirements and roadmap                                                         | Approved direction; details still open      |

Rules for this folder: no SQL file lives here (SQL is in fenced blocks inside a proposal so tooling can never apply it); every document states what it does **not** do; a proposal becomes a real file under `supabase/migrations/` only after the owner approves that specific migration.

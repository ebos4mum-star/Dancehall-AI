# Community moderation runbook (DRAFT for the owner's approval)

Designed for **one authorized staff member** (the moderator), with a named **escalation contact** (the owner, or someone they appoint). Nothing here is staffed yet: see "Decisions needed".

## Principles

1. Nothing a person posts as a photo or video is visible to others until the moderator approves it.
2. The moderator sees what they need and no more: username, content, reasons, ages. Never an account id, an email address, a health record or a member's real identity.
3. Every moderator action is recorded in the tamper-evident audit log (who, what, when, which item). The log holds identifiers and the action, never the member's words or photos.
4. When review cannot keep up, Community slows itself down instead of letting unchecked content through.
5. When in doubt, remove. A member can post again; a harmful post cannot be un-seen.

## Access

- A staff account with the `moderator` role, which grants only `moderation.review`.
- Password **and** an authenticator-app code (second factor) at every sign-in. Without a verified second factor the console stays locked and the server refuses every moderation call.
- The sign-in token lives in the browser tab's memory only. Closing the tab signs out.
- One person holds the role. A second person should be a named backup (see "Cover").

## The console (`apps/admin`, Moderation)

- **Backlog banner:** how many items are open, how many are urgent, how many carry photos or video, how long the oldest has waited, and whether anything is past its target.
- **Queue:** urgent first, then reported, then oldest. Each item shows the username, the text, any photos or video (short-lived private links), the report reasons, and the written procedure for that kind of item.
- **Actions:** Approve (publishes; resolves open reports), Remove (hides for everyone including the author and deletes the files; needs a short note), Restrict the author, and a **Community mode** switch.
- **Restrictions:** Muted (cannot post, comment or upload; can still read, encourage and report) or Suspended (no member actions). Both can have an end time; a suspension needs a note. Lifting a restriction is the same form with "none".

## Targets (proposed, for approval)

| What                                                           | Target                                         |
| -------------------------------------------------------------- | ---------------------------------------------- |
| Urgent item (self-harm, a possible child, private information) | Looked at within **4 hours**, in staffed hours |
| Everything else, including every photo and video               | Within **48 hours**                            |

Targets are goals to measure against, not promises to members. The Terms say so.

## Automatic safeguards when review falls behind

- If **20 or more** photo/video posts are waiting, or any has waited **more than 72 hours**, new photo and video posting pauses by itself (members can still share text). It reopens when the queue clears.
- The moderator can set **Text only** (pause photos and videos) or **Read only** (no new posts or comments) at any time, for example before a holiday or after a flood of reports. Reading, reporting, deleting and leaving always work.
- The member app shows a plain notice when something is paused.
- Reports hide content automatically (3 different reporters, or one report for self-harm, private information or a child) so the community is protected while review is pending.
- Per-member daily limits and per-minute burst limits slow spammers and floods.

## Handling each kind of item

The same steps appear in the console next to each item.

- **Photo or video review.** Look at every file in full. Remove anything with a child, nudity, someone who has not clearly agreed, or a place that shows where someone lives; remove before-and-after pairs that shame a body or promote fast weight loss. Approve only if you would be comfortable with it being the first thing a new member sees.
- **Someone may need help (urgent).** Keep it hidden. Do not contact the member outside the app and do not guess where they are. Record the action; tell the escalation contact the same day. The member sees only a "hidden while we review it" note on their own post together with a gentle line pointing to a doctor, someone they trust or a local crisis line. Do not penalise a member for asking for help.
- **A child may be involved (urgent).** Keep it hidden; do not copy or forward it. Record the action; tell the escalation contact the same day. Legal reporting duties are for the escalation contact and counsel to decide.
- **Private information (urgent).** Remove now; mute 24 hours if it was deliberate or repeated.
- **Harassment.** Remove; first time mute 24 hours, repeat 7 days, then suspend.
- **Body shaming or disordered-eating content.** Remove; mute if it targets someone else. Do not engage with a member about their own health.
- **Health claims and numbers.** Remove if it promotes fast weight loss, medicines, diet products or numbers about a body. Approve harmless false alarms. Never edit a member's words.
- **Spam or selling.** Remove; mute 24 hours; suspend if it continues.
- **Impersonation.** Mute with reason "impersonation"; the member can still change their username (which is allowed while muted). If they do not, suspend.

## Escalation

1. The escalation contact is named in the staff handbook (open decision). They are told the **same day** about any self-harm, child-safety or legal-threat item.
2. For self-harm: the app already shows the member support information when they try to post such words. Beyond that, any outreach or emergency step is the escalation contact's decision, taken with the member's safety and privacy in mind. The moderator does not investigate who the member is.
3. For a child-safety item: hide, record, escalate. Preserve nothing outside the system.
4. For a legal request or press enquiry: do not respond; pass to the escalation contact.

## Cover and absence

- Before any absence of more than a day, set the mode to **Text only** (or **Read only** for a long one) and say so in the app's Help.
- A named backup moderator should hold the role during absences. (Open decision.)
- If the moderator is the one person who can act, the automatic pause is the safety net; it does not replace review of existing items.

## Appeals

A member who thinks a decision was wrong uses the contact route in Help. A different person from the original moderator should review (only possible with a second person). Until there is one, the owner reviews appeals. (Open decision.)

## Audit and review

- Review the audit log monthly: counts of approvals, removals, restrictions, mode changes, and time-to-first-action against the targets.
- Review the word lists quarterly with a safeguarding adviser; the current lists are a starter set.

## Decisions needed

1. Who is the moderator, and who is the backup?
2. Who is the escalation contact, and how do they receive an urgent notice? (Today the app has **no push, email or SMS alert**: the console banner is the only signal. Reaching a person out of hours needs an external provider or a routine of checking the console; see below.)
3. Are the proposed targets (4 h urgent / 48 h) realistic for your staffing?
4. How are appeals handled and by whom?
5. Which countries' child-safety reporting rules apply at launch?

# Content Licensing

Status: **nothing is licensed or purchased.** No music, video or instructor content exists in the repository. Placeholder screens show honest empty states, not stand-in classes.
No workout video or music may be distributed publicly until its rights are cleared in writing (gates L1, L2, L3).

## 1. Rights to clear

| Asset                       | What must be cleared                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Music                       | **Two rights** for commercial recordings: the composition (publishing) and the sound recording (master), for synchronization with video and for in-app use. Options: commissioned music with a written buyout; royalty-free libraries with terms that allow app-based fitness distribution; licensed catalogue (typically costly and territory-limited). Streaming-service playlists are **not** licensed for redistribution inside the app. |
| Video                       | Shoot agreements, performer releases, location and trademark clearance, choreography ownership or licence.                                                                                                                                                                                                                                                                                                                                   |
| Instructors                 | Contract covering name, image, voice, likeness, term, territories, exclusivity, payment, takedown and ending of the relationship.                                                                                                                                                                                                                                                                                                            |
| User clips (Dance-to-Share) | User licence terms, music used in clips, ability to remove content, minors excluded, moderation (gates M1, M2, L3).                                                                                                                                                                                                                                                                                                                          |
| Nutrition data              | USDA FoodData Central (public domain, follow its terms); Open Food Facts (ODbL: attribution and share-alike obligations for the database). Commercial databases need their own licence.                                                                                                                                                                                                                                                      |
| Illustrations and fonts     | Commissioned with a written assignment or licensed with terms that allow app distribution.                                                                                                                                                                                                                                                                                                                                                   |

## 2. Territory and term

Licences differ by country and expire. Each `licences` record (Phase 3) stores asset, rights type, territories, start, end and evidence. Content is shown only in countries where a **cleared** record covers it; an expired record automatically unpublishes dependent content.

## 3. Workflow (admin portal, Phase 3)

1. Upload or register an asset (draft, never public).
2. Attach licence records and the professional review (fitness or nutrition).
3. A person with `licensing.manage` marks the licence cleared; a person with `content.publish` publishes.
4. Takedown path: unpublish, record reason, notify affected people where required.

## 4. Practical guidance for the beta

Prefer commissioned or royalty-free music with written terms covering worldwide in-app fitness use; a small launch library; instructors under written agreements. Do not use commercial dancehall, Afrobeats or other charting tracks without both rights in writing.
Obtain legal advice on music and likeness agreements before signing anything.

## 5. Open decisions

Production plan (own shoots, commission, or licensing), music sourcing, instructor roster, and budget. See DECISIONS.md.

## 6. Implemented in Batch C (database and admin foundations)

- **No licensed content exists.** The workout catalog is original text outlines; no music, video or instructor likeness is used anywhere.
- **Licence register** (`licences`, staff-only, `licensing.manage` plus MFA): asset kind, licensor, rights summary, territories (ISO country codes or `*`), start and end dates, and a reference to the signed agreement. A licence cannot be cleared without an agreement reference; clearing records who and when. Licences cannot be created already cleared, only drafted then cleared, and every change is written to the audit log.
- **Territorial access is enforced by the server.** Raw media rows are staff-only. People receive media only through `workout_playable_media`, which returns nothing unless the workout is published and **every** asset on it (video, music, likeness) is cleared for their country today, so licensed video is never shown with unlicensed music. Tests cover wrong country, no country, expiry, revocation and unpublished workouts.
- **Publishing gates** (also enforced in the database): an approved fitness review by someone other than the author, cleared in-date licences for all media, valid structure, and safety notes. Real instructors cannot be shown without a cleared likeness licence. Sample content is exempt only because it is permanently flagged as a sample and never public.
- **Expiry:** `workouts_unpublish_expired` (service role) withdraws any real workout whose licence has expired or been revoked. It still needs to be scheduled with the cloud project.
- **Admin portal:** the Content and Licensing pages show the publication checklist and a worked territory example from sample data. They are not connected to a database or sign-in yet.

# Global Readiness

The product target is global, but **no country is enabled by default.** Activating a country requires every gate below to be verified by a named person and recorded (a per-country record in the admin portal, Phase 1+).
In code this rule is `isCountryActive`: the manual switch and every gate must be true (implemented and tested).

## Country activation gates

| Gate                           | Question                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `privacy_law_reviewed`         | Has counsel confirmed consent, special-category health data handling, transfer mechanism (US hosting), notices and breach duties? |
| `billing_and_tax_reviewed`     | Are store subscriptions, local pricing, tax handling and refunds valid there?                                                     |
| `nutrition_content_reviewed`   | Are food data, units, labeling norms and cultural meals appropriate and reviewed?                                                 |
| `content_rights_cleared`       | Are music, video and likeness rights cleared for that territory?                                                                  |
| `safety_and_support_resources` | Are crisis and health support resources verified for that country?                                                                |
| `store_availability_confirmed` | Is the app available and compliant in that country's store listing?                                                               |

## Architecture prepared

| Need                     | Approach                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Country and region       | `profiles.country` (ISO 3166-1 alpha-2) at sign-up; `country_activations` table; app checks activation before enabling features                            |
| Time zones               | IANA time zone stored per profile; day boundaries, streaks and weekly reviews computed in the person's zone                                                |
| Units                    | Canonical metric storage; `unitSystem` per person; conversions in `packages/shared` (tested)                                                               |
| Localization             | All strings in `apps/mobile/src/i18n`; English now; locale list in `packages/shared`; plan for plural rules, date/number formats and right-to-left layouts |
| Cultural meals           | Regional tags on food references; starter set curated and reviewed; grows by region                                                                        |
| Regional food data       | Source per item; barcode coverage varies by country; fallback to manual entry                                                                              |
| Feature availability     | Feature flags by country; features can be off in countries where a gate is missing                                                                         |
| Subscription eligibility | Store-managed local pricing and currency display; the server only needs entitlement state                                                                  |
| Content restrictions     | Licence records by territory; videos are served only where cleared                                                                                         |
| Privacy                  | Consent text and version per country where needed; deletion and export for everyone                                                                        |

## Out of scope for now

Right-to-left layouts, languages other than English, local payment methods outside the app stores, and country-specific legal text. Each needs owner approval and review when added.

## Notes

- Hosting is in the US; some countries restrict or condition health-data transfers.
- Some countries restrict weight-loss promotion or health claims; copy review is per country.
- Age of majority varies; the beta is 18+ everywhere, and stricter local limits win.

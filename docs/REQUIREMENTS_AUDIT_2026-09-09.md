# FRD / PRD implementation audit — 9 September 2026

**Conclusion: the core attendance journey is implemented and locally tested, but the full FRD/PRD and referenced checklist are not complete. Hosted acceptance remains outstanding.**

## Sources and scope

Read `TFHC_Project_Documents/TFHC_FRD.md`, `TFHC_Project_Documents/TFHC_PRD.md`, and all 43 sections of `TFHC Orderliness Attendance Development Checklist.pdf`. Compared them with API services/controllers, Prisma models, member/admin pages, scheduled jobs and existing integration/browser tests. Source documents are locally ignored, so their paths may not exist in a fresh checkout.

This is a code and test-evidence audit, not a new production certification or security penetration test. Most recent completed regression evidence: 70 API integration tests and targeted desktop/mobile notification journeys. Earlier targeted GPS, RSVP, absence and analytics journeys passed. No new full suite was run for this documentation audit.

User decisions supersede the original documents: GPS-only attendance (no QR), member PWA with approved-email Google login, immutable email, deactivation instead of deletion, profile photos up to 2 MB, configurable weekly services, one-hour reminders to active approved members, and custom-event RSVPs. Native applications and QR must not be counted as missing work under this scope.

## Prioritized gaps

| Priority | Finding | Evidence / implication | Required follow-through |
|---|---|---|---|
| Demo gate | Hosted deployment and physical acceptance unverified | `render.yaml`, `docs/RENDER_DEMO.md`; local passes do not prove Render connectivity, OAuth origins, SMTP delivery or church GPS reception | Publish/deploy current code; verify health, approved Google login, SMTP delivery, an active service and physical check-in at church |
| High | Attendance percentages disagree across views | `reports.service.ts:getAnalytics` excludes excused/exempt; `scoring.service.ts:summarizePerformance` uses all records; close-out uses current active-member count; dashboard averages immutable summaries | Choose and implement one expected-attendance/excuse policy across personal scores, leaderboard, reports and summaries; test corrections and status changes |
| High | Follow-up evaluation is not automatic | `alerts.service.ts:evaluateFollowUpFlags` is exposed by an admin action, but no cron/close-out hook calls it | Schedule or trigger evaluation and ensure idempotency; test absent-member close-out through flag creation |
| High | Correction requests have API review but no admin review screen | `excuses.controller.ts` has correction review routes; admin absence page handles absence requests only | Add correction queue, decision/comment controls and member decision visibility; test audited approval and rejection |
| High | Reports overstate export coverage | `reports.service.ts:generateExcelReport` exports only the latest 1,000 attendance records in one worksheet; summary and audit cards call the same endpoint | Export complete filtered datasets, dedicated summaries and actual audit data; add pagination/streaming and large-export tests; CSV is also missing |
| High | Admin scoring/configuration incomplete | `shared/src/scoring.ts` defaults are used by callers; admin meeting form lacks grace-period and weight inputs; no general scoring/threshold settings UI | Expose validated, persisted settings and wire them into scoring; document whether changes affect historical records |
| High | Leaderboard filter controls are decorative | Member leaderboard fetches unfiltered data; This Month/Q3 2026/team buttons have no handlers. API already supports dates and subteam | Connect date/team controls; add category scope and configurable ranking where required |
| Medium | Expected attendees cannot be selected by group/event roster | Compulsory events use active roster; optional events use RSVP/commitments and recorded attendees | Add explicit eligible groups/members and enforce eligibility at check-in and close-out |
| Medium | Live monitor lacks expected/not-yet-present/rate cards | Live page polls attendance and shows present/status counts, but not the PRD's complete expected-versus-present view | Use the same eligibility policy as close-out to calculate live expected counts |
| Medium | Recurrence and one-off editing are incomplete | Weekly templates exist; meeting controller lacks a general occurrence edit route; no full fortnightly/monthly/custom recurrence UI | Add occurrence exceptions and further recurrence patterns without losing history |
| Medium | Manual attendance cannot enter actual arrival time | `attendance.service.ts:manualAttendance` uses current time for new records | Add entered arrival time and keep recorded-at timestamp distinct; validate/audit both |
| Medium | Rewards are statistics rather than configurable recognition | Member rewards page shows points/streaks; no configured eligibility/recognition engine | Add leadership rules and qualifying-member views |
| Medium | Notification coverage is partial | Reminders and absence decisions now create Activity items; checklist also lists check-in-open, missed meeting, correction, leadership thresholds and monthly-report notifications | Add remaining triggers when the associated workflows are complete; browser/OS push, SMS and WhatsApp are phase 2 |
| Medium | Device/fraud requirements only partly addressed | `deviceInfo` exists server-side but GPS page does not populate it; no unusual shared-device detection. Browser coordinates are client-supplied | Add appropriate device metadata and practical anomaly detection; do not claim browser GPS is spoof-proof |
| Medium | Offline admin fallback is online manual entry only | Service worker provides offline shell; no persistent offline attendance queue | Define paper-then-enter fallback or implement authenticated queued entry with conflict handling |

## FRD traceability

“Implemented” means an identifiable working code path, not acceptance of every edge case or hosted verification.

| Requirement | Assessment | Code evidence / remaining scope |
|---|---|---|
| FR-Auth-01 | Changed by user; implemented | Auth module: approved-email Google member login; administrator password login retained |
| FR-Profile-01 | Implemented core | Members module/schema; member/admin profile and 2 MB photo flow; membership status and account access preserved |
| FR-Meet-01 | Partial | Meetings and recurring-services modules; weekly templates and single events work; broader recurrence/occurrence editing missing |
| FR-Meet-02 | Partial | Time/location/radius backend and form; grace is supported by API but not exposed in custom-meeting form |
| FR-Meet-03 | Partial | Meeting/category weight fields and weighted calculations exist; administrator UI/configuration incomplete |
| FR-Chk-01 | Implemented | Member check-in page requests fresh geolocation; missing permission/fix blocks browser submission |
| FR-Chk-02 | Implemented with browser limitation | Shared Haversine and server validation enforce radius against submitted location; cannot authenticate physical GPS origin |
| FR-Chk-03 | Superseded | User explicitly selected GPS-only; no QR work required |
| FR-Chk-04 | Source discrepancy | Code uses expected-arrival threshold for Early, then start for On Time. This matches checklist section 9 better than FRD's overlapping Early/On Time definitions; preserve until policy is clarified |
| FR-Abs-01 | Implemented core | Minute cron closes ACTIVE meetings and writes absence records/summaries; scheduled events must first be activated |
| FR-Score-01 | Partial | Default rubric works; no administrator-managed rubric pipeline |
| FR-Score-02 | Partial / inconsistent | Formula helpers exist but expected/excused denominator differs between screens |
| FR-Score-03 | Implemented core | Early/on-time divided by present, including grace/late among present |
| FR-Lead-01 | Partial | Ranking works, but composite weights are not administrator-configurable; member filter UI not wired |
| FR-Thresh-01 | Partial | 2 consecutive / 3 total / below 70% rules exist; evaluation manually triggered; below-70 rule additionally requires 5 records, not stated in FRD |
| FR-Aud-01 | Partial end-to-end | Manual attendance and correction/approval audit records exist; correction review UI and entered arrival-time support missing |
| FR-Sec-01 | Implemented | Composite unique member/meeting attendance key and duplicate checks |
| FR-Sec-02 | Partial | Nullable deviceInfo storage, no complete collection/shared-device flagging flow |
| FR-Sec-03 | Limited by platform | Range/accuracy checks exist; no OS mock-provider detection in browser PWA |

## PRD and checklist coverage

| Checklist sections | Assessment |
|---|---|
| 1–3: purpose, roles, member database | Core profiles/access implemented; not every optional status/field/configuration choice is exposed (e.g. dedicated New Member status) |
| 4–6: events, categories, recurrence | Single and weekly events implemented; eligible group selection, full category administration, occurrence overrides and additional recurrence patterns incomplete |
| 7–9: GPS, check-in, time classification | Core implementation tested; physical acceptance pending; Early boundary differs from abbreviated FRD |
| 10–15: statuses, absences, scoring, percentages | Core supported statuses/absence engine exist; Very Late and attendance Pending Review are not distinct attendance enum values; scoring/excuse policy not configurable |
| 16–18: profiles, leaderboard, formula | Personal metrics and ranking exist; filters/configurable ranking and weights incomplete |
| 19–22: rewards, streaks, thresholds | Streaks implemented; rewards engine missing; thresholds fixed and manually evaluated |
| 23–25: excuses, manual entry, corrections | Absence approval is end-to-end; manual audited entry exists; correction review UI/comments and true arrival-time input incomplete |
| 26–29: live view, close-out, dashboards, trends | Live attendance, close-out snapshots and real-data charts exist; expected/live absence counts and several requested aggregate metrics remain missing |
| 30–31: reports and exports | Rolling 7/30/90/365 views exist; custom/calendar periods and full member/team/category reporting incomplete; XLSX capped at 1,000; CSV/PDF not implemented |
| 32: notifications | Reminder email + Activity and absence decisions implemented; broader event/leadership triggers missing |
| 33–37: fraud, event-based location, QR, audit | One-shot location and duplicate prevention work; device detection incomplete; QR superseded; audit storage exists but no dedicated viewer/export |
| 38: MVP | Substantial core implemented; not fully complete because of gaps above |
| 39: phase 2 | Some charts/streaks delivered; WhatsApp, SMS, push, automated monthly reports, competitions, heatmaps and engagement score not complete |
| 40–42: navigation, critical settings, record fields | Main navigation/record fields largely exist; general settings and audit-review workflows incomplete |
| 43: definition of done | Not yet satisfied: hosted physical workflow, configurable expected attendees, recognition criteria and full period reporting/export remain |

PRD MVP acceptance is therefore partial: meeting creation/geofence/GPS/history/absence processing work in local tests, but expected-group selection, configuration, filters, comprehensive exports and production acceptance prevent a complete sign-off.

## Recommended order after this review

1. Complete hosted demo acceptance without claiming missing optional features are ready.
2. Unify expected-attendance and scoring policy; expose grace/weights; make follow-up evaluation automatic.
3. Complete correction review, live expected counts and leaderboard filters.
4. Fix export completeness and audit visibility.
5. Deliver broader recurrence, configurable thresholds/rewards and remaining notification triggers.

Do not silently change scoring or Early/On-Time policy solely to match one conflicting source. Record the chosen policy and test all dependent views together.

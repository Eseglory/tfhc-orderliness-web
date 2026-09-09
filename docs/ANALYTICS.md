# Attendance analytics

Admins and leaders open Reports & Data Export (`/admin/reports`) to view analytics. Choose the last 7, 30, 90 or 365 days and use Refresh analytics for updated records.

Charts show attendance classifications, present counts by service category, attendance over time, event RSVP totals and absence decisions. The service table provides dates in Africa/Lagos and the underlying present, absent and excused counts.

Attendance statistics include only closed services whose start time falls within the selected rolling period. Attendance rate is present / (present + absent); excused and exempt records are excluded. Present includes early, on-time, grace-period and late records. Punctuality is early plus on-time / present. Empty denominators display No data. These totals count service attendances, not unique members.

RSVP and absence charts show currently stored responses for noncancelled events starting in the selected period. They do not count future events or imply physical attendance. Active member count is the current roster count, not a historical snapshot.

The existing personal analytics page remains available to members and its rings reflect the member's actual percentages. The unit analytics endpoint requires an admin or leader role and returns aggregates without member identities.

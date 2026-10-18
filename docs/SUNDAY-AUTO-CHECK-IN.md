# Sunday automatic check-in

After a member's first physical GPS check-in for a Sunday Service, later services
in that category on the same Nigeria calendar day can be checked in automatically.
This applies whether the member starts with the first or a later service.

The member app checks every 30 seconds while visible, and when focus or connectivity
returns. Each eligible service requires a new GPS reading, no older than 60 seconds,
with accuracy of 100 metres or better. The existing server attendance operation
enforces the venue radius, active membership, event access, open attendance window,
attendance scoring and database uniqueness. No future attendance is pre-recorded.
Online meetings and other event categories are excluded. No schema migration is needed.

The banner explains that the app must remain open with location and internet enabled.
If automatic check-in fails, it retries and manual check-in remains available.
Returning after an attendance window has closed does not backdate attendance.
The session expires at midnight Africa/Lagos; the next Sunday requires a new check-in.

## Operational verification

Before production rollout, verify on both Android Chrome and iPhone Safari/PWA:

1. Check in manually for a physical Sunday Service while inside the venue.
2. Open a later Sunday Service's attendance window. With the member app visible,
   confirm automatic attendance and one record only, including with two tabs open.
3. Deny location, disconnect internet, and move outside the venue separately:
   confirm no automatic attendance and a visible retry message.
4. Restore access inside the venue before the window closes and confirm recovery.
5. Lock the phone, then reopen the app during the window and confirm a fresh check.
6. Confirm midweek, online, earlier services and the next calendar day are excluded.

Browsers cannot guarantee background GPS when the app is hidden, closed, or the phone
is locked. This feature does not claim continuous presence tracking or proof that
a person remained at church between services. Physical-device verification is required
to assess actual GPS behaviour at the church.

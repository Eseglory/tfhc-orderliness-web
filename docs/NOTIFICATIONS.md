# Notifications

The member Activity inbox (`/member/notifications`) shows unexpired notifications for the signed-in member, newest first (up to 100). Refresh reloads current activity. Mark all as read persists to the database. The home notification dot is shown only when unread items are returned.

Service reminders cover enabled recurring services and custom events. The configured default remains one hour before, to all active approved members. Both the approved roster entry and linked member must be active. If the administrator selects committed recipients, event RSVP takes precedence over weekly availability. A Not attending RSVP does not suppress reminders when the configured audience is all active approved members.

Each reminder creates an Activity item with a service link, then attempts SMTP email. A unique delivery key prevents repeated sends by overlapping runs. Email failure does not remove the Activity item; the communication delivery is marked FAILED. Ambiguous SMTP failures are not automatically retried. Reminder processing catches up at most 15 minutes after its due time, and requires the API scheduler to be running.

Absence approval and rejection create an Activity item in the same transaction as the decision, linked to the request history. These decision notifications are in-app only. This implementation does not deliver browser/OS push notifications.

SMTP verification checks TLS and authentication without sending mail. A successful check from the workspace does not verify Render network access or recipient inbox delivery. Hosted verification remains necessary after deployment.

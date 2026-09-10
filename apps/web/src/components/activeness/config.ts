/** Idle time before the "still there?" warning shows. */
export const IDLE_WARNING_MS = 28 * 60 * 1000;
/** Countdown length inside the warning before automatic sign-out. */
export const IDLE_GRACE_MS = 2 * 60 * 1000;
/** Activity events that count as "still active". */
export const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'] as const;

/** Profile fields a member is nudged to complete. */
export const REQUIRED_PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'phoneNumber', label: 'phone number' },
  { key: 'dateOfBirth', label: 'date of birth' },
  { key: 'gender', label: 'gender' },
  { key: 'address', label: 'address' },
  { key: 'profilePhotoUrl', label: 'profile photo' },
];

/** How many of the recent past meetings a member may miss before the nudge. */
export const ENGAGEMENT_LOOKBACK = 5;
export const ENGAGEMENT_MISS_THRESHOLD = 2;

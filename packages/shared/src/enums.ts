export enum Role {
  ADMIN = 'ADMIN',
  LEADER = 'LEADER',
  MEMBER = 'MEMBER',
}

export enum MemberStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  SUSPENDED = 'SUSPENDED',
  EXEMPT = 'EXEMPT',
  NEW_MEMBER = 'NEW_MEMBER',
}

export enum MeetingStatus {
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum AttendanceStatus {
  EARLY = 'EARLY',
  ON_TIME = 'ON_TIME',
  GRACE_PERIOD = 'GRACE_PERIOD',
  LATE = 'LATE',
  ABSENT = 'ABSENT',
  EXCUSED = 'EXCUSED',
  EXEMPT = 'EXEMPT',
}

export enum AttendanceMethod {
  SYSTEM_GEO_QR = 'SYSTEM_GEO_QR',
  SYSTEM_GEO = 'SYSTEM_GEO',
  MANUAL = 'MANUAL',
  CORRECTION_APPROVED = 'CORRECTION_APPROVED',
}

export enum ExcuseStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ExcuseCategory {
  ILLNESS = 'Illness',
  TRAVEL = 'Travel',
  WORK_SCHOOL = 'Work/School',
  FAMILY_COMMITMENT = 'Family Commitment',
  EMERGENCY = 'Emergency',
  APPROVED_CHURCH_ASSIGNMENT = 'Approved Church Assignment',
  OTHER = 'Other',
}

export enum RecurrenceFrequency {
  WEEKLY = 'WEEKLY',
  FORTNIGHTLY = 'FORTNIGHTLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}

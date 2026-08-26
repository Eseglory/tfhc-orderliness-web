# Functional Requirements Document (FRD)
**Project Name:** TFHC Orderliness Attendance & Participation Tracker
**Reference:** TFHC Orderliness Attendance Development Checklist.pdf
**Date:** August 2026

## 1. System Requirements & Constraints
* **Platform:** Mobile Application (Members) and Web-based Admin Portal (Leadership).
* **Connectivity:** Requires active internet and device location services for member check-in. Manual offline fallback provided for Admins.

## 2. Functional Modules
### 2.1. Member Authentication & Profiling
* **FR-Auth-01:** System shall authenticate users via unique Member ID/Email and password.
* **FR-Profile-01:** System shall store member profiles including ID, Name, Phone, Sub-team, Role, Date Joined, and Status (Active, Inactive, On Leave, Suspended, Exempt).

### 2.2. Meeting Management
* **FR-Meet-01:** Administrators shall be able to create single or recurring events with specific categories (e.g., Sunday Service, Training).
* **FR-Meet-02:** System shall support configurable meeting properties including Attendance Opening Time, Start Time, Grace Period, Closing Time, Coordinates, and Geofence Radius.
* **FR-Meet-03:** System shall support configurable meeting weightings (e.g., Training = 1.5x points).

### 2.3. Attendance Check-In Engine
* **FR-Chk-01:** System shall require device location enabled and permissions granted before check-in.
* **FR-Chk-02:** System shall calculate the linear distance between the device's GPS and the Meeting's GPS coordinates. Check-in is only permitted if Distance <= Geofence Radius.
* **FR-Chk-03:** System shall validate a meeting-specific QR code as a secondary verification step (Option B).
* **FR-Chk-04:** System shall assign an automated status based on check-in time:
  * Early: Check-in < Start Time
  * On Time: Check-in <= Start Time
  * Grace Period: Start Time < Check-in <= (Start Time + Grace Period)
  * Late: Check-in > (Start Time + Grace Period)

### 2.4. Automated Absence & Scoring Processing
* **FR-Abs-01:** Upon reaching "Attendance Closing Time", system shall query all expected Active members. Those without a check-in record shall be designated "ABSENT".
* **FR-Score-01:** System shall calculate points based on Admin-defined rubrics.
* **FR-Score-02:** System shall calculate: `Attendance % = (Meetings Attended / Meetings Expected) * 100`
* **FR-Score-03:** System shall calculate: `Punctuality % = (Meetings Attended On Time / Total Meetings Attended) * 100`

### 2.5. Leaderboard and Thresholds
* **FR-Lead-01:** System shall generate a leaderboard ranking members based on configurable composite scores.
* **FR-Thresh-01:** System shall automatically flag members reaching thresholds: 2 consecutive absences (Follow-up), 3 absences (Warning), <70% attendance (Leadership Review).

### 2.6. Audit & Manual Overrides
* **FR-Aud-01:** Admins can manually record or correct attendance. The system shall enforce logging of: Admin User ID, Original Status, New Status, Timestamp, and Reason.

## 3. Fraud Prevention
* **FR-Sec-01:** System shall prevent duplicate check-ins for the same user in the same meeting.
* **FR-Sec-02:** System shall capture device information to flag multiple accounts checking in from a single physical device.
* **FR-Sec-03:** System shall block mock/fake GPS location providers where technically feasible by the OS.

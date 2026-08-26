# Product Requirements Document (PRD)
**Project Name:** TFHC Orderliness Attendance & Participation Tracker
**Reference:** TFHC Orderliness Attendance Development Checklist.pdf
**Date:** August 2026

## 1. Product Vision
To build a seamless, user-friendly mobile and web platform that empowers the TFHC Orderliness unit to effortlessly record attendance, celebrate consistency, and easily identify members needing support, ultimately fostering a culture of punctuality and active participation.

## 2. Target Personas
### 2.1. Unit Member (Mobile App User)
* **Needs:** View upcoming meetings, seamlessly check into meetings upon arrival, monitor personal attendance/punctuality scores, view leaderboard rank, and submit absence excuses.
* **Pain Points:** Manual sign-in sheets, disputes over exact arrival times, lack of visibility into their own performance metrics.

### 2.2. Unit Administrator / Leader (Admin Portal User)
* **Needs:** Create and schedule recurring events, configure attendance rules (geofence, grace periods), view real-time live attendance during meetings, generate reports, and manage follow-ups.
* **Pain Points:** Time-consuming manual data entry, difficult to identify trends, hard to track consecutive absences manually.

## 3. Core Product Features (MVP)
* **Member App & Dashboard:** A mobile interface displaying the user's performance (Total Points, Attendance Rate, Punctuality Rate, Recent Attendance, Rank).
* **Meeting Configuration Engine:** Allows admins to set Meeting Name, Category, Date, Times (Start, Expected, Open, Close), Location, Coordinates, Geofence Radius, and Attendance Type (Compulsory/Optional).
* **The "Check-In" Action:** A highly responsive flow where a member opens the app, scans a dynamically generated Meeting QR Code, validates their GPS against the defined geofence (e.g., 100 meters), and registers their exact timestamp.
* **Automated Status Engine:** Classifies check-ins dynamically based on Admin rules (Early, On Time, Grace Period, Late, Absent).
* **Leaderboard & Gamification:** Ranks members based on an explicit formula (e.g., Overall Score = (Attendance Rate * 60%) + (Punctuality Rate * 40%) + Meeting Points). Filters available by timeframe and sub-team.
* **Live Meeting Dashboard:** Real-time visibility for admins showing Expected vs. Checked In vs. Absent during an active meeting window.
* **Threshold Alerts:** Automated flags for leadership review (e.g., Level 1: 2 consecutive absences -> "Follow-Up Required").

## 4. User Journeys
**The Check-in Journey (Option B - Recommended):**
1. Member arrives at Church Auditorium.
2. Member opens the TFHC Attendance App.
3. Member scans the Meeting QR Code displayed at the venue entrance.
4. App verifies location permission, captures current GPS coordinates, and calculates distance to the configured venue center.
5. If within the Geofence and time window, success confirmation is shown. Attendance is recorded, points are awarded, and the live admin dashboard updates.

## 5. Definition of Done (MVP Criteria)
* Leaders can successfully create meetings, define expected attendees, set venues/geofences, and open attendance.
* Members can check in physically at the venue, capturing exact timestamps and automatic status classification.
* System automatically flags absentees when the attendance window closes.
* Individual performance scores (attendance %, punctuality %, points) and leaderboards are calculated accurately.
* Audit trail captures any manual corrections.
* Comprehensive Excel exports and performance reports are fully functional.

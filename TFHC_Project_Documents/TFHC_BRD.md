# Business Requirements Document (BRD)
**Project Name:** TFHC Orderliness Attendance & Participation Tracker
**Reference:** TFHC Orderliness Attendance Development Checklist.pdf
**Date:** August 2026

## 1. Executive Summary
The TFHC Orderliness unit requires a comprehensive application to track, manage, and analyze the attendance and punctuality of its members across various church activities (services, meetings, rehearsals, trainings). The objective is to transition from manual "who came?" tracking to a reliable, automated participation system that evaluates consistency, punctuality, and overall engagement to facilitate data-driven rewards and targeted follow-ups.

## 2. Business Objectives
* **Automate Tracking:** Eliminate manual attendance tracking and automatically calculate early, on-time, late, and absent statuses based on exact arrival times.
* **Enhance Accountability:** Provide a transparent, point-based leaderboard system that objectively measures member commitment and consistency.
* **Enable Proactive Leadership:** Automatically flag members who meet reward thresholds or require pastoral follow-up (e.g., consecutive absences).
* **Data-Driven Insights:** Generate reliable metrics, trends, and reports for unit leadership to assess overall engagement and unit health over time.

## 3. Project Scope
### 3.1. In-Scope (Minimum Viable Product - MVP)
* Member profiling and authentication (Active, Inactive, On Leave, Suspended, Exempt).
* Meeting management (creation, categorization, recurrence, weighting).
* Automated Check-in validation using GPS/Geofencing combined with Meeting QR Codes.
* Automated attendance status calculation and unexcused absence processing.
* Configurable scoring systems (Attendance Percentage, Punctuality Percentage, Points).
* Transparent member leaderboards and performance dashboards.
* Admin dashboards, detailed reporting, and data export (Excel/CSV/PDF).
* Configurable absence excuse workflows and manual audit trails.

### 3.2. Out-of-Scope (Phase 2)
* Automated WhatsApp/SMS push notifications.
* Advanced analytics (Attendance Heatmaps).
* Integration with existing master church membership systems.
* Continuous background location tracking (system must be strictly event-based upon check-in).

## 4. Key Business Rules
* **Strict Event-Based Tracking:** The system shall only capture location data at the exact moment a member attempts to check in.
* **Automated Absences:** When an attendance window closes, any expected member who has not checked in must automatically be marked as "Absent".
* **Configurability:** Unit administrators must have the ability to configure all thresholds without developer intervention (e.g., grace periods, geofence radius, scoring models, meeting weights).
* **Manual Overrides:** Authorized leaders must be able to manually record or amend attendance, subject to a mandatory, non-erasable audit trail capturing the user, timestamp, original status, and reason.

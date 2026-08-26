# Architectural Document
**Project Name:** TFHC Orderliness Attendance & Participation Tracker
**Reference:** TFHC Orderliness Attendance Development Checklist.pdf
**Date:** August 2026

## 1. System Overview
The system follows a standard Client-Server architecture utilizing a Mobile Application for the end-users (Members) and a Web Application for the unit administrators. The backend will be a RESTful API serving both clients, backed by a relational database to maintain strict data integrity for scoring and auditing.

## 2. High-Level Architecture
### 2.1. Components
* **Member Mobile App (Client):** Developed in React Native or Flutter. Interacts with device hardware (Camera for QR codes, GPS/Location Services for Geofencing).
* **Admin Web Portal (Client):** Developed in React.js, Vue.js, or Angular. Provides a rich dashboard interface, data grids for leaderboards, and report export functionalities.
* **Backend API (Server):** Node.js (Express/NestJS) or Python (Django/FastAPI). Handles business logic, scoring calculations, automated CRON jobs (for meeting close-outs and absence processing), and authentication.
* **Database (Storage):** PostgreSQL or MySQL. Highly relational data model (Members, Meetings, AttendanceRecords, AuditLogs) is ideal for this structured use case.

## 3. Core Database Schema (Key Entities)
Based on Checklist Requirement 42 (Key Data Required), the core entity `AttendanceRecord` will consist of:
* `record_id` (UUID, Primary Key)
* `member_id` (UUID, Foreign Key -> Members)
* `meeting_id` (UUID, Foreign Key -> Meetings)
* `meeting_type` (Enum/String)
* `expected_meeting_time` (Timestamp)
* `actual_arrival_time` (Timestamp)
* `attendance_status` (Enum: Early, On Time, Grace Period, Late, Absent, Excused)
* `gps_lat`, `gps_long` (Decimal)
* `gps_accuracy` (Float)
* `distance_from_venue` (Float)
* `attendance_method` (Enum: System, Manual)
* `points_earned` (Integer/Float)
* `is_modified` (Boolean)
* `modification_history_id` (UUID, Foreign Key -> AuditLogs)

## 4. Key Architectural Decisions & Workflows
### 4.1. Geofencing Calculation
The backend or client will use the **Haversine formula** to calculate the distance between the meeting's fixed coordinates and the device's captured coordinates.
* *Security Note:* The distance calculation should ideally be validated on the backend to prevent client-side manipulation. The mobile app sends the captured coordinates to the API, and the API verifies if distance <= `geofence_radius`.

### 4.2. QR Code Implementation (Option B)
* The Admin Portal generates a cryptographically signed payload encoded into a QR code (e.g., JWT containing `meeting_id` and expiration time).
* The Mobile App scans the QR code, decodes it, and passes the token along with the GPS payload to the backend Check-In endpoint.

### 4.3. Automated Absence Processing
* A background job scheduler (e.g., Node-Cron or Celery) will periodically poll for meetings where `Current_Time >= Attendance_Closing_Time` and `Status != CLOSED`.
* Once found, it runs a batch process to identify all expected `Active` members lacking an `AttendanceRecord` for that `meeting_id` and inserts records with `attendance_status = 'Absent'`.

### 4.4. Scalability & Event-Based Tracking
* The system is explicitly designed NOT to track continuous location (per checklist #34). The architecture relies on single HTTPS POST requests containing location data only at the exact moment of check-in, drastically reducing server load and battery consumption.

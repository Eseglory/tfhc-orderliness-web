# Attendance — GPS Location Check & Church-Friendly Terminology

## 1. Registered Church Venue Location

The primary worship campus and gathering location is configured and verified as:

- **Church Name**: The Father’s House Church
- **Address**: 90 Alagbole–Akute Road, Iju, Ojodu, Ogun State / Lagos Metro Area
- **Latitude**: `6.6697906`
- **Longitude**: `3.3581822`
- **Default Attendance Radius**: `100 meters` (Configurable per meeting / service)
- **Max Allowed GPS Accuracy Tolerance**: `100 meters`

---

## 2. Server-Enforced GPS Attendance Rules

### Workflow
1. **Device GPS Capture**: When a member initiates attendance check-in, the web client requests high-accuracy device coordinates via `navigator.geolocation.getCurrentPosition`.
2. **Payload Transmission**: Coordinates (`latitude`, `longitude`, `gpsAccuracy`, `deviceInfo`, `meetingId`) are sent to `POST /attendance/check-in`.
3. **Backend Location Validation (Haversine Formula)**:
   - The backend validates that `latitude` and `longitude` are valid finite decimal numbers within `[-90, 90]` and `[-180, 180]`.
   - Distance between device coordinates and the church venue coordinates is calculated server-side using the Haversine great-circle distance algorithm:
     $$\Delta\sigma = 2 \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$
     $$d = R \cdot \Delta\sigma \quad (R = 6,371,000\text{ m})$$
4. **Enforcement Rules**:
   - If distance $> \text{geofenceRadiusMeters}$ (e.g. $> 100\text{m}$), check-in is **rejected** with `400 Bad Request` ("You are outside the attendance zone").
   - If `gpsAccuracy` is invalid or $> 100\text{m}$, check-in is **rejected** with `400 Bad Request` ("GPS signal is too weak/inaccurate").
   - If the member has already checked in for this service, check-in is **rejected** with `409 Conflict` ("Attendance has already been recorded for this meeting").
   - If the service attendance window has closed or not yet opened, check-in is **rejected** with `400 Bad Request`.
5. **Atomic Recording**:
   - Valid check-ins are recorded atomically in the database with status (`ON_TIME`, `LATE`, `GRACE_PERIOD`), points earned, distance, accuracy, and timestamp.

---

## 3. Church-Friendly Terminology Dictionary

To ensure church members and leaders have a clear and welcoming experience, all technical jargon in the user interface is replaced with simple church language:

| Standard Church Term | Context / Meaning |
| :--- | :--- |
| **Home** | Member / Admin start page & dashboard |
| **Members** | Church directory, officer roster, and member profiles |
| **Attendance** | Check-in records, attendance tracking, and attendance history |
| **Events** | Conferences, retreats, special events, and services |
| **Finance** | Dues, payments, expenses, financial overview, and accounts |
| **Groups** | Ministry units, departments, fellowships, and teams |
| **Prayer** | Support, counseling appointments, and prayer/welfare requests |
| **Notices** | Announcements, official team broadcasts, and messages |
| **Profile** | Personal member profile, details, and photo |
| **Settings** | Church configuration, admin roles, and lookup tables |
| **Check In** | Marking attendance using device GPS location at church |
| **Present** | Member attended service |
| **Absent** | Member was absent |
| **Excused** | Approved absence with excuse notice |
| **Approve** | Accept/approve a request or submission |
| **Reject** | Decline a request or submission |
| **Search** | Search members, events, or records |
| **Save** | Save changes |
| **Send** | Send message or notice |
| **View** | View item or details |
| **Edit** | Edit item or details |
| **Delete** | Remove item |

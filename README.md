# MyGeotab Fleet Booking Add-in

A lightweight, browser-hosted MyGeotab custom page add-in for requesting, approving, and dispatching shared fleet vehicles. Booking records are stored in MyGeotab as `AddInData`; no external database or build step is required.

## Features

- Submit vehicle booking requests with start time, end time, required purpose, and required destination (no vehicle selection needed at request time).
- Track personal booking requests (**My Bookings**) with a client-side time-range filter (default: **This week**).
- Review and dispatch pending bookings in the **Approval** queue (restricted to **Administrator** security clearance): assign an active vehicle and an active driver with dual conflict checks, or reject with mandatory notes.
- Browse available vehicles and the read-only **Users** directory with resolved MyGeotab security clearances and driver statuses.
- Filter and paginate booking history in **Reports** across all workflow statuses, vehicles, drivers, and requesters.
- View assigned schedules inside the **Geotab Drive** mobile app via a companion read-only **Driver Schedule** add-in (`driver-schedule.html`) with flexible time-range/date/status filters (including cancelled trips), offline cache fallback, and automatic `TextMessage` notifications on approval and cancellation.

## Dashboard

| Section | Current behavior |
| --- | --- |
| **Booking** | Submit new booking requests (initial status `Pending`). Displays only bookings created by the signed-in user with a time-range filter (default `This week`). Pending bookings can be edited or cancelled; approved (and legacy confirmed) bookings can only be cancelled. |
| **Approval** | Visible and accessible only to users with **Administrator** security clearance (hidden for non-Administrators with code-level guards). Administrators can **Approve** (dropdowns show only vehicles and active drivers available for that booking slot, with busy details noted below; optional notes), **Reject** (mandatory notes), or **Cancel** an approved/legacy confirmed booking (mandatory reason). |
| **Drivers & Users** | Visible and accessible only to **Administrator** clearance. Features two sub-tabs: **Drivers** (real-time booking availability board with Active, Available now, and On trip now KPIs) and **All users** (account directory with Clearance, Driver status, and Account status filters). |
| **Reports** | Read-only booking history with date-range, vehicle, status, and requester dropdown (`All requesters`) filters; 4 status summary KPIs (`Total`, `Pending`, `Approved`, `Rejected / Cancelled`), assigned vehicle/driver/destination/notes columns, and pagination. |
| **Vehicles** | Fleet Availability Board for vehicles visible to the current account: Active, Available now, and In use now KPIs, search and availability filter, plus current/next approved schedule per vehicle. |

## Setup

1. **Keep the add-in ID stable.** `ADDIN_ID` in `js/services/geotab-api.js` must remain unchanged across deployments to the same MyGeotab database. If you create a separate add-in in that database, use a unique ID. See [Geotab Storage API instructions](https://developers.geotab.com/myGeotab/addIns/addInStorage/).
2. **Host all static assets over HTTPS.** Deploy `fleet-summary.html`, `driver-schedule.html`, and the `assets/`, `css/`, and `js/` folders preserving the directory structure. Both pages load all assets using relative URLs.
3. **Configure the add-ins (2 JSON manifests).**
   - **MyGeotab Web:** Update the hosted page URL and `supportEmail` in `configuration.json`, then install it in **Administration > System > System Settings > Add-Ins**.
   - **Geotab Drive App:** Update the hosted page URL and `supportEmail` in `configuration-drive.json` (`path: "DriveAppLink/"`, `enableViewSecurityId: true`), then install it as a second add-in entry.
4. **Grant the required clearances.**
   - Requesters need permission to read/write `AddInData` (plus `Device` read access to view the Vehicles tab, and optional `TextMessage` send permission to notify drivers when cancelling an approved booking).
   - Administrators using **Approval** and users viewing **Users** need read permission for `Device`, `User`, and `Group` (`GroupSecurityId`) in addition to `AddInData`, plus `TextMessage` send permission to notify drivers on approval/cancellation.
   - Drivers using **Driver Schedule** in Geotab Drive must have **This user is a driver = Yes**, **View Add-In data** (read-only), **View "Driver Schedule" add-in**, and messaging enabled; ensure their Data Access Group covers the booking `AddInData` records.
   - If a restricted account cannot read `User` or `Group`, clearance resolution fails closed (`isAdministrator = false`) and the Approval tab remains hidden while Booking stays usable.

## Booking behavior and limitations

- Start and end times are entered in the browser's local time zone and stored as ISO 8601 UTC timestamps alongside `startEpoch`/`endEpoch` millisecond fields.
- Overlapping requests are permitted at submission time (`pending`); conflict checking runs during **Approval** against both **Vehicle** and **Driver** on `approved` (and legacy `confirmed`) records. Adjacent bookings are allowed.
- Cancelling a booking sets its status to `cancelled`; the record is retained.
- The **This week** filter on **My Bookings** and all **Reports** filters run client-side over records returned by `AddInData`.
- Restricting **Approval** to **Administrator** security clearance is UI/application-level enforcement (backed by `reviewedBy`/`reviewedAtUtc` audit fields), because non-admin requesters also need `AddInData` write access to create bookings. Strict server-side RBAC or atomic locking requires a backend service.
- Conflict checking during approval runs before saving and is not atomic; the add-in verifies again after saving and warns if a concurrent conflict is detected.
- Legacy bookings with `status: "confirmed"` remain compatible in conflict checks, cancellation rules, and Reports.

## Development

All HTML, JS, and CSS files follow a modular architecture capped at **500 lines per file** (enforced by automated tests). Run the test suite with Node.js:

```sh
node --test tests/booking-domain.test.js tests/user-domain.test.js tests/driver-schedule.test.js tests/code-constraints.test.js
```

### Project structure

- `fleet-summary.html` - MyGeotab Web dashboard HTML entry point (no inline JavaScript).
- `driver-schedule.html` - Geotab Drive App mobile HTML entry point (no inline JavaScript).
- `assets/driver-schedule-icon.svg` - Local SVG icon for the Geotab Drive dashboard/menu.
- `css/base.css`, `css/components.css`, `css/pages.css`, `css/drive.css` - Modular responsive styles (Web + Drive mobile-first).
- `js/domain/booking-domain.js` - Booking validation, status rules, vehicle/driver conflict checks, and filters.
- `js/domain/driver-schedule-domain.js` - Driver schedule matching, flexible time/date/status filters, sorting, and `TextMessage` notification templates.
- `js/domain/user-domain.js` - Security clearance resolution, Administrator check (fail-closed), and active driver filtering.
- `js/services/geotab-api.js` - MyGeotab API wrapper (`AddInData`, `Device`, `User`, `Group`, `TextMessage`).
- `js/ui/` - Modular UI views (`formatters.js`, `booking-view.js`, `approval-review-form.js`, `approval-view.js`, `users-view.js`, `reports-view.js`, `vehicles-view.js`, `drive-schedule-view.js`).
- `js/app.js`, `js/drive-app.js` - Web and Geotab Drive add-in lifecycles, state management, and offline cache fallback.
- `configuration.json`, `configuration-drive.json` - Separate MyGeotab Web and Geotab Drive add-in configuration templates.
- `docs/` - Design specifications (`vehicle-booking-design.md`, `driver-schedule-addin-design.md`) and user API notes (`mygeotab-user-directory-api.md`).
- `tests/` - Unit tests and code-size constraint checks.

## References

- [Developing MyGeotab Add-Ins](https://developers.geotab.com/myGeotab/addIns/developingAddIns/)
- [Geotab Storage API](https://developers.geotab.com/myGeotab/addIns/addInStorage/)
- [AddInData object reference](https://developers.geotab.com/myGeotab/apiReference/objects/AddInData/)
- [User object reference](https://developers.geotab.com/myGeotab/apiReference/objects/User/)

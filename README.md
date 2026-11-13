# MyGeotab Fleet Booking Add-in

A lightweight, browser-hosted MyGeotab custom page add-in for booking shared fleet vehicles. Booking records are stored in MyGeotab as `AddInData`; no external database is required.

## Features

- Create, view, edit, and cancel vehicle bookings.
- Browse the vehicles available to the signed-in MyGeotab account.
- Check for overlapping bookings before saving.
- Review booking history with date-range, vehicle, status, and requester filters.
- Use a responsive dashboard with **Booking**, **Approval**, **Users**, **Reports**, and **Vehicles** sections.

> **Current scope:** Booking, vehicle inventory, and report history use MyGeotab data. Approval and Users are UI shells only; no approval workflow or user directory is connected.

## Dashboard

| Section | Current behavior |
| --- | --- |
| **Booking** | Create and manage bookings. Only the booking owner can edit or cancel a booking. |
| **Vehicles** | View the vehicles available to the current account, including inactive vehicles. |
| **Approval** | Visual placeholder; no approval actions or workflow are connected. |
| **Users** | Visual placeholder for a future user and role directory. |
| **Reports** | Read-only booking history with date-range, vehicle, status, and requester filters; summary counts and pagination. Date filters include bookings that overlap any part of the selected range. |

## Setup

1. **Keep the add-in ID stable.** `ADDIN_ID` in `fleet-summary.html` must remain unchanged across deployments to the same MyGeotab database. If you create a separate add-in in that database, use a unique ID. See [Geotab Storage API instructions](https://developers.geotab.com/myGeotab/addIns/addInStorage/).
2. **Host the required files over HTTPS.** Place `fleet-summary.html`, `booking-domain.js`, and `booking.css` in the same folder. The page loads its assets using relative URLs.
3. **Configure the add-in.** Update the hosted page URL and `supportEmail` in `configuration.json`, then add the configuration in **Administration > System > System Settings > Add-Ins**.
4. **Grant the required clearances.** Users need permission to read `Device` objects and read/write `AddInData`. The add-in only enables booking creation when an active vehicle is available.

## Booking behavior and limitations

- Start and end times are entered in the browser's local time zone and stored as ISO 8601 UTC timestamps.
- Overlapping active bookings for the same vehicle are rejected. Adjacent bookings are allowed (for example, one booking can start exactly when another ends).
- Cancelling a booking sets its status to `cancelled`; the record is retained.
- Reports include both confirmed and cancelled records. Date-range filtering uses the booking period, not the record creation time.
- Report filtering and pagination run in the browser over the booking records returned by MyGeotab; pagination does not limit the records fetched from the API.
- Conflict checking runs in the client before saving and is not atomic. Two users can still create overlapping bookings at the same time. The add-in checks again after saving and warns if a conflict is detected. Workflows that require a strict guarantee need a transactional backend.

## Development

Booking time validation, overlap checks, and report filters are in `booking-domain.js`. Run the tests with Node.js:

```sh
node --test tests/booking-domain.test.js
```

### Project files

- `fleet-summary.html` — dashboard markup and MyGeotab add-in behavior.
- `booking.css` — responsive dashboard and booking styles.
- `booking-domain.js` — booking time, conflict, and report filter logic.
- `configuration.json` — MyGeotab add-in configuration template.
- `tests/booking-domain.test.js` — focused tests for booking and report domain logic.

## References

- [Developing MyGeotab Add-Ins](https://developers.geotab.com/myGeotab/addIns/developingAddIns/)
- [Geotab Storage API](https://developers.geotab.com/myGeotab/addIns/addInStorage/)
- [AddInData object reference](https://developers.geotab.com/myGeotab/apiReference/objects/AddInData/)

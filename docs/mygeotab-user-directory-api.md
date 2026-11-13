# MyGeotab User Directory API Notes

## Findings

- The MyGeotab `Get` method accepts an entity `typeName` such as `User`. With no search criteria, it returns all entities available to the authenticated API session in the database being queried. The result is not a global directory across databases. [Get method](https://developers.geotab.com/myGeotab/apiReference/methods/Get/)
- The `User` object exposes `name` as the user's email/login name, `firstName`, `lastName`, `activeFrom`, and `activeTo`. The activity dates indicate the period for which the user is active. [User object](https://developers.geotab.com/myGeotab/apiReference/objects/User/)
- The documented `User` properties include `securityGroups`, `userRole` (primary functional role, default `null`), `customUserRole` (user-entered label when the role is `Other`), and `isDriver`. `securityGroups` contains Group references that define user access; resolve their IDs against `Get` with `typeName: "Group"` and `search: { id: "GroupSecurityId" }` to display the security-clearance group names as clearance labels. Do not interpret a group's ID or name as a booking approval role. [User object](https://developers.geotab.com/myGeotab/apiReference/objects/User/) · [Group object](https://developers.geotab.com/myGeotab/apiReference/objects/Group/) · [SecurityFilter object](https://developers.geotab.com/myGeotab/apiReference/objects/SecurityFilter/)
- The User object documents `userAuthenticationType`. It distinguishes BasicAuthentication and MyAdmin accounts, and notes that MyAdmin users are not visible to BasicAuthentication users. Therefore, a `Get User` result is not necessarily every account that could authenticate to the database through another account type. [User object](https://developers.geotab.com/myGeotab/apiReference/objects/User/)

## Implications for this add-in

- A Users page can query `Get` with `typeName: "User"` and display the user records visible to the current MyGeotab session. The caller's database access and permissions still apply.
- Treat the result as a directory of visible database user records, not proof that each person can successfully sign in at this moment. Authentication credentials, external identity configuration, and database access are separate concerns; do not request or display password data.
- The Users UI shows **Name**, **Email / login**, **Functional role**, **Clearance**, **Driver status**, and an activity status derived from `activeFrom` and `activeTo`. Resolve clearance labels from each user's `securityGroups` references and matching Group names. If group lookup fails, show `Not available`; if a user's group ID is absent from the successful lookup, show `Unmapped clearance`.
- MyGeotab functional role, driver status, security groups, and clearance are not booking approval assignments. A future approval workflow needs its own explicit approval-role configuration rather than inferring approval authority from these directory fields.
- If the product requires a complete list across BasicAuthentication and MyAdmin account types, validate the required access and expected visibility in the target database before promising that the add-in can show every account.

## Primary references

- [MyGeotab `Get` method](https://developers.geotab.com/myGeotab/apiReference/methods/Get/)
- [MyGeotab `User` object](https://developers.geotab.com/myGeotab/apiReference/objects/User/)
- [MyGeotab `Group` object](https://developers.geotab.com/myGeotab/apiReference/objects/Group/)

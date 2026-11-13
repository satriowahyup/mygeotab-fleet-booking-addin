# MyGeotab User Directory API Notes

## Findings

- The MyGeotab `Get` method accepts an entity `typeName` such as `User`. With no search criteria, it returns all entities available to the authenticated API session in the database being queried. The result is not a global directory across databases. [Get method](https://developers.geotab.com/myGeotab/apiReference/methods/Get/)
- The `User` object exposes `name` as the user's email/login name, `firstName`, `lastName`, `activeFrom`, and `activeTo`. The activity dates indicate the period for which the user is active. [User object](https://developers.geotab.com/myGeotab/apiReference/objects/User/)
- `securityGroups` contains the security groups that define a user's access. `userRole` is a separate primary functional role, and `isDriver` indicates whether the user is a driver; neither should be treated as a complete substitute for security-group access. [User object](https://developers.geotab.com/myGeotab/apiReference/objects/User/) · [Group object](https://developers.geotab.com/myGeotab/apiReference/objects/Group/)
- The User object documents `userAuthenticationType`. It distinguishes BasicAuthentication and MyAdmin accounts, and notes that MyAdmin users are not visible to BasicAuthentication users. Therefore, a `Get User` result is not necessarily every account that could authenticate to the database through another account type. [User object](https://developers.geotab.com/myGeotab/apiReference/objects/User/)

## Implications for this add-in

- A Users page can query `Get` with `typeName: "User"` and display the user records visible to the current MyGeotab session. The caller's database access and permissions still apply.
- Treat the result as a directory of visible database user records, not proof that each person can successfully sign in at this moment. Authentication credentials, external identity configuration, and database access are separate concerns; do not request or display password data.
- For the directory UI, show **Name**, **Email / login**, **User role**, **Security groups**, and an activity status derived from `activeFrom` and `activeTo`. A user may belong to multiple security groups, so avoid collapsing those groups into a single role.
- If the product requires a complete list across BasicAuthentication and MyAdmin account types, validate the required access and expected visibility in the target database before promising that the add-in can show every account.

## Primary references

- [MyGeotab `Get` method](https://developers.geotab.com/myGeotab/apiReference/methods/Get/)
- [MyGeotab `User` object](https://developers.geotab.com/myGeotab/apiReference/objects/User/)
- [MyGeotab `Group` object](https://developers.geotab.com/myGeotab/apiReference/objects/Group/)

# Merchant authentication setup

## One-time platform administrator bootstrap

1. In Firebase Console, open **Authentication → Users**.
2. Create an administrator account with email/password.
3. Copy that account's UID.
4. In Firestore, create:

`users/{platform-admin-uid}`

with:

```json
{
  "role": "platform_admin",
  "displayName": "Platform Administrator",
  "email": "admin@example.com"
}
```

The first platform-admin profile must be created manually because no authenticated administrator exists yet who could create it securely.

## Create a merchant

1. Create the restaurant user's email/password account in **Authentication → Users**.
2. Use the protected `createMerchantProfile` callable as a platform administrator, passing:

```json
{
  "uid": "AUTH_USER_UID",
  "tenantId": "royal-rasoi",
  "role": "owner",
  "displayName": "Restaurant Owner"
}
```

The function verifies that the Auth user exists and writes `users/{uid}`. Supported roles are `owner`, `manager`, and `staff`.

## Merchant login

Open:

`/admin.html?tenant=royal-rasoi&location=main`

The dashboard verifies Firebase Authentication, then reads `users/{uid}`. The account is rejected when the profile is missing, the role is invalid, or the profile belongs to another tenant.

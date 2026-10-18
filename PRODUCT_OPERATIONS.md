# RestroFlow production setup

## Implemented in code

- Business closed mode and business-hours enforcement for new orders.
- Configurable tax rate, default delivery fee, pickup/delivery availability, and preparation time.
- Delivery-zone validation by ZIP/postal code with per-zone fees.
- Scheduled orders at least 15 minutes in the future.
- Server-side order totals and preparation-time estimates.
- Merchant-only order status changes.
- Customer/merchant cancellation workflow. Cash orders require no payment refund.
- Tenant and branch-scoped Firestore data.

## Configure a restaurant location

In Firestore, edit:

`tenants/{tenantId}/locations/{locationId}`

Example fields:

```json
{
  "acceptingOrders": true,
  "closedMode": false,
  "deliveryEnabled": true,
  "pickupEnabled": true,
  "taxRate": 0.08,
  "deliveryFee": 50,
  "prepTimeMinutes": 30,
  "businessHours": {
    "monday": {"open": "09:00", "close": "22:00", "closed": false},
    "tuesday": {"open": "09:00", "close": "22:00", "closed": false},
    "wednesday": {"open": "09:00", "close": "22:00", "closed": false},
    "thursday": {"open": "09:00", "close": "22:00", "closed": false},
    "friday": {"open": "09:00", "close": "23:00", "closed": false},
    "saturday": {"open": "09:00", "close": "23:00", "closed": false},
    "sunday": {"open": "10:00", "close": "21:00", "closed": false}
  },
  "deliveryZones": [
    {"name": "Nearby", "zipCodes": ["411001", "411005"], "fee": 40},
    {"name": "Outer", "zipCodes": ["411007"], "fee": 70}
  ]
}
```

The dashboard exposes the common settings. Business hours and delivery zones can be added manually until their dedicated editor is built.

## Manual services still required

Payments require a provider account, merchant verification, webhook secret, refund policy, and payout bank account. Do not enable card payments until the payment webhook updates order payment status server-side.

Notifications require an email/SMS/WhatsApp provider, sender verification, templates, and environment secrets. Google Maps requires a browser key, Places/Geocoding APIs, domain restrictions, and billing.

Custom domains require DNS access for each restaurant. Subscription billing requires a platform billing provider account and plan/proration decisions.

Production launch also requires staging, automated browser tests, CI/CD, monitoring/error tracking, scheduled backups, privacy policy, terms, tax/GST configuration, and cancellation/refund policy pages.

# Real restaurant order acceptance test

## Before testing

- Repair the Firebase Web API key in `index.html`, `admin.html`, and `platform-admin.html`.
- Confirm the restaurant has a Firebase Auth merchant account and `users/{uid}` profile.
- Configure `tenants/royal-rasoi/locations/main` with `acceptingOrders: true`, `closedMode: false`, a valid timezone, business hours, and at least one available menu item.
- Use Cash on Delivery because online payments are not enabled yet.

## Test flow

1. Open the merchant dashboard in one browser:
   `https://restro-6bf9c.web.app/admin.html?tenant=royal-rasoi&location=main`
2. Open the customer storefront in a separate browser or phone:
   `https://restro-6bf9c.web.app/?tenant=royal-rasoi&location=main`
3. Add an available menu item.
4. Use a real test customer name, email, phone, address, city, and ZIP code inside a configured delivery zone.
5. Select Cash on Delivery and place the order.
6. Confirm the order appears in the merchant dashboard without refreshing.
7. Confirm the server-calculated tax, delivery fee, total, and preparation time.
8. Change status to `Accepted`, then `Preparing`, then `Completed` from the dashboard.
9. Confirm the customer status changes within approximately 10 seconds.
10. Repeat once with a ZIP code outside the delivery zones and confirm the order is rejected before creation.
11. Repeat once with a new order and use **Cancel Order** before preparation; confirm it becomes `Rejected` in the dashboard.

## Pass criteria

- Exactly one Firestore order exists at `tenants/royal-rasoi/locations/main/orders/{orderId}`.
- The customer cannot change the price, tax, delivery fee, tenant, or restaurant menu item price.
- The admin sees the order in real time.
- The customer sees status changes.
- An audit log exists at `tenants/royal-rasoi/locations/main/auditLogs`.
- No order is created for a closed restaurant or unsupported delivery ZIP code.

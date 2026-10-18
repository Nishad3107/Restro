const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = admin.firestore();
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const cleanText = (value, maxLength = 200) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const validId = value => /^[a-z0-9-]{1,80}$/i.test(value || '');
const allowedStatuses = ['New', 'Accepted', 'Preparing', 'Completed', 'Rejected', 'ORDER_PLACED', 'ORDER_ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'BILL_REQUESTED', 'PAID', 'CANCELLED'];
const allowedFulfillmentTypes = ['delivery', 'pickup'];
const dineInStatuses = ['ORDER_PLACED', 'ORDER_ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'BILL_REQUESTED', 'PAID', 'COMPLETED', 'CANCELLED'];
const staffRoles = ['owner', 'manager', 'staff', 'receptionist', 'kitchen', 'kitchen_staff', 'waiter', 'platform_admin'];

function locationRef(tenantId, locationId) {
  return db.collection('tenants').doc(tenantId).collection('locations').doc(locationId);
}

function tableRef(tenantId, locationId, tableId) {
  return locationRef(tenantId, locationId).collection('tables').doc(tableId);
}

async function createOrResumeDiningSession(tenantId, locationId, tableId, requestedSessionId) {
  const location = locationRef(tenantId, locationId);
  const table = tableRef(tenantId, locationId, tableId);
  const session = requestedSessionId ? location.collection('diningSessions').doc(requestedSessionId) : location.collection('diningSessions').doc();
  return db.runTransaction(async transaction => {
    const tableSnapshot = await transaction.get(table);
    if (!tableSnapshot.exists) throw new HttpsError('not-found', 'This table is not configured.');
    const tableData = tableSnapshot.data() || {};
    if (requestedSessionId) {
      const sessionSnapshot = await transaction.get(session);
      if (!sessionSnapshot.exists || sessionSnapshot.data().status !== 'ACTIVE' || sessionSnapshot.data().tableId !== tableId) {
        throw new HttpsError('failed-precondition', 'This dining session is no longer active.');
      }
      return { id: session.id, tableNumber: cleanText(tableData.number || tableData.name, 40) || tableId };
    }
    const sessionData = { sessionId: session.id, tenantId, locationId, tableId, tableNumber: cleanText(tableData.number || tableData.name, 40) || tableId, status: 'ACTIVE', subtotal: 0, tax: 0, total: 0, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    transaction.set(session, sessionData);
    transaction.set(table, { status: 'OCCUPIED', activeSessionId: session.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { id: session.id, tableNumber: sessionData.tableNumber };
  });
}

function currentBusinessDay() {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
}

function minutesSinceMidnight(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isWithinBusinessHours(hours, timeZone = 'Asia/Kolkata', date = new Date()) {
  if (!hours || typeof hours !== 'object') return true;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const day = String(parts.weekday || '').toLowerCase();
  const schedule = hours[day];
  if (!schedule || schedule.closed) return false;
  const open = minutesSinceMidnight(schedule.open);
  const close = minutesSinceMidnight(schedule.close);
  if (open === null || close === null || open === close) return true;
  const current = Number(parts.hour) * 60 + Number(parts.minute);
  return open < close ? current >= open && current < close : current >= open || current < close;
}

function findDeliveryZone(zones, zip) {
  if (!Array.isArray(zones)) return null;
  return zones.find(zone => Array.isArray(zone.zipCodes) && zone.zipCodes.map(String).includes(String(zip))) || null;
}

function verifyStripeSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false;
  const parts = signature.split(',').reduce((result, part) => { const [key, value] = part.split('='); if (key && value) result[key] = result[key] ? `${result[key]},${value}` : value; return result; }, {});
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const received = Buffer.from(parts.v1, 'utf8');
  const calculated = Buffer.from(expected, 'utf8');
  return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
}

function validateScheduledTime(scheduledFor) {
  if (!scheduledFor) return null;
  const date = new Date(scheduledFor);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 15 * 60 * 1000) {
    throw new HttpsError('invalid-argument', 'Scheduled orders must be at least 15 minutes in the future.');
  }
  return admin.firestore.Timestamp.fromDate(date);
}

function actorKey(request, user) {
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.rawRequest?.ip || '';
  return request.auth?.uid || cleanText(user.phone, 40) || cleanText(user.email, 160).toLowerCase() || ip || 'anonymous';
}

async function enforceOrderRateLimit(request, user) {
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const key = crypto.createHash('sha256').update(`${actorKey(request, user)}:${bucket}`).digest('hex');
  const ref = db.collection('rateLimits').doc(key);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const count = snapshot.exists ? Number(snapshot.data().count || 0) : 0;
    if (count >= 5) throw new HttpsError('resource-exhausted', 'Too many order attempts. Please try again later.');
    transaction.set(ref, { count: count + 1, bucket, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function writeAuditLog(tenantId, locationId, action, actor, metadata = {}) {
  await locationRef(tenantId, locationId).collection('auditLogs').add({
    action,
    actorUid: actor?.uid || null,
    actorEmail: actor?.token?.email || null,
    metadata,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function requireTenantMember(request, tenantId, roles) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const profileSnapshot = await db.collection('users').doc(request.auth.uid).get();
  const profile = profileSnapshot.exists ? profileSnapshot.data() : {};
  if ((profile.role !== 'platform_admin' && profile.tenantId !== tenantId) || !roles.includes(profile.role)) {
    throw new HttpsError('permission-denied', 'You are not authorized for this restaurant.');
  }
  return profile;
}

exports.createOrder = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const orderType = cleanText(data.orderType, 20).toUpperCase() || (data.tableId ? 'DINE_IN' : 'DELIVERY');
  const tableId = cleanText(data.tableId, 80);
  const user = data.user || {};
  const requestedItems = Array.isArray(data.items) ? data.items : [];

  if (!validId(tenantId) || !validId(locationId)) throw new HttpsError('invalid-argument', 'Invalid restaurant or location.');
  if (!['DINE_IN', 'DELIVERY'].includes(orderType)) throw new HttpsError('invalid-argument', 'Invalid order type.');
  if (!requestedItems.length || requestedItems.length > 50) throw new HttpsError('invalid-argument', 'An order must contain between 1 and 50 items.');
  if (orderType === 'DELIVERY' && (!cleanText(user.firstName, 80) || !cleanText(user.lastName, 80) || !cleanText(user.phone, 40) || !cleanText(user.address, 500))) {
    throw new HttpsError('invalid-argument', 'Required customer information is missing.');
  }
  if (cleanText(user.paymentType, 30) !== 'cash') throw new HttpsError('failed-precondition', 'Only Cash on Delivery is currently available.');
  await enforceOrderRateLimit(request, user);

  const ref = locationRef(tenantId, locationId);
  const locationSnapshot = await ref.get();
  const location = locationSnapshot.data() || {};
  if (!locationSnapshot.exists || location.acceptingOrders === false || location.closedMode === true) throw new HttpsError('failed-precondition', 'This restaurant is not accepting orders right now.');
  if (!isWithinBusinessHours(location.businessHours, location.timeZone || 'Asia/Kolkata')) throw new HttpsError('failed-precondition', 'This restaurant is currently closed.');
  let diningSession = null;
  if (orderType === 'DINE_IN') {
    if (!validId(tableId)) throw new HttpsError('invalid-argument', 'A valid table is required for dine-in orders.');
    if (location.dineInEnabled === false) throw new HttpsError('failed-precondition', 'Dine-in ordering is currently unavailable.');
    diningSession = await createOrResumeDiningSession(tenantId, locationId, tableId, cleanText(data.sessionId, 100));
  }
  const fulfillmentType = orderType === 'DINE_IN' ? 'dine-in' : (cleanText(data.fulfillmentType, 20) || 'delivery');
  if (!allowedFulfillmentTypes.includes(fulfillmentType)) throw new HttpsError('invalid-argument', 'Invalid fulfillment type.');
  if (fulfillmentType === 'delivery' && location.deliveryEnabled === false) throw new HttpsError('failed-precondition', 'Delivery is currently unavailable.');
  if (fulfillmentType === 'pickup' && location.pickupEnabled === false) throw new HttpsError('failed-precondition', 'Pickup is currently unavailable.');
  const scheduledFor = validateScheduledTime(data.scheduledFor);
  const deliveryZone = orderType === 'DELIVERY' && fulfillmentType === 'delivery' ? findDeliveryZone(location.deliveryZones, user.zip) : null;
  if (orderType === 'DELIVERY' && fulfillmentType === 'delivery' && Array.isArray(location.deliveryZones) && location.deliveryZones.length && !deliveryZone) {
    throw new HttpsError('failed-precondition', 'This address is outside the restaurant delivery area.');
  }
  const menuSnapshot = await ref.collection('menu').where('available', '==', true).get();
  const menuById = new Map();
  const menuByName = new Map();
  menuSnapshot.forEach(doc => {
    const item = doc.data();
    const normalized = { id: doc.id, name: cleanText(item.name, 120), price: Number(item.price), category: cleanText(item.category, 80) };
    if (normalized.name && Number.isFinite(normalized.price) && normalized.price > 0) {
      menuById.set(doc.id, normalized);
      menuByName.set(normalized.name, normalized);
    }
  });

  const items = [];
  let subtotal = 0;
  for (const requested of requestedItems) {
    const quantity = Number(requested.quantity);
    const menuItem = (requested.id && menuById.get(cleanText(requested.id, 80))) || menuByName.get(cleanText(requested.name, 120));
    if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new HttpsError('invalid-argument', 'The order contains an unavailable item or invalid quantity.');
    subtotal += menuItem.price * quantity;
    items.push({ ...menuItem, quantity });
  }

  const taxRate = Number.isFinite(Number(location.taxRate)) ? Math.max(0, Math.min(1, Number(location.taxRate))) : 0.08;
  const tax = Number((subtotal * taxRate).toFixed(2));
  const deliveryFee = orderType === 'DELIVERY' && fulfillmentType === 'delivery' ? Number(deliveryZone?.fee ?? location.deliveryFee ?? 50) : 0;
  const total = Number((subtotal + tax + deliveryFee).toFixed(2));
  const orderRef = ref.collection('orders').doc();
  await orderRef.set({
    tenantId, locationId, orderType, fulfillmentType, tableId: orderType === 'DINE_IN' ? tableId : null, tableNumber: diningSession?.tableNumber || null, sessionId: diningSession?.id || null, scheduledFor,
    user: {
      firstName: cleanText(user.firstName, 80), lastName: cleanText(user.lastName, 80), email: cleanText(user.email, 160).toLowerCase(),
      phone: cleanText(user.phone, 40), address: cleanText(user.address, 500), city: cleanText(user.city, 100), zip: cleanText(user.zip, 20),
      instructions: cleanText(user.instructions, 500), paymentType: 'cash'
    },
    items, subtotal, tax, taxRate, deliveryFee, total,
    estimatedPrepMinutes: Number(location.prepTimeMinutes || 30), status: orderType === 'DINE_IN' ? 'ORDER_PLACED' : 'New', createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  if (diningSession) await ref.collection('diningSessions').doc(diningSession.id).set({ subtotal: admin.firestore.FieldValue.increment(subtotal), tax: admin.firestore.FieldValue.increment(tax), total: admin.firestore.FieldValue.increment(total), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await writeAuditLog(tenantId, locationId, 'order.created', request.auth, { orderId: orderRef.id, total });
  return { orderId: orderRef.id, total, sessionId: diningSession?.id || null, tableId: diningSession ? tableId : null };
});

exports.updateOrderStatus = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const orderId = cleanText(data.orderId, 100);
  const status = cleanText(data.status, 30);
  if (!validId(tenantId) || !validId(locationId) || !orderId || !allowedStatuses.includes(status)) throw new HttpsError('invalid-argument', 'Invalid order status request.');
  await requireTenantMember(request, tenantId, ['owner', 'manager', 'staff', 'platform_admin']);
  const orderRef = locationRef(tenantId, locationId).collection('orders').doc(orderId);
  const snapshot = await orderRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Order not found.');
  const order = snapshot.data();
  if (order.orderType === 'DINE_IN' && !dineInStatuses.includes(status)) throw new HttpsError('invalid-argument', 'Invalid dine-in order status.');
  await orderRef.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  if (order.orderType === 'DINE_IN' && order.sessionId && status === 'COMPLETED') {
    await locationRef(tenantId, locationId).collection('diningSessions').doc(order.sessionId).set({ status: 'COMPLETED', completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    if (order.tableId) await tableRef(tenantId, locationId, order.tableId).set({ status: 'AVAILABLE', activeSessionId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  await writeAuditLog(tenantId, locationId, 'order.status_updated', request.auth, { orderId, status });
  return { orderId, status };
});

exports.createTable = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const tableId = cleanText(data.tableId, 80);
  const number = cleanText(data.number, 40);
  const capacity = Number(data.capacity);
  if (!validId(tenantId) || !validId(locationId) || !validId(tableId) || !number || !Number.isInteger(capacity) || capacity < 1 || capacity > 50) throw new HttpsError('invalid-argument', 'Invalid table details.');
  await requireTenantMember(request, tenantId, ['owner', 'manager', 'platform_admin']);
  await tableRef(tenantId, locationId, tableId).set({ tableId, number, capacity, status: 'AVAILABLE', activeSessionId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { tableId, number, capacity, qrUrl: `/index.html?tenant=${tenantId}&location=${locationId}&table=${tableId}` };
});

exports.updateTable = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const tableId = cleanText(data.tableId, 80);
  const status = cleanText(data.status, 30).toUpperCase();
  if (!validId(tenantId) || !validId(locationId) || !validId(tableId) || !['AVAILABLE', 'OCCUPIED', 'RESERVED'].includes(status)) throw new HttpsError('invalid-argument', 'Invalid table update.');
  await requireTenantMember(request, tenantId, ['owner', 'manager', 'receptionist', 'waiter', 'platform_admin']);
  await tableRef(tenantId, locationId, tableId).set({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { tableId, status };
});

async function requireActiveSession(tenantId, locationId, sessionId) {
  if (!sessionId) throw new HttpsError('invalid-argument', 'An active dining session is required.');
  const sessionRef = locationRef(tenantId, locationId).collection('diningSessions').doc(sessionId);
  const snapshot = await sessionRef.get();
  if (!snapshot.exists || snapshot.data().status !== 'ACTIVE') throw new HttpsError('failed-precondition', 'This dining session is no longer active.');
  return { ref: sessionRef, data: snapshot.data() };
}

exports.createTableRequest = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const sessionId = cleanText(data.sessionId, 100);
  const type = cleanText(data.type, 30).toUpperCase();
  if (!validId(tenantId) || !validId(locationId) || !['WAITER', 'BILL'].includes(type)) throw new HttpsError('invalid-argument', 'Invalid table request.');
  const session = await requireActiveSession(tenantId, locationId, sessionId);
  const requestRef = locationRef(tenantId, locationId).collection('tableRequests').doc();
  await requestRef.set({ requestId: requestRef.id, type, status: 'REQUESTED', sessionId, tableId: session.data.tableId, tableNumber: session.data.tableNumber, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  if (type === 'BILL') await session.ref.set({ status: 'BILL_REQUESTED', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { requestId: requestRef.id, status: type === 'BILL' ? 'BILL_REQUESTED' : 'REQUESTED' };
});

exports.updateTableRequest = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const requestId = cleanText(data.requestId, 100);
  const status = cleanText(data.status, 30).toUpperCase();
  if (!validId(tenantId) || !validId(locationId) || !requestId || !['ACKNOWLEDGED', 'RESOLVED'].includes(status)) throw new HttpsError('invalid-argument', 'Invalid table request update.');
  await requireTenantMember(request, tenantId, staffRoles);
  const ref = locationRef(tenantId, locationId).collection('tableRequests').doc(requestId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Table request not found.');
  await ref.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp(), resolvedBy: request.auth.uid });
  return { requestId, status };
});

exports.createSessionBill = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const sessionId = cleanText(data.sessionId, 100);
  if (!validId(tenantId) || !validId(locationId)) throw new HttpsError('invalid-argument', 'Invalid bill request.');
  await requireTenantMember(request, tenantId, ['owner', 'manager', 'receptionist', 'staff', 'platform_admin']);
  const session = await requireActiveSession(tenantId, locationId, sessionId);
  const ordersSnapshot = await session.ref.parent.parent.collection('orders').where('sessionId', '==', sessionId).get();
  const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(order => order.status !== 'CANCELLED');
  const subtotal = Number(orders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0).toFixed(2));
  const tax = Number(orders.reduce((sum, order) => sum + Number(order.tax || 0), 0).toFixed(2));
  const serviceCharge = Number(Math.max(0, Number(data.serviceCharge || 0)).toFixed(2));
  const total = Number((subtotal + tax + serviceCharge).toFixed(2));
  const splitCount = Math.max(1, Math.min(20, Number(data.splitCount) || 1));
  const shares = Array.from({ length: splitCount }, (_, index) => ({ part: index + 1, amount: Number((total / splitCount + (index === 0 ? total - Number((total / splitCount).toFixed(2)) * splitCount : 0)).toFixed(2)), status: 'PENDING' }));
  const billRef = locationRef(tenantId, locationId).collection('bills').doc();
  await billRef.set({ billId: billRef.id, tenantId, locationId, sessionId, tableId: session.data.tableId, tableNumber: session.data.tableNumber, orderIds: orders.map(order => order.id), subtotal, tax, serviceCharge, total, shares, paymentStatus: 'PENDING', createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { billId: billRef.id, subtotal, tax, serviceCharge, total, shares };
});

exports.cancelOrder = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const orderId = cleanText(data.orderId, 100);
  const phone = cleanText(data.phone, 40);
  if (!validId(tenantId) || !validId(locationId) || !orderId) throw new HttpsError('invalid-argument', 'Invalid cancellation request.');
  const ref = locationRef(tenantId, locationId).collection('orders').doc(orderId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Order not found.');
  const order = snapshot.data();
  const isMerchant = request.auth ? await requireTenantMember(request, tenantId, ['owner', 'manager', 'staff', 'platform_admin']).then(() => true).catch(() => false) : false;
  if (!isMerchant && (!phone || cleanText(order.user?.phone, 40) !== phone)) throw new HttpsError('permission-denied', 'You are not authorized to cancel this order.');
  const cancellableStatuses = order.orderType === 'DINE_IN' ? ['ORDER_PLACED', 'ORDER_ACCEPTED'] : ['New', 'Accepted'];
  if (!cancellableStatuses.includes(order.status)) throw new HttpsError('failed-precondition', 'This order can no longer be cancelled.');
  const cancelledStatus = order.orderType === 'DINE_IN' ? 'CANCELLED' : 'Rejected';
  await ref.update({ status: cancelledStatus, cancellationReason: cleanText(data.reason, 300) || 'Cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await writeAuditLog(tenantId, locationId, 'order.cancelled', request.auth, { orderId, refundRequired: order.paymentType !== 'cash' });
  return { orderId, status: cancelledStatus, refundRequired: order.paymentType !== 'cash' };
});

exports.recordAuditEvent = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const action = cleanText(data.action, 80);
  const allowedActions = ['dashboard.synced', 'settings.updated', 'menu.updated', 'menu.deleted'];
  if (!validId(tenantId) || !validId(locationId) || !allowedActions.includes(action)) throw new HttpsError('invalid-argument', 'Invalid audit event.');
  await requireTenantMember(request, tenantId, ['owner', 'manager', 'platform_admin']);
  await writeAuditLog(tenantId, locationId, action, request.auth, { source: 'merchant-dashboard' });
  return { recorded: true };
});

exports.createMerchantProfile = onCall(async request => {
  const data = request.data || {};
  const uid = cleanText(data.uid, 128);
  const tenantId = cleanText(data.tenantId, 80);
  const role = cleanText(data.role, 30);
  const displayName = cleanText(data.displayName, 120);
  if (!uid || !validId(tenantId) || !['owner', 'manager', 'staff', 'receptionist', 'kitchen', 'kitchen_staff', 'waiter'].includes(role)) {
    throw new HttpsError('invalid-argument', 'A valid user, restaurant, and merchant role are required.');
  }
  await requireTenantMember(request, tenantId, ['platform_admin']);
  let authUser;
  try {
    authUser = await admin.auth().getUser(uid);
  } catch (error) {
    throw new HttpsError('not-found', 'Create the user in Firebase Authentication before creating the merchant profile.');
  }
  await db.collection('users').doc(uid).set({
    tenantId,
    role,
    displayName: displayName || authUser.displayName || '',
    email: authUser.email || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await writeAuditLog(tenantId, 'main', 'merchant.profile_created', request.auth, { uid, role });
  return { uid, tenantId, role };
});

exports.getOrderStatus = onCall(async request => {
  const data = request.data || {};
  const tenantId = cleanText(data.tenantId, 80);
  const locationId = cleanText(data.locationId, 80) || 'main';
  const orderId = cleanText(data.orderId, 100);
  const phone = cleanText(data.phone, 40);
  if (!validId(tenantId) || !validId(locationId) || !orderId || !phone) throw new HttpsError('invalid-argument', 'Invalid order status request.');
  const snapshot = await locationRef(tenantId, locationId).collection('orders').doc(orderId).get();
  if (!snapshot.exists || cleanText(snapshot.data().user?.phone, 40) !== phone) throw new HttpsError('not-found', 'Order status not found.');
  return { orderId, status: snapshot.data().status, updatedAt: snapshot.data().updatedAt || null };
});

exports.paymentWebhook = onRequest({ secrets: [stripeWebhookSecret] }, async (request, response) => {
  if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');
  const rawBody = request.rawBody;
  if (!verifyStripeSignature(rawBody, request.get('stripe-signature'), stripeWebhookSecret.value())) return response.status(400).send('Invalid webhook signature');
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch { return response.status(400).send('Invalid webhook payload'); }
  if (!event.id || !event.type || !event.data?.object) return response.status(400).send('Invalid webhook event');

  const eventRef = db.collection('paymentEvents').doc(String(event.id));
  const claimed = await db.runTransaction(async transaction => {
    const existing = await transaction.get(eventRef);
    if (existing.exists) return false;
    transaction.create(eventRef, { type: event.type, receivedAt: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) return response.status(200).send('Already processed');

  const object = event.data.object;
  const metadata = object.metadata || {};
  const tenantId = cleanText(metadata.tenantId, 80);
  const locationId = cleanText(metadata.locationId, 80) || 'main';
  const orderId = cleanText(metadata.orderId, 100);
  if (!validId(tenantId) || !validId(locationId) || !orderId) return response.status(200).send('Ignored: missing order metadata');

  const paymentStatus = event.type === 'payment_intent.succeeded' || event.type === 'charge.succeeded' ? 'succeeded'
    : event.type === 'payment_intent.payment_failed' || event.type === 'charge.failed' ? 'failed'
      : event.type === 'charge.refunded' || event.type === 'refund.succeeded' ? 'refunded' : null;
  if (!paymentStatus) return response.status(200).send('Ignored event');
  const orderRef = locationRef(tenantId, locationId).collection('orders').doc(orderId);
  await orderRef.set({ paymentStatus, paymentEventId: event.id, paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await writeAuditLog(tenantId, locationId, `payment.${paymentStatus}`, null, { orderId, eventId: event.id });
  return response.status(200).send('Processed');
});

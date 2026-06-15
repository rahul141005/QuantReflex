/**
 * notifyClient.js — thin client to the ONE notification pipeline (ADR-066).
 *
 * This app NEVER creates notifications itself. It REQUESTS that one be sent by POSTing to main-app's single
 * internal endpoint (/api/notify), authenticated by the shared NOTIFY_INTERNAL_SECRET. This is just an HTTP call —
 * the notification logic (Inbox write, push, dedupe, logging, future retry/analytics) lives in exactly one place.
 *
 * Env: NOTIFY_ENDPOINT_URL (e.g. https://quantreflex.app/api/notify) OR MAIN_APP_URL; NOTIFY_INTERNAL_SECRET.
 */
'use strict';

function _endpoint() {
  if (process.env.NOTIFY_ENDPOINT_URL) return process.env.NOTIFY_ENDPOINT_URL;
  if (process.env.MAIN_APP_URL) return process.env.MAIN_APP_URL.replace(/\/+$/, '') + '/api/notify';
  return '';
}

/** Request a notification. payload = { recipients, notification, push?, adminUid?, logSegment? }. */
async function sendNotification(payload) {
  var endpoint = _endpoint();
  var secret = process.env.NOTIFY_INTERNAL_SECRET;
  if (!endpoint || !secret) throw new Error('Notification pipeline not configured (NOTIFY_ENDPOINT_URL/MAIN_APP_URL + NOTIFY_INTERNAL_SECRET).');
  var resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + secret },
    body: JSON.stringify(payload || {})
  });
  var data = await resp.json().catch(function () { return {}; });
  if (!resp.ok) { var e = new Error((data.error && data.error.message) || 'Notification request failed'); e.status = resp.status; e.payload = data; throw e; }
  return data;
}

module.exports = { sendNotification: sendNotification };

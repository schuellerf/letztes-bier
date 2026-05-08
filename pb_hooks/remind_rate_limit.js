/**
 * Per-request record id throttle for bar "Erinnern" (single PocketBase process only).
 */

var dbg = require(__hooks + '/push_notify_debug.js');

var lastByRequestId = Object.create(null);

module.exports = {
	allow: function (requestRecordId, windowMs) {
		var now = Date.now();
		var t = lastByRequestId[requestRecordId];
		if (t !== undefined && now - t < windowMs) {
			var waitMs = windowMs - (now - t);
			dbg.pushNotifyDebugLog('remind_rate_blocked', {
				requestId: requestRecordId,
				windowMs: windowMs,
				waitRemainingMs: waitMs > 0 ? waitMs : 0,
				lastAt: t
			});
			return false;
		}
		lastByRequestId[requestRecordId] = now;
		return true;
	}
};

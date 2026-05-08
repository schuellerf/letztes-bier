/**
 * Per-request record id throttle for bar "Erinnern" (single PocketBase process only).
 */

var lastByRequestId = Object.create(null);

module.exports = {
	allow: function (requestRecordId, windowMs) {
		var now = Date.now();
		var t = lastByRequestId[requestRecordId];
		if (t !== undefined && now - t < windowMs) {
			return false;
		}
		lastByRequestId[requestRecordId] = now;
		return true;
	}
};

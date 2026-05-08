/**
 * Simple per-IP throttle for public login-with-api-key (single PocketBase process only).
 */

var lastByIp = Object.create(null);

module.exports = {
	allow: function (ip, windowMs, maxPerWindow) {
		if (!ip) ip = '';
		var now = Date.now();
		var row = lastByIp[ip];
		if (!row || now - row.windowStart >= windowMs) {
			lastByIp[ip] = { windowStart: now, count: 1 };
			return true;
		}
		if (row.count >= maxPerWindow) {
			return false;
		}
		row.count++;
		return true;
	}
};

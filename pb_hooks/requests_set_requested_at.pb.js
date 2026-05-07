/// <reference path="../pb_data/types.d.ts" />

/** Set request time on the server when a bar creates a stock request (do not trust client clocks). */
onRecordCreateRequest((e) => {
	e.record.set('requested_at', new Date().toISOString());
	e.next();
}, 'requests');

/// <reference path="../pb_data/types.d.ts" />

/**
 * Allow authenticated admins to create pending requests (selected bar in client body).
 * Bar staff unchanged: bar must match @request.auth.bar.
 */
migrate(
	(app) => {
		const requests = app.findCollectionByNameOrId('requests');
		requests.createRule =
			'@request.auth.id != "" && status = "pending" && storage != "" && storage_name != "" && (@request.auth.role = "admin" || (@request.auth.role = "bar" && bar = @request.auth.bar))';
		app.save(requests);
	},
	(app) => {
		const requests = app.findCollectionByNameOrId('requests');
		requests.createRule =
			'@request.auth.id != "" && @request.auth.role = "bar" && bar = @request.auth.bar && status = "pending" && storage != "" && storage_name != ""';
		app.save(requests);
	}
);

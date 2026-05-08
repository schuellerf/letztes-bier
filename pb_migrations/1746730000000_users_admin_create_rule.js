/// <reference path="../pb_data/types.d.ts" />

/**
 * Allow app admins (custom role) to create bar/storage staff via the Records API.
 * Default auth createRule is locked (superuser-only); SPA admin UI uses pb.collection('users').create().
 */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.createRule =
			'@request.auth.id != "" && @request.auth.role = "admin" && (@request.body.role = "bar" || @request.body.role = "storage") && (@request.body.role != "bar" || @request.body.bar != "") && (@request.body.role != "storage" || @request.body.storage != "")';
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.createRule = null;
		app.save(users);
	}
);

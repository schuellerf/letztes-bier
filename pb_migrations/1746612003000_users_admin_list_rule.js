/// <reference path="../pb_data/types.d.ts" />

/** Allow app admins (custom `role` field) to list/view all `users` for the staff directory. */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.listRule = '@request.auth.id != "" && @request.auth.role = "admin"';
		users.viewRule =
			'@request.auth.id != "" && (@request.auth.id = id || @request.auth.role = "admin")';
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.listRule = null;
		users.viewRule = '@request.auth.id != "" && @request.auth.id = id';
		app.save(users);
	}
);

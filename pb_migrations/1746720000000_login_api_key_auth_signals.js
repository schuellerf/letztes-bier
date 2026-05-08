/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		users.fields.add(
			new TextField({
				name: 'login_api_key',
				required: false,
				max: 120,
				hidden: true
			})
		);
		users.fields.add(
			new DateField({
				name: 'token_invalid_before',
				required: false
			})
		);
		app.save(users);

		const authSignals = new Collection({
			type: 'base',
			name: 'auth_signals',
			fields: [
				{
					type: 'relation',
					name: 'user',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				{
					type: 'select',
					name: 'action',
					required: true,
					maxSelect: 1,
					values: ['logout', 'reauth']
				}
			]
		});

		app.save(authSignals);

		authSignals.listRule = '@request.auth.id != "" && user = @request.auth.id';
		authSignals.viewRule = '@request.auth.id != "" && user = @request.auth.id';
		authSignals.createRule = '1 = 0';
		authSignals.updateRule = '1 = 0';
		authSignals.deleteRule = '1 = 0';
		app.save(authSignals);
	},
	(app) => {
		try {
			const c = app.findCollectionByNameOrId('auth_signals');
			app.delete(c);
		} catch (_) {}

		try {
			const users = app.findCollectionByNameOrId('users');
			let changed = false;
			for (const name of ['login_api_key', 'token_invalid_before']) {
				try {
					const f = users.schema.getFieldByName(name);
					if (f) {
						users.fields.removeById(f.id);
						changed = true;
					}
				} catch (_) {}
			}
			if (changed) {
				app.save(users);
			}
		} catch (_) {}
	}
);

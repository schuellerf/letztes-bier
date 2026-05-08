/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		// Stable id for the default auth collection (see PocketBase docs / GitHub discussions).
		const usersCollectionId = '_pb_users_auth_';

		const pushSubscriptions = new Collection({
			type: 'base',
			name: 'push_subscriptions',
			fields: [
				new RelationField({
					name: 'owner',
					required: true,
					maxSelect: 1,
					collectionId: usersCollectionId,
					cascadeDelete: true
				}),
				{
					type: 'text',
					name: 'endpoint',
					required: true,
					max: 3000
				},
				{
					type: 'text',
					name: 'p256dh',
					required: true,
					max: 200
				},
				{
					type: 'text',
					name: 'auth',
					required: true,
					max: 200
				},
				{
					type: 'text',
					name: 'user_agent',
					required: false,
					max: 500
				}
			],
			indexes: ['CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint)']
		});

		// Save schema first so rule validation sees relation fields.
		app.save(pushSubscriptions);

		const c = app.findCollectionByNameOrId('push_subscriptions');
		c.listRule = '@request.auth.id != "" && owner.id = @request.auth.id';
		c.viewRule = '@request.auth.id != "" && owner.id = @request.auth.id';
		c.createRule =
			'@request.auth.id != "" && @request.body.owner:isset = true && @request.body.owner = @request.auth.id';
		c.updateRule = '@request.auth.id != "" && owner.id = @request.auth.id';
		c.deleteRule = '@request.auth.id != "" && owner.id = @request.auth.id';
		app.save(c);
	},
	(app) => {
		try {
			const c = app.findCollectionByNameOrId('push_subscriptions');
			app.delete(c);
		} catch (_) {}
	}
);

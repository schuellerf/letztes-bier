/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		const pushSubscriptions = new Collection({
			type: 'base',
			name: 'push_subscriptions',
			listRule: '@request.auth.id != "" && user = @request.auth.id',
			viewRule: '@request.auth.id != "" && user = @request.auth.id',
			createRule: '@request.auth.id != "" && user = @request.auth.id',
			updateRule: '@request.auth.id != "" && user = @request.auth.id',
			deleteRule: '@request.auth.id != "" && user = @request.auth.id',
			fields: [
				new RelationField({
					name: 'user',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
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

		app.save(pushSubscriptions);
	},
	(app) => {
		try {
			const c = app.findCollectionByNameOrId('push_subscriptions');
			app.delete(c);
		} catch (_) {}
	}
);

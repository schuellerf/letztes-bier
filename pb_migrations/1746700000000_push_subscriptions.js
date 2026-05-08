/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		const pushSubscriptions = new Collection({
			type: 'base',
			name: 'push_subscriptions',
			fields: [
				{
					type: 'relation',
					name: 'subscriber',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
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

		pushSubscriptions.listRule = '@request.auth.id != "" && subscriber = @request.auth.id';
		pushSubscriptions.viewRule = '@request.auth.id != "" && subscriber = @request.auth.id';
		pushSubscriptions.createRule =
			'@request.auth.id != "" && @request.body.subscriber:isset = true && @request.body.subscriber = @request.auth.id';
		pushSubscriptions.updateRule = '@request.auth.id != "" && subscriber = @request.auth.id';
		pushSubscriptions.deleteRule = '@request.auth.id != "" && subscriber = @request.auth.id';
		app.save(pushSubscriptions);
	},
	(app) => {
		try {
			const c = app.findCollectionByNameOrId('push_subscriptions');
			app.delete(c);
		} catch (_) {}
	}
);

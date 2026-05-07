/// <reference path="../pb_data/types.d.ts" />

/**
 * Bars & requests schema with auth-backed roles on `users`.
 * See docs/RULES.md for public vs LAN-oriented rule notes.
 */
migrate(
	(app) => {
		const bars = new Collection({
			type: 'base',
			name: 'bars',
			listRule:
				'@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "storage" || @request.auth.role = "bar")',
			viewRule:
				'@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "storage" || @request.auth.role = "bar")',
			createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
			updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
			deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
			fields: [
				{
					type: 'text',
					name: 'name',
					required: true,
					max: 200
				}
			]
		});

		app.save(bars);

		const users = app.findCollectionByNameOrId('users');

		users.fields.add(
			new SelectField({
				name: 'role',
				maxSelect: 1,
				values: ['admin', 'bar', 'storage']
			})
		);

		users.fields.add(
			new RelationField({
				name: 'bar',
				maxSelect: 1,
				collectionId: bars.id,
				cascadeDelete: false,
				required: false
			})
		);

		app.save(users);

		const requests = new Collection({
			type: 'base',
			name: 'requests',
			listRule:
				'@request.auth.id != "" && (@request.auth.role = "storage" || @request.auth.role = "admin" || (@request.auth.role = "bar" && bar = @request.auth.bar))',
			viewRule:
				'@request.auth.id != "" && (@request.auth.role = "storage" || @request.auth.role = "admin" || (@request.auth.role = "bar" && bar = @request.auth.bar))',
			createRule:
				'@request.auth.id != "" && @request.auth.role = "bar" && bar = @request.auth.bar && status = "pending"',
			updateRule: '@request.auth.id != "" && (@request.auth.role = "storage" || @request.auth.role = "admin")',
			deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
			fields: [
				{
					type: 'relation',
					name: 'bar',
					required: true,
					maxSelect: 1,
					collectionId: bars.id,
					cascadeDelete: false
				},
				{
					type: 'text',
					name: 'bar_name',
					required: true,
					max: 200
				},
				{
					type: 'json',
					name: 'items',
					required: true
				},
				{
					type: 'select',
					name: 'status',
					required: true,
					maxSelect: 1,
					values: ['pending', 'accepted', 'done']
				},
				{
					type: 'date',
					name: 'accepted_at',
					required: false
				},
				{
					type: 'date',
					name: 'completed_at',
					required: false
				},
				{
					type: 'text',
					name: 'bar_device_nickname',
					required: false,
					max: 120
				},
				{
					type: 'text',
					name: 'accepted_by_nickname',
					required: false,
					max: 120
				}
			]
		});

		app.save(requests);
	},
	(app) => {
		try {
			const requests = app.findCollectionByNameOrId('requests');
			app.delete(requests);
		} catch (_) {}

		try {
			const users = app.findCollectionByNameOrId('users');
			const roleField = users.fields.getByName('role');
			if (roleField) {
				users.fields.remove(roleField.id);
			}
			const barField = users.fields.getByName('bar');
			if (barField) {
				users.fields.remove(barField.id);
			}
			app.save(users);
		} catch (_) {}

		try {
			const bars = app.findCollectionByNameOrId('bars');
			app.delete(bars);
		} catch (_) {}
	}
);

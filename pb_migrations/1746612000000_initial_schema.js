/// <reference path="../pb_data/types.d.ts" />

/**
 * Letztes Bier — full schema for fresh installs (squashed migrations).
 * Requires empty `pb_data` / no prior migration history. See docs/RULES.md
 *
 * Default storage hub uses `hub_order` (not `sort` — reserved/problematic in PocketBase).
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

		const storages = new Collection({
			type: 'base',
			name: 'storages',
			listRule:
				'@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "storage" || @request.auth.role = "bar")',
			viewRule:
				'@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "storage" || @request.auth.role = "bar")',
			createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
			updateRule:
				'@request.auth.id != "" && (@request.auth.role = "admin" || (@request.auth.role = "storage" && id = @request.auth.storage))',
			deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
			fields: [
				{
					type: 'text',
					name: 'name',
					required: true,
					max: 200
				},
				{
					type: 'number',
					name: 'hub_order',
					required: true,
					onlyInt: true,
					min: 1
				},
				{
					type: 'json',
					name: 'quick_items',
					required: false
				}
			]
		});

		app.save(storages);

		const presetLabels = [
			'Bier',
			'Vodka',
			'Gin',
			'Rum',
			'Ice',
			'Tonic',
			'Orangen saft',
			'Apfelsaft',
			'Rotwein',
			'Weißwein',
			'Cola',
			'Almdudler'
		];

		// PocketBase treats 0 as blank for required number fields in migrations; use set() + min 1.
		const main = new Record(storages);
		main.set('name', 'Main');
		main.set('hub_order', 1);
		main.set('quick_items', presetLabels);
		app.save(main);

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

		users.fields.add(
			new RelationField({
				name: 'storage',
				maxSelect: 1,
				collectionId: storages.id,
				cascadeDelete: false,
				required: false
			})
		);

		users.listRule = '@request.auth.id != "" && @request.auth.role = "admin"';
		users.viewRule =
			'@request.auth.id != "" && (@request.auth.id = id || @request.auth.role = "admin")';

		app.save(users);

		const requests = new Collection({
			type: 'base',
			name: 'requests',
			listRule:
				'@request.auth.id != "" && (@request.auth.role = "admin" || (@request.auth.role = "storage" && storage = @request.auth.storage) || (@request.auth.role = "bar" && bar = @request.auth.bar))',
			viewRule:
				'@request.auth.id != "" && (@request.auth.role = "admin" || (@request.auth.role = "storage" && storage = @request.auth.storage) || (@request.auth.role = "bar" && bar = @request.auth.bar))',
			createRule:
				'@request.auth.id != "" && @request.auth.role = "bar" && bar = @request.auth.bar && status = "pending" && storage != "" && storage_name != ""',
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
				},
				{
					type: 'date',
					name: 'requested_at',
					required: false
				},
				{
					type: 'text',
					name: 'done_by_nickname',
					required: false,
					max: 120
				},
				{
					type: 'relation',
					name: 'storage',
					required: true,
					maxSelect: 1,
					collectionId: storages.id,
					cascadeDelete: false
				},
				{
					type: 'text',
					name: 'storage_name',
					required: true,
					max: 200
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
			users.listRule = null;
			users.viewRule = '@request.auth.id != "" && @request.auth.id = id';
			const storageField = users.fields.getByName('storage');
			if (storageField) users.fields.remove(storageField.id);
			const barField = users.fields.getByName('bar');
			if (barField) users.fields.remove(barField.id);
			const roleField = users.fields.getByName('role');
			if (roleField) users.fields.remove(roleField.id);
			app.save(users);
		} catch (_) {}

		try {
			const storages = app.findCollectionByNameOrId('storages');
			app.delete(storages);
		} catch (_) {}

		try {
			const bars = app.findCollectionByNameOrId('bars');
			app.delete(bars);
		} catch (_) {}
	}
);

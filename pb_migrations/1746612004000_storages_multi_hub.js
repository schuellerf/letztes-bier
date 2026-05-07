/// <reference path="../pb_data/types.d.ts" />

/**
 * Multi-storage hubs: `storages` with per-hub `quick_items`, `users.storage`, `requests.storage` + `storage_name`.
 * Default hub is the row with lowest `sort` (seed "Main" at 0). Existing data backfills to Main.
 */
migrate(
	(app) => {
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
					name: 'sort',
					required: true,
					onlyInt: true,
					min: 0
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
			'Vodka',
			'Gin',
			'Rum',
			'Ice',
			'Tonic',
			'Orange juice',
			'Lime',
			'Beer crates',
			'Red wine',
			'White wine',
			'Soft drinks'
		];

		const main = new Record(storages, {
			name: 'Main',
			sort: 0,
			quick_items: presetLabels
		});
		app.save(main);
		const mainId = main.id;

		const users = app.findCollectionByNameOrId('users');
		users.fields.add(
			new RelationField({
				name: 'storage',
				maxSelect: 1,
				collectionId: storages.id,
				cascadeDelete: false,
				required: false
			})
		);
		app.save(users);

		const requests = app.findCollectionByNameOrId('requests');
		requests.fields.add(
			new RelationField({
				name: 'storage',
				maxSelect: 1,
				collectionId: storages.id,
				cascadeDelete: false,
				required: false
			})
		);
		requests.fields.add(
			new TextField({
				name: 'storage_name',
				required: false,
				max: 200
			})
		);
		app.save(requests);

		const allRequests = app.findRecordsByFilter('requests', '', '', 200000, 0);
		for (const r of allRequests) {
			if (!r) continue;
			r.set('storage', mainId);
			r.set('storage_name', 'Main');
			app.save(r);
		}

		const storageStaff = app.findRecordsByFilter('users', 'role = "storage"', '', 10000, 0);
		for (const u of storageStaff) {
			if (!u) continue;
			u.set('storage', mainId);
			app.save(u);
		}

		const reqCol = app.findCollectionByNameOrId('requests');
		const storageRel = reqCol.fields.getByName('storage');
		if (storageRel) storageRel.required = true;
		const storageNameF = reqCol.fields.getByName('storage_name');
		if (storageNameF) storageNameF.required = true;

		reqCol.listRule =
			'@request.auth.id != "" && (@request.auth.role = "admin" || (@request.auth.role = "storage" && storage = @request.auth.storage) || (@request.auth.role = "bar" && bar = @request.auth.bar))';
		reqCol.viewRule = reqCol.listRule;
		reqCol.createRule =
			'@request.auth.id != "" && @request.auth.role = "bar" && bar = @request.auth.bar && status = "pending" && storage != "" && storage_name != ""';

		app.save(reqCol);
	},
	(app) => {
		const requests = app.findCollectionByNameOrId('requests');
		requests.listRule =
			'@request.auth.id != "" && (@request.auth.role = "storage" || @request.auth.role = "admin" || (@request.auth.role = "bar" && bar = @request.auth.bar))';
		requests.viewRule = requests.listRule;
		requests.createRule =
			'@request.auth.id != "" && @request.auth.role = "bar" && bar = @request.auth.bar && status = "pending"';
		const sn = requests.fields.getByName('storage_name');
		if (sn) requests.fields.remove(sn.id);
		const sr = requests.fields.getByName('storage');
		if (sr) requests.fields.remove(sr.id);
		app.save(requests);

		const users = app.findCollectionByNameOrId('users');
		const uf = users.fields.getByName('storage');
		if (uf) users.fields.remove(uf.id);
		app.save(users);

		try {
			const storages = app.findCollectionByNameOrId('storages');
			app.delete(storages);
		} catch (_) {}
	}
);

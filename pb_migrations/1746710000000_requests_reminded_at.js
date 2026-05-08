/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const requests = app.findCollectionByNameOrId('requests');
		requests.fields.add(
			new DateField({
				name: 'reminded_at',
				required: false
			})
		);
		app.save(requests);
	},
	(app) => {
		try {
			const requests = app.findCollectionByNameOrId('requests');
			const f = requests.schema.getFieldByName('reminded_at');
			if (f) {
				requests.fields.removeById(f.id);
				app.save(requests);
			}
		} catch (_) {}
	}
);

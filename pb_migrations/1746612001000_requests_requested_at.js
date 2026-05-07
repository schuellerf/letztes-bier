/// <reference path="../pb_data/types.d.ts" />

/** When the bar submitted the request; value is set by `pb_hooks` on create (server clock). */
migrate(
	(app) => {
		const requests = app.findCollectionByNameOrId('requests');
		requests.fields.add(
			new DateField({
				name: 'requested_at',
				required: false
			})
		);
		app.save(requests);
	},
	(app) => {
		const requests = app.findCollectionByNameOrId('requests');
		const f = requests.fields.getByName('requested_at');
		if (f) {
			requests.fields.remove(f.id);
		}
		app.save(requests);
	}
);

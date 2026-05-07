/// <reference path="../pb_data/types.d.ts" />

/** Who marked the request done (storage device nickname). */
migrate(
	(app) => {
		const requests = app.findCollectionByNameOrId('requests');
		requests.fields.add(
			new TextField({
				name: 'done_by_nickname',
				required: false,
				max: 120
			})
		);
		app.save(requests);
	},
	(app) => {
		const requests = app.findCollectionByNameOrId('requests');
		const f = requests.fields.getByName('done_by_nickname');
		if (f) {
			requests.fields.remove(f.id);
		}
		app.save(requests);
	}
);

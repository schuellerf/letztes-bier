/// <reference types="@sveltejs/kit" />

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};

interface ImportMetaEnv {
	readonly PUBLIC_POCKETBASE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

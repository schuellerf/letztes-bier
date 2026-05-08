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

declare module '$env/static/public' {
	export const PUBLIC_POCKETBASE_URL: string | undefined;
}

interface ImportMetaEnv {
	readonly PUBLIC_POCKETBASE_URL?: string;
	readonly PUBLIC_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

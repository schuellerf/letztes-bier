/** Per-hub UI accents (no blue/sky/cyan/indigo — blue reserved for “in cart” quick-select). */

export type StorageHubAccent = {
	legendBubble: string;
	presetIdle: string;
	cartLine: string;
};

/** Border, background, and text match across legend, idle presets, and cart rows (cart adds a thick left bar). */
export const STORAGE_HUB_PALETTE: StorageHubAccent[] = [
	{
		legendBubble: 'border border-rose-400/40 bg-rose-950/20 text-zinc-200',
		presetIdle: 'border-rose-400/40 bg-rose-950/20 text-zinc-200 hover:bg-rose-950/35',
		cartLine: 'border-l-4 border-l-rose-400/40 bg-rose-950/20 pl-2.5 rounded-r-md'
	},
	{
		legendBubble: 'border border-amber-400/40 bg-amber-950/20 text-zinc-200',
		presetIdle: 'border-amber-400/40 bg-amber-950/20 text-zinc-200 hover:bg-amber-950/35',
		cartLine: 'border-l-4 border-l-amber-400/40 bg-amber-950/20 pl-2.5 rounded-r-md'
	},
	{
		legendBubble: 'border border-emerald-400/40 bg-emerald-950/20 text-zinc-200',
		presetIdle: 'border-emerald-400/40 bg-emerald-950/20 text-zinc-200 hover:bg-emerald-950/35',
		cartLine: 'border-l-4 border-l-emerald-400/40 bg-emerald-950/20 pl-2.5 rounded-r-md'
	},
	{
		legendBubble: 'border border-violet-400/40 bg-violet-950/20 text-zinc-200',
		presetIdle: 'border-violet-400/40 bg-violet-950/20 text-zinc-200 hover:bg-violet-950/35',
		cartLine: 'border-l-4 border-l-violet-400/40 bg-violet-950/20 pl-2.5 rounded-r-md'
	},
	{
		legendBubble: 'border border-fuchsia-400/40 bg-fuchsia-950/20 text-zinc-200',
		presetIdle: 'border-fuchsia-400/40 bg-fuchsia-950/20 text-zinc-200 hover:bg-fuchsia-950/35',
		cartLine: 'border-l-4 border-l-fuchsia-400/40 bg-fuchsia-950/20 pl-2.5 rounded-r-md'
	},
	{
		legendBubble: 'border border-orange-400/40 bg-orange-950/20 text-zinc-200',
		presetIdle: 'border-orange-400/40 bg-orange-950/20 text-zinc-200 hover:bg-orange-950/35',
		cartLine: 'border-l-4 border-l-orange-400/40 bg-orange-950/20 pl-2.5 rounded-r-md'
	},
	{
		legendBubble: 'border border-lime-400/40 bg-lime-950/20 text-zinc-200',
		presetIdle: 'border-lime-400/40 bg-lime-950/20 text-zinc-200 hover:bg-lime-950/35',
		cartLine: 'border-l-4 border-l-lime-400/40 bg-lime-950/20 pl-2.5 rounded-r-md'
	},
	{
		legendBubble: 'border border-pink-400/40 bg-pink-950/20 text-zinc-200',
		presetIdle: 'border-pink-400/40 bg-pink-950/20 text-zinc-200 hover:bg-pink-950/35',
		cartLine: 'border-l-4 border-l-pink-400/40 bg-pink-950/20 pl-2.5 rounded-r-md'
	}
];

export const PRESET_QUICK_SELECT_SELECTED =
	'border-blue-500 bg-blue-900/90 text-blue-50 shadow-md shadow-blue-950/50';

export function storageHubColorIndex(storages: { id: string }[], storageId: string): number {
	const i = storages.findIndex((s) => s.id === storageId);
	if (i < 0) return 0;
	return i % STORAGE_HUB_PALETTE.length;
}

export function storageHubAccent(storages: { id: string }[], storageId: string): StorageHubAccent {
	const idx = storageHubColorIndex(storages, storageId);
	return STORAGE_HUB_PALETTE[idx] as StorageHubAccent;
}

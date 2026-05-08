import type { RecordModel } from 'pocketbase';

export type UserRole = 'admin' | 'bar' | 'storage';

export type RequestStatus = 'pending' | 'accepted' | 'done';

export type StockItem = { label: string; qty: number };

export type StockRequestRecord = RecordModel & {
	/** ISO datetime; set by PocketBase hook on create (`pb_hooks`). */
	requested_at?: string;
	bar: string;
	bar_name: string;
	storage: string;
	storage_name: string;
	items: StockItem[];
	status: RequestStatus;
	accepted_at?: string;
	completed_at?: string;
	bar_device_nickname?: string;
	accepted_by_nickname?: string;
	done_by_nickname?: string;
	/** Set by bar "Erinnern" hook; drives realtime local notification when Web Push is unavailable. */
	reminded_at?: string;
};

/** `bars` collection row. */
export type BarRecord = RecordModel & {
	name: string;
};

/** `storages` collection row (hub + quick_items JSON). */
export type StorageHubRecord = RecordModel & {
	name: string;
	hub_order: number;
	quick_items?: unknown;
};

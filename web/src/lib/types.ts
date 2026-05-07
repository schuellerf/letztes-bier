import type { RecordModel } from 'pocketbase';

export type UserRole = 'admin' | 'bar' | 'storage';

export type RequestStatus = 'pending' | 'accepted' | 'done';

export type StockItem = { label: string; qty: number };

export type StockRequestRecord = RecordModel & {
	bar: string;
	bar_name: string;
	items: StockItem[];
	status: RequestStatus;
	accepted_at?: string;
	completed_at?: string;
	bar_device_nickname?: string;
	accepted_by_nickname?: string;
};

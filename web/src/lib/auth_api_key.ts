import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { COLLECTIONS } from '$lib/pb_client';

export const API_AUTH_LOGIN_WITH_KEY = '/api/custom/auth/login-with-api-key';
export const API_ADMIN_ENSURE_LOGIN_KEY = '/api/custom/admin/ensure-user-login-api-key';
export const API_ADMIN_REVOKE_LOGIN_KEY = '/api/custom/admin/revoke-user-login-api-key';

/** Try password auth, then device API key against custom route; then refresh with expand. */
export async function authUsersWithPasswordOrApiKey(
	pb: PocketBase,
	email: string,
	secret: string,
	expand: string
): Promise<void> {
	const em = email.trim();
	try {
		await pb.collection(COLLECTIONS.users).authWithPassword(em, secret, { expand });
		return;
	} catch {
		/* fall through */
	}
	const res = (await pb.send(API_AUTH_LOGIN_WITH_KEY, {
		method: 'POST',
		body: JSON.stringify({ identity: em, apiKey: secret })
	})) as { token: string; record: RecordModel };
	pb.authStore.save(res.token, res.record);
	await pb.collection(COLLECTIONS.users).authRefresh({ expand });
}

import PocketBase from 'pocketbase';

const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'https://drummate-api.yourdomain.com';

export const pb = new PocketBase(POCKETBASE_URL);

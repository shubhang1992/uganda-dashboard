// Centralised environment config — all env vars accessed through here.
// When backend is ready, update VITE_API_BASE_URL in .env per environment.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;

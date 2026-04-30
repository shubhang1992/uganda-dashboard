// Centralised environment config — all env vars accessed through here.
// When backend is ready, update VITE_API_BASE_URL in .env per environment.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;

/* Public marketing / support URLs. Move to env if they ever vary per region. */
export const LEGAL_TERMS_URL = import.meta.env.VITE_LEGAL_TERMS_URL || 'https://universalpensions.com/legal/terms';
export const LEGAL_PRIVACY_URL = import.meta.env.VITE_LEGAL_PRIVACY_URL || 'https://universalpensions.com/legal/privacy';
export const SUPPORT_WHATSAPP_URL = import.meta.env.VITE_SUPPORT_WHATSAPP_URL || 'https://wa.me/256700123456';
export const SUPPORT_WHATSAPP_DISPLAY = import.meta.env.VITE_SUPPORT_WHATSAPP_DISPLAY || '+256 700 123 456';
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@upensions.ug';

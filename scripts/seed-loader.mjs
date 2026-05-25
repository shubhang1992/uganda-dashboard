/**
 * ESM resolution hook so the seed script can `import` from
 * `src/data/mockData.js` without modifying that file.
 *
 * mockData.js was written for Vite, which silently appends `.js` to
 * extension-less specifiers (`import { DISTRICTS } from './mockGeo'`). Raw
 * Node (strict ESM) does not. We add the extension here when the
 * extension-less form resolves to a real file on disk.
 *
 * Registered automatically by seed-supabase.mjs via `module.register()`.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  // Only fix up relative specifiers without an extension.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const hasExt = /\.[a-zA-Z0-9]+$/.test(specifier);
    if (!hasExt) {
      try {
        const candidate = new URL(`${specifier}.js`, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(`${specifier}.js`, context);
        }
      } catch {
        // fall through to nextResolve below
      }
    }
  }
  return nextResolve(specifier, context);
}

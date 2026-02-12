

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "ssr": false,
  "prerender": true
};
export const universal_id = "src/routes/+layout.js";
export const imports = ["_app/immutable/nodes/0.z_iACuOm.js","_app/immutable/chunks/C3naZ_aw.js","_app/immutable/chunks/u-V2FJD4.js","_app/immutable/chunks/BuQFz81q.js","_app/immutable/chunks/DAnSlbq3.js"];
export const stylesheets = ["_app/immutable/assets/0.0-Q9l2S9.css"];
export const fonts = [];

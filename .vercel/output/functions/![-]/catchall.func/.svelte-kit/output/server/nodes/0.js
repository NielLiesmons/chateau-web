

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+layout.js";
export const imports = ["_app/immutable/nodes/0.Cryl4DH2.js","_app/immutable/chunks/D7t2vzad.js","_app/immutable/chunks/BdGYojfW.js","_app/immutable/chunks/CpKU4VzX.js","_app/immutable/chunks/z4ZBlPyY.js"];
export const stylesheets = ["_app/immutable/assets/0.UMoeCXCV.css"];
export const fonts = [];

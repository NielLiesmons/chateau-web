

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+page.js";
export const imports = ["_app/immutable/nodes/2.DdEkjCzS.js","_app/immutable/chunks/D7t2vzad.js","_app/immutable/chunks/BdGYojfW.js","_app/immutable/chunks/CpKU4VzX.js","_app/immutable/chunks/B0ozIckt.js","_app/immutable/chunks/CL4-IqT1.js","_app/immutable/chunks/C9sjio-i.js","_app/immutable/chunks/DkahaeuN.js","_app/immutable/chunks/z4ZBlPyY.js"];
export const stylesheets = ["_app/immutable/assets/2.BZ4Kj7wn.css"];
export const fonts = [];

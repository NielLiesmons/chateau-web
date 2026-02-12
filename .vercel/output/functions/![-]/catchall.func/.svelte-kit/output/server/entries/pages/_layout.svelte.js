function _layout($$renderer, $$props) {
  let { children } = $$props;
  $$renderer.push(`<div class="min-h-screen relative bg-background"><div class="fixed inset-0 bg-gradient-subtle pointer-events-none"></div> <div class="fixed inset-0 bg-dither pointer-events-none opacity-40"></div> <div class="relative z-10">`);
  children($$renderer);
  $$renderer.push(`<!----></div></div>`);
}
export {
  _layout as default
};

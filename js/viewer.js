/* viewer.js - the boot stub for section 12, "Watch one run, second by second".
 *
 * The viewer itself is js/viewer-main.js, about 48 KB of module. It sits three
 * quarters of the way down a 470 KB page, so it is fetched the first time the
 * section comes near the viewport rather than on every page load. A deep link to
 * an episode (#e1, #e2, #episode-astra, #episode-opus) loads it immediately.
 *
 * Without this file, or with JavaScript off, the section is still two videos with
 * their WebVTT captions, their chapter track and a written summary.
 */

const root = document.querySelector('[data-agp-viewer]');

if (root) {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    import('./viewer-main.js').catch(() => { /* the static markup carries the section */ });
  };

  const deepLink = () => /^#(e1|e2)(\b|&)|^#episode-/.test(location.hash || '');

  if (deepLink()) {
    start();
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: '600px 0px' });
    io.observe(root);
    window.addEventListener('hashchange', () => { if (deepLink()) { io.disconnect(); start(); } });
  } else {
    start();
  }
}

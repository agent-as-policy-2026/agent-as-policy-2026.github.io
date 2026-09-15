/* autoplay.js - clips play when they come into view, and only two at a time.
   Every clip also has native controls, so nothing here is required to watch anything.
   A clip the reader started by hand is never paused by the observer.
   prefers-reduced-motion turns the whole mechanism off. */

const MAX_PLAYING = 2;
const VISIBLE = 0.55;

const videos = Array.from(document.querySelectorAll('video[data-autoplay]'));
const ratios = new Map();      // video -> last intersection ratio
const autoStarted = new Set(); // clips this module started
const manual = new Set();      // clips the reader started
let suspended = false;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

function canAutoplay() {
  return !suspended && !reduced.matches;
}

function play(video) {
  const p = video.play();
  if (p && typeof p.catch === 'function') p.catch(() => { autoStarted.delete(video); });
  autoStarted.add(video);
}

function pauseAuto(video) {
  if (autoStarted.has(video) && !manual.has(video)) {
    video.pause();
    autoStarted.delete(video);
  }
}

function rank() {
  if (!canAutoplay()) return;
  const inView = videos
    .filter((v) => (ratios.get(v) || 0) >= VISIBLE && !v.ended)
    .sort((a, b) => (ratios.get(b) || 0) - (ratios.get(a) || 0));
  const keep = new Set(inView.slice(0, MAX_PLAYING));
  videos.forEach((v) => {
    if (keep.has(v)) {
      if (v.paused && !manual.has(v)) play(v);
    } else if (!manual.has(v)) {
      pauseAuto(v);
    }
  });
  // Two clips playing is the ceiling, hand-started ones included.
  const playing = videos.filter((v) => !v.paused);
  if (playing.length > MAX_PLAYING) {
    playing
      .sort((a, b) => (ratios.get(a) || 0) - (ratios.get(b) || 0))
      .slice(0, playing.length - MAX_PLAYING)
      .forEach((v) => { v.pause(); autoStarted.delete(v); });
  }
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
  });
  rank();
}, { threshold: [0, 0.25, 0.55, 0.8, 1] });

videos.forEach((video) => {
  observer.observe(video);
  video.addEventListener('play', () => {
    if (!autoStarted.has(video)) manual.add(video);
    rank();
  });
  video.addEventListener('pause', () => {
    if (manual.has(video) && (ratios.get(video) || 0) < VISIBLE) manual.delete(video);
  });
  video.addEventListener('ended', () => {
    manual.delete(video);
    autoStarted.delete(video);
    rank();
  });
});

function pauseEverything() {
  videos.forEach((v) => { v.pause(); autoStarted.delete(v); manual.delete(v); });
}

/* js/tabs.js shows and hides whole clip figures. A video inside a hidden panel has no
   layout, so its last IntersectionObserver entry says zero and the observer owes it a
   fresh one only once the browser has laid the panel out again. Read the geometry
   directly on the change instead: forget the clips that just went away, measure the one
   that just arrived, and re-rank. MAX_PLAYING is untouched, so a tab change can never put
   a third clip on the page. */
function visibleRatio(video) {
  const r = video.getBoundingClientRect();
  if (!r.width || !r.height) return 0;
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const covered = Math.min(r.bottom, viewport) - Math.max(r.top, 0);
  return Math.max(0, Math.min(1, covered / r.height));
}

document.addEventListener('agp:tabchange', () => {
  videos.forEach((video) => {
    if (video.getClientRects().length === 0) {
      /* off the page now: it cannot be watched, so it must not be playing */
      ratios.set(video, 0);
      video.pause();
      autoStarted.delete(video);
      manual.delete(video);
    } else {
      ratios.set(video, visibleRatio(video));
    }
  });
  rank();
});

document.addEventListener('agp:sourcechange', ({ detail: { video } }) => {
  autoStarted.delete(video);
  manual.delete(video);
  ratios.set(video, visibleRatio(video));
  rank();
});

document.addEventListener('agp:input-play', ({ detail: { video } }) => {
  video.pause();
  autoStarted.delete(video);
  manual.add(video);
});

/* The episode viewer says when it starts playing. Two long clips decoding at once is
   exactly what the two-at-a-time cap exists to prevent, and the uncut episode is the
   largest file on the page, so the section clips stop. */
document.addEventListener('agp:viewer-play', pauseEverything);

let relabel = () => {};

const button = document.getElementById('agp-pause-all');
if (button) {
  button.hidden = false;
  const label = () => {
    if (reduced.matches && !suspended) {
      /* Nothing starts by itself under reduced motion, so the control must not promise
         to stop something that is not happening. It still pauses clips the reader
         started by hand. */
      button.textContent = 'Clips do not autoplay';
      button.setAttribute('aria-pressed', 'false');
      button.title = 'Your browser asks for reduced motion, so no clip starts on its own. '
        + 'Press to pause any clip you started.';
      return;
    }
    button.removeAttribute('title');
    button.textContent = suspended ? 'Play clips' : 'Pause clips';
    button.setAttribute('aria-pressed', String(suspended));
  };
  button.addEventListener('click', () => {
    suspended = !suspended;
    if (suspended) {
      pauseEverything();
      /* the viewer listens for this and stops its own episode */
      document.dispatchEvent(new CustomEvent('agp:pause-all'));
    } else {
      rank();
    }
    label();
  });
  relabel = label;
  label();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) videos.forEach((v) => { if (autoStarted.has(v)) v.pause(); });
  else rank();
});

reduced.addEventListener('change', () => {
  if (reduced.matches) videos.forEach((v) => { if (autoStarted.has(v)) v.pause(); });
  else rank();
  relabel();
});

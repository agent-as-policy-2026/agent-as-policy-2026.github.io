/* marks.js - the trial marks. Each mark is a link to its own card in the trial browser,
   so it works without this file. Here it also gets a tooltip on hover and on focus, and,
   when the browser module is loaded, a click opens that trial's record in place. */

const FIELDS = [
  ['trial', 'Trial'],
  ['model', 'Model'],
  ['harness', 'Harness'],
  ['arm', 'Arm'],
  ['time', 'Time (min)'],
  ['tokens', 'Tokens (k)'],
  ['cost', 'Cost (USD)'],
  ['agent', 'Agent report'],
];

let tip = null;
let tipFor = null;
let hideTimer = null;
let overTip = false;

function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'agp-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.id = 'agp-mark-tooltip';
  tip.hidden = true;
  /* WCAG 1.4.13: a reader moving the pointer onto the tooltip to finish reading a long
     row keeps it, rather than losing it in the gap. */
  tip.addEventListener('mouseenter', () => { overTip = true; clearTimeout(hideTimer); });
  tip.addEventListener('mouseleave', () => { overTip = false; hideSoon(); });
  document.body.appendChild(tip);
  return tip;
}

function hideSoon() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (!overTip) hide(); }, 220);
}

function fill(mark) {
  const d = mark.dataset;
  const rows = FIELDS
    .filter(([key]) => d[key])
    .map(([key, label]) => `<dt>${label}</dt><dd>${d[key]}</dd>`)
    .join('');
  const outcome = d.outcome === 'failure' ? 'failure' : 'success';
  ensureTip().innerHTML =
    `<div class="agp-tooltip-title">${d.config}</div>` +
    `<div class="agp-tooltip-outcome" data-outcome="${d.outcome}">Audited outcome: ${outcome}</div>` +
    `<dl>${rows}</dl>`;
}

function place(mark) {
  const r = mark.getBoundingClientRect();
  tip.hidden = false;
  const t = tip.getBoundingClientRect();
  let left = window.scrollX + r.left + r.width / 2 - t.width / 2;
  left = Math.max(window.scrollX + 8, Math.min(left, window.scrollX + document.documentElement.clientWidth - t.width - 8));
  let top = window.scrollY + r.top - t.height - 8;
  if (r.top - t.height - 8 < 8) top = window.scrollY + r.bottom + 8;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.style.position = 'absolute';
}

function show(mark) {
  clearTimeout(hideTimer);
  if (tipFor === mark) return;
  tipFor = mark;
  fill(mark);
  place(mark);
  mark.setAttribute('aria-describedby', 'agp-mark-tooltip');
}

function hide() {
  clearTimeout(hideTimer);
  overTip = false;
  if (!tip) return;
  tip.hidden = true;
  if (tipFor) tipFor.removeAttribute('aria-describedby');
  tipFor = null;
}

function bind(mark) {
  mark.addEventListener('mouseenter', () => show(mark));
  mark.addEventListener('mouseleave', hideSoon);
  mark.addEventListener('focus', () => show(mark));
  mark.addEventListener('blur', hide);
  mark.addEventListener('click', (event) => {
    if (document.documentElement.dataset.trialsReady !== '1') return;  // plain anchor
    event.preventDefault();
    hide();
    document.dispatchEvent(new CustomEvent('agp:open-trial', { detail: mark.dataset.slot }));
  });
}

document.querySelectorAll('.agp-mark').forEach(bind);

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
window.addEventListener('scroll', () => { if (tipFor) place(tipFor); }, { passive: true });
window.addEventListener('resize', hide);

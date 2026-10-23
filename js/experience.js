// Connect a readable takeaway with its verbatim supporting evidence.
for (const panel of document.querySelectorAll('.exp-memory-panel')) {
  const source = panel.querySelector('.exp-memory-source');
  const svg = panel.querySelector('.exp-evidence-link');
  const path = svg.querySelector('path');
  let selected = null;
  let target = null;
  const draw = () => {
    path.removeAttribute('d');
    if (!selected || panel.hidden) return;
    const box = panel.getBoundingClientRect();
    const from = selected.getBoundingClientRect();
    const viewport = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    // On stacked layouts, scrolling and matching highlights carry the link.
    if (from.right >= viewport.left || to.bottom < viewport.top || to.top > viewport.bottom) return;
    const x1 = from.right - box.left + 3;
    const y1 = from.top + from.height / 2 - box.top;
    const x2 = viewport.left - box.left + 4;
    const y2 = Math.max(viewport.top + 8, Math.min(viewport.bottom - 8, to.top + to.height / 2)) - box.top;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    path.setAttribute('d', `M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`);
  };
  panel.querySelectorAll('.exp-takeaway').forEach(button => {
    button.addEventListener('click', () => {
      selected?.setAttribute('aria-pressed', 'false');
      target?.classList.remove('exp-evidence-selected');
      selected = button;
      target = document.getElementById(button.dataset.evidence);
      selected.setAttribute('aria-pressed', 'true');
      target.classList.add('exp-evidence-selected');
      const frame = source.getBoundingClientRect();
      source.scrollTop += target.getBoundingClientRect().top - frame.top - source.clientHeight / 3;
      target.focus({preventScroll: true});
      // Keep the evidence visible when the two columns stack on a small screen.
      if (selected.getBoundingClientRect().right >= frame.left) {
        source.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      }
      draw();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        path.animate([{strokeDashoffset: 1}, {strokeDashoffset: 0}], {duration: 350, easing: 'ease-out'});
      }
    });
  });
  path.setAttribute('pathLength', '1');
  source.addEventListener('scroll', draw, {passive: true});
  new ResizeObserver(draw).observe(panel);
}

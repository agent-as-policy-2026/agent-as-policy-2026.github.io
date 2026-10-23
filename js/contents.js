const contents = document.querySelector('#page-contents');
if (contents) {
  const links = [...contents.querySelectorAll('a[href^="#"]')];
  const marks = [...contents.querySelectorAll('[data-section]')];
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));

  contents.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') contents.open = true;
  });
  contents.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' && !contents.matches(':focus-within')) contents.open = false;
  });
  contents.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      contents.open = false;
      contents.querySelector('summary').focus();
    }
  });
  links.forEach(link => link.addEventListener('click', () => { contents.open = false; }));

  function updateCurrent() {
    const threshold = Math.min(window.innerHeight * 0.3, 220);
    let current = 0;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= threshold) current = index;
    });
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      current = sections.length - 1;
    }
    links.forEach((link, index) => {
      if (index === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    marks.forEach(mark => mark.classList.toggle('is-current', mark.dataset.section === sections[current].id));
  }
  let scheduled = false;
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updateCurrent();
    });
  }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('load', scheduleUpdate);
  updateCurrent();
}

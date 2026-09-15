const showcase = document.getElementById('showcase');
const families = Array.from(showcase.querySelectorAll('.agp-showcase-nav [role="tab"]'));
const groups = Array.from(showcase.querySelectorAll('.agp-showcase-settings [role="tablist"]'));
const panel = showcase.querySelector('#showcase-player');
const film = showcase.querySelector('#showcase-video-panel');
const video = showcase.querySelector('.agp-showcase-video');
const inputs = Array.from(showcase.querySelectorAll('.agp-showcase-input'));
const demos = Array.from(showcase.querySelectorAll('.agp-input-demo video'));
const imageDialog = showcase.querySelector('.agp-input-dialog');
const heading = showcase.querySelector('h2');
const description = showcase.querySelector('.agp-showcase-description');
const wristLabel = showcase.querySelector('.agp-showcase-wrist-label');
const compact = window.matchMedia('(max-width: 840px)');
const navigation = showcase.querySelector('.agp-showcase-nav');

function updateOrientation() {
  navigation.setAttribute('aria-orientation', compact.matches ? 'horizontal' : 'vertical');
}
compact.addEventListener('change', updateOrientation);
updateOrientation();

function markSelected(tabs, selected) {
  tabs.forEach((tab) => {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

function selectSetting(tab) {
  inputs.forEach((input) => {
    const active = input.dataset.input === tab.dataset.input;
    if (!active) input.querySelectorAll('video').forEach((demo) => demo.pause());
    input.hidden = !active;
  });
  const siblings = Array.from(tab.parentElement.querySelectorAll('[role="tab"]'));
  markSelected(siblings, tab);
  film.setAttribute('aria-labelledby', tab.id);
  video.dataset.views = tab.dataset.views;
  [video.width, video.height] = tab.dataset.size.split('x').map(Number);
  wristLabel.textContent = tab.dataset.views === '3' ? 'Wrist cameras' : 'Wrist camera';
  video.setAttribute('aria-label', `${tab.textContent} with synchronized top and wrist camera views at 8 times real speed`);
  if (video.getAttribute('src') === tab.dataset.src) return;
  video.pause();
  video.poster = tab.dataset.poster;
  video.src = tab.dataset.src;
  video.load();
  document.dispatchEvent(new CustomEvent('agp:sourcechange', { detail: { video } }));
}

demos.forEach((demo) => {
  demo.addEventListener('loadedmetadata', () => {
    demo.currentTime = Number(demo.dataset.start);
  }, { once: true });
  demo.addEventListener('play', () => {
    document.dispatchEvent(new CustomEvent('agp:input-play', { detail: { video } }));
  });
});
video.addEventListener('play', () => demos.forEach((demo) => demo.pause()));
document.addEventListener('agp:pause-all', () => demos.forEach((demo) => demo.pause()));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) demos.forEach((demo) => demo.pause());
});

showcase.querySelectorAll('.agp-input-image').forEach((button) => {
  button.addEventListener('click', () => {
    const image = imageDialog.querySelector('img');
    image.src = button.dataset.full;
    image.alt = button.querySelector('img').alt;
    imageDialog.querySelector('p').textContent = button.dataset.caption;
    imageDialog.showModal();
  });
});
imageDialog.addEventListener('click', (event) => {
  if (event.target === imageDialog) imageDialog.close();
});

function selectFamily(tab) {
  markSelected(families, tab);
  panel.setAttribute('aria-labelledby', tab.id);
  showcase.style.setProperty('--task-color', tab.dataset.color);
  heading.textContent = tab.dataset.heading;
  description.textContent = tab.dataset.description;
  groups.forEach((group) => {
    const active = group.dataset.family === tab.dataset.family;
    const settings = Array.from(group.querySelectorAll('[role="tab"]'));
    group.hidden = !active || settings.length === 1;
    if (active) selectSetting(settings.find((setting) => setting.getAttribute('aria-selected') === 'true'));
  });
}

function wireTabs(tabs, select, vertical = false) {
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      const column = vertical && !compact.matches;
      if (event.key === (column ? 'ArrowDown' : 'ArrowRight')) next = (index + 1) % tabs.length;
      else if (event.key === (column ? 'ArrowUp' : 'ArrowLeft')) next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus();
      select(tabs[next]);
    });
  });
}

wireTabs(families, selectFamily, true);
groups.forEach((group) => wireTabs(Array.from(group.querySelectorAll('[role="tab"]')), selectSetting));
selectFamily(families[0]);

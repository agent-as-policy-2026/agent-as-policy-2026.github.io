/* tabs.js - one device, used at three scales: the contact strip of five task families,
   the clip chips inside each family, and the failure chips over one shared well.

   The contract, which build/build_site.py writes and this module only operates:

     [role="tablist"][data-tabs]   a group. Ships hidden, because without this script the
                                   buttons in it would do nothing; this module unhides it.
     [role="tab"][aria-controls]   a button naming its panel by id.
     [role="tabpanel"]             a panel. Ships VISIBLE, so a reader with no JavaScript
                                   sees every clip of every family rather than one of
                                   fourteen; this module hides the ones not selected.

   Selecting a tab shows or hides whole <figure> elements. Nothing is shared between them
   and nothing is rewritten, so a clip's trial number, speed and real elapsed time can
   never belong to a different clip than the picture above them.

   Deep links: the panel id is the fragment. #tasks-blocks selects the block family;
   #clip-panel-dice_flip selects the die family and then that clip inside it, because
   selection walks outward from whatever the fragment names. A change replaces the
   fragment with history.replaceState, so the back button still leaves the page.

   Emits agp:tabchange on document after every change, with {list, tab, panel}. js/autoplay.js
   listens: a video that was inside a hidden panel has no layout and no honest
   intersection ratio until the panel is shown. */

const LISTS = Array.from(document.querySelectorAll('[role="tablist"][data-tabs]'));

function tabsOf(list) {
  return Array.from(list.querySelectorAll('[role="tab"]'))
    .filter((t) => t.closest('[role="tablist"]') === list);
}

function panelOf(tab) {
  const id = tab.getAttribute('aria-controls');
  return id ? document.getElementById(id) : null;
}

function apply(list, tab, opts) {
  const options = opts || {};
  const tabs = tabsOf(list);
  if (tabs.indexOf(tab) < 0) return false;
  let changed = false;
  tabs.forEach((t) => {
    const on = t === tab;
    if (t.getAttribute('aria-selected') !== String(on)) changed = true;
    t.setAttribute('aria-selected', String(on));
    /* roving tabindex: one stop for the whole group, arrows move inside it */
    t.tabIndex = on ? 0 : -1;
    const panel = panelOf(t);
    if (panel && panel.hidden === on) {
      panel.hidden = !on;
      changed = true;
    }
  });
  if (options.focus) tab.focus();
  return changed;
}

function select(list, tab, opts) {
  const options = opts || {};
  const changed = apply(list, tab, options);
  const panel = panelOf(tab);
  if (options.hash && panel && panel.id) {
    try {
      history.replaceState(null, '', '#' + panel.id);
    } catch (err) {
      /* file:// and some sandboxes refuse a history entry; the tab still works */
    }
  }
  if (changed || options.announce) {
    document.dispatchEvent(new CustomEvent('agp:tabchange', {
      detail: { list: list, tab: tab, panel: panel },
    }));
  }
  return changed;
}

/* Which tab a fragment asks for: the one whose panel is, or contains, the named element.
   Runs outermost list first, so #clip-panel-dice_flip opens the die family on the way. */
function wanted(list, target) {
  if (!target) return null;
  return tabsOf(list).find((t) => {
    const panel = panelOf(t);
    return panel && (panel === target || panel.contains(target));
  }) || null;
}

function currentTab(list) {
  const tabs = tabsOf(list);
  return tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0] || null;
}

function resolve(target, opts) {
  LISTS.forEach((list) => {
    const tab = wanted(list, target) || currentTab(list);
    if (tab) select(list, tab, opts);
  });
}

function fromHash() {
  const raw = (window.location.hash || '').slice(1);
  if (!raw) return null;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch (err) {
    /* a malformed escape is just not an id */
  }
  return document.getElementById(id);
}

/* ---------------------------------------------------------------- wiring */

LISTS.forEach((list) => {
  if (!tabsOf(list).length) return;
  list.hidden = false;
});

/* Initial state: the fragment if it names something inside a panel, otherwise whatever
   the build marked selected. No hash is written and no event is announced for this. */
resolve(fromHash(), {});

document.addEventListener('click', (ev) => {
  const tab = ev.target.closest && ev.target.closest('[role="tab"]');
  if (!tab) return;
  const list = tab.closest('[role="tablist"][data-tabs]');
  if (!list) return;
  ev.preventDefault();
  select(list, tab, { hash: true });
});

const MOVES = {
  ArrowRight: 1, ArrowDown: 1, Right: 1, Down: 1,
  ArrowLeft: -1, ArrowUp: -1, Left: -1, Up: -1,
};

document.addEventListener('keydown', (ev) => {
  const tab = ev.target.closest && ev.target.closest('[role="tab"]');
  if (!tab) return;
  const list = tab.closest('[role="tablist"][data-tabs]');
  if (!list) return;
  const tabs = tabsOf(list);
  const here = tabs.indexOf(tab);
  if (here < 0) return;
  let next = null;
  if (ev.key in MOVES) {
    next = tabs[(here + MOVES[ev.key] + tabs.length) % tabs.length];
  } else if (ev.key === 'Home') {
    next = tabs[0];
  } else if (ev.key === 'End') {
    next = tabs[tabs.length - 1];
  }
  if (!next) return;
  ev.preventDefault();
  select(list, next, { focus: true, hash: true });
});

/* Someone pasted a link, or followed one from another page on this site. */
window.addEventListener('hashchange', () => {
  const target = fromHash();
  if (target) resolve(target, { announce: true });
});

/* trials.js - the 87-slot trial browser on trials.html: filters, pagination, a record
   drawer, hash routing and keyboard navigation.

   Without this file every one of the 87 cards is on the page, every card links to itself,
   the pager is hidden and the same 87 rows are in the table under the grid. That is the
   fallback, and it is why the pager ships hidden rather than ships disabled.

   Pagination is 30 cards a page over whatever the current filter matches. The hash
   carries both, as #trials=<filter> and #trials=<filter>&p=<n>, so a page of a filtered
   list is a link someone can send. A #t-<slot> link from a trial mark on another page
   still resolves: the card is found first, the browser pages to it, and then its record
   opens. */

const PAGE_SIZE = 30;

const section = document.getElementById('trial-browser');
if (section) {
  const cards = Array.from(section.querySelectorAll('.agp-trial'));
  const groups = Array.from(section.querySelectorAll('.agp-trialgroup'));
  const buttons = Array.from(section.querySelectorAll('.agp-filter'));
  const status = section.querySelector('.agp-filter-status');
  const pager = section.querySelector('.agp-pager');
  const pagerPrev = section.querySelector('.agp-pager-prev');
  const pagerNext = section.querySelector('.agp-pager-next');
  const pagerStatus = section.querySelector('.agp-pager-status');
  const drawer = document.getElementById('agp-trial-drawer');
  const bySlot = new Map(cards.map((c) => [c.dataset.slot, c]));
  let current = 'all';
  let page = 0;
  let opener = null;

  const matches = {
    all: () => true,
    success: (c) => c.dataset.outcome === 'success',
    failure: (c) => c.dataset.outcome === 'failure',
    disagree: (c) => c.dataset.disagree === 'yes',
    unclassified: (c) => c.dataset.label === 'unclear',
  };

  /* Everything the current filter matches, in page order: the list the drawer steps
     through and the list the pager cuts into pages. */
  const matching = (filter) => cards.filter((c) => matches[filter || current](c));
  const visible = () => cards.filter((c) => !c.hidden);

  function pageCount(shown) {
    return Math.max(1, Math.ceil(shown / PAGE_SIZE));
  }

  function describe(filter, shown) {
    if (filter === 'all') return `Showing all ${shown} counted trial slots.`;
    const label = buttons.find((b) => b.dataset.filter === filter);
    const name = label ? label.firstChild.textContent.trim().toLowerCase() : filter;
    return shown === 0
      ? `No trial matches ${name}.`
      : `Showing ${shown} of ${cards.length} slots: ${name}.`;
  }

  function hashFor() {
    const base = current === 'all' ? '#trial-browser' : `#trials=${current}`;
    if (page === 0) return base;
    return `${current === 'all' ? '#trials=all' : `#trials=${current}`}&p=${page + 1}`;
  }

  function apply(filter, { announce = true, updateHash = false, toPage = null } = {}) {
    if (!matches[filter]) filter = 'all';
    current = filter;
    const list = matching(filter);
    const pages = pageCount(list.length);
    page = Math.min(Math.max(toPage === null ? page : toPage, 0), pages - 1);
    const first = page * PAGE_SIZE;
    const onPage = new Set(list.slice(first, first + PAGE_SIZE));
    cards.forEach((card) => { card.hidden = !onPage.has(card); });
    groups.forEach((group) => {
      group.hidden = !group.querySelector('.agp-trial:not([hidden])');
    });
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    if (status && announce) status.textContent = describe(filter, list.length);
    if (pager) {
      pager.hidden = list.length <= PAGE_SIZE;
      if (pagerPrev) pagerPrev.disabled = page === 0;
      if (pagerNext) pagerNext.disabled = page >= pages - 1;
      if (pagerStatus) {
        const pattern = pagerStatus.dataset.pattern || '';
        pagerStatus.textContent = pattern
          .replace('{page}', String(page + 1))
          .replace('{pages}', String(pages))
          .replace('{first}', String(list.length ? first + 1 : 0))
          .replace('{last}', String(Math.min(first + PAGE_SIZE, list.length)))
          .replace('{total}', String(list.length));
      }
    }
    if (updateHash && (!drawer || !drawer.open)) {
      history.replaceState(null, '', hashFor());
    }
  }

  /* Bring one slot onto the visible page, whatever filter is running. A mark on another
     page links straight at a trial, and that link has to land even when the trial is on
     page three of a filtered list. */
  function pageTo(slot) {
    const card = bySlot.get(slot);
    if (!card) return false;
    let list = matching(current);
    if (list.indexOf(card) < 0) {
      /* the running filter excludes it: the link wins, the filter gives way */
      apply('all', { announce: false });
      list = matching('all');
    }
    const want = Math.floor(list.indexOf(card) / PAGE_SIZE);
    if (want !== page) apply(current, { announce: false, toPage: want });
    return true;
  }

  function specRows(card) {
    const d = card.dataset;
    const recorded = d.time !== '';
    const rows = [
      ['Configuration', d.config],
      ['Trial', d.trial],
      ['Audited outcome', d.outcome],
      ['Agent report', d.label],
      ['Model', d.model],
      ['Thinking effort', d.effort],
      ['Harness', d.harness],
      ['Arm', d.arm],
      ['Time', recorded ? `${d.time} min` : 'not recorded'],
      ['Tokens', recorded ? `${d.tokens} k` : 'not recorded'],
      ['Cost', recorded ? `USD ${d.cost}` : 'not recorded'],
      ['Session', d.stamp],
      ['Slot id', d.slot],
    ];
    return rows.map(([k, v]) => {
      const fail = (k === 'Audited outcome' && v === 'failure') ? ' class="agp-spec-fail"' : '';
      return `<div class="agp-spec-row"><dt>${k}</dt><dd${fail}>${v}</dd></div>`;
    }).join('');
  }

  function open(slot, { focusBack = null, restore = null } = {}) {
    const card = bySlot.get(slot);
    if (!card || !drawer) return;
    pageTo(slot);
    opener = focusBack || card.querySelector('.agp-trial-open');
    const d = card.dataset;
    drawer.innerHTML =
      '<div class="agp-drawer-inner">' +
      '<div class="agp-drawer-head">' +
      `<h3 class="agp-drawer-title">${d.config}, trial ${d.trial}</h3>` +
      '<button type="button" class="agp-drawer-close">Close</button></div>' +
      `<img src="${d.full}" width="${d.fullW}" height="${d.fullH}" alt="${d.alt}">` +
      `<dl class="agp-spec">${specRows(card)}</dl>` +
      '<div class="agp-drawer-nav">' +
      '<button type="button" data-step="-1">Previous trial</button>' +
      '<button type="button" data-step="1">Next trial</button>' +
      '<a class="agp-drawer-csv" href="data/trials.csv" download>This row in the CSV</a>' +
      '</div></div>';
    drawer.querySelector('.agp-drawer-close').addEventListener('click', () => drawer.close());
    drawer.querySelectorAll('[data-step]').forEach((b) => {
      b.addEventListener('click', () => step(Number(b.dataset.step)));
    });
    if (!drawer.open) drawer.showModal();
    history.replaceState(null, '', `#t-${slot}`);
    drawer.dataset.slot = slot;
    /* The re-render above destroyed whatever had focus, which for Previous and Next is
       the button the reader just pressed. Put focus back on the same control, so the
       ring stays visible and a screen reader keeps its place. */
    if (restore) {
      const again = drawer.querySelector(`[data-step="${restore}"]`);
      if (again) again.focus();
    }
  }

  /* Stepping runs over everything the filter matches, not only the current page, so the
     drawer walks off the end of a page into the next one instead of stopping there. */
  function step(delta) {
    const list = matching(current);
    const index = list.findIndex((c) => c.dataset.slot === drawer.dataset.slot);
    const next = list[(index + delta + list.length) % list.length];
    if (next) open(next.dataset.slot, { focusBack: opener, restore: String(delta) });
  }

  buttons.forEach((b) => b.addEventListener('click',
    () => apply(b.dataset.filter, { updateHash: true, toPage: 0 })));
  if (pagerPrev) pagerPrev.addEventListener('click',
    () => apply(current, { updateHash: true, toPage: page - 1 }));
  if (pagerNext) pagerNext.addEventListener('click',
    () => apply(current, { updateHash: true, toPage: page + 1 }));
  section.querySelectorAll('.agp-js-only').forEach((el) => { el.hidden = false; });

  cards.forEach((card) => {
    card.querySelector('.agp-trial-open').addEventListener('click', (event) => {
      event.preventDefault();
      open(card.dataset.slot);
    });
  });

  if (drawer) {
    drawer.addEventListener('close', () => {
      history.replaceState(null, '', hashFor());
      if (opener) opener.focus();
    });
    drawer.addEventListener('click', (event) => {
      if (event.target === drawer) drawer.close();      // click outside the card
    });
    document.addEventListener('keydown', (event) => {
      if (!drawer.open || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    });
  }

  function fromHash() {
    const hash = location.hash;
    const filter = hash.match(/^#trials=(\w+)(?:&p=(\d+))?$/);
    const slot = hash.match(/^#t-(.+)$/);
    if (filter) {
      apply(filter[1], { toPage: filter[2] ? Number(filter[2]) - 1 : 0 });
    } else if (slot && bySlot.has(slot[1])) {
      open(slot[1]);
    }
  }

  document.addEventListener('agp:open-trial', (event) => open(event.detail));
  window.addEventListener('hashchange', fromHash);
  document.documentElement.dataset.trialsReady = '1';
  apply('all', { announce: false });
  fromHash();
}

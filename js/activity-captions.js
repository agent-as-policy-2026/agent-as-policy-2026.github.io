/** Stable activity lanes keep simultaneous captions in place. Text changes
 * update the live caption; only the end of an activity starts a departure. */
export class ActivityCaptions {
  constructor(container) {
    this.container = container;
    this.active = new Map();
    this.ended = new Map();
    this.lanes = Array.from({length: 3}, () => {
      const lane = document.createElement('div');
      lane.className = 'ev-activity-lane';
      container.append(lane);
      return lane;
    });
  }
  reset() {
    for (const entry of this.active.values()) clearTimeout(entry.endTimer);
    for (const timer of this.ended.values()) clearTimeout(timer);
    this.ended.clear(); this.active.clear();
    this.lanes.forEach(lane => lane.replaceChildren());
  }
  update(rows) {
    const wanted = new Set(rows.map(row => row[0]));
    const laneIndex = kind => kind === 'tool' ? 1 : kind === 'motion' ? 2 : 0;
    for (const [kind, entry] of this.active) {
      if (wanted.has(kind)) {
        clearTimeout(entry.endTimer); entry.endTimer = null;
        continue;
      }
      const finish = () => {
        this.active.delete(kind);
        entry.node.classList.add('ev-activity-ended');
        entry.status.hidden = false;
        this.ended.set(entry.node, setTimeout(() => {
          entry.node.remove(); this.ended.delete(entry.node);
        }, 2200));
      };
      if (rows.some(row => laneIndex(row[0]) === laneIndex(kind))) {
        clearTimeout(entry.endTimer);
        finish();
      } else if (!entry.endTimer) {
        // Short gaps between recorded activities should not flash an end state.
        entry.endTimer = setTimeout(finish, 400);
      }
    }
    for (const [kind, title, detail] of rows) {
      let entry = this.active.get(kind);
      if (!entry) {
        const lane = this.lanes[kind === 'tool' ? 1 : kind === 'motion' ? 2 : 0];
        const previous = lane.querySelector('.ev-activity--' + kind);
        if (previous) {
          clearTimeout(this.ended.get(previous)); this.ended.delete(previous);
          previous.classList.remove('ev-activity-ended');
          const status = previous.querySelector('small'); status.hidden = true;
          entry = {node: previous, status, heading: previous.querySelector('strong'), body: previous.querySelector('span')};
          this.active.set(kind, entry);
        }
        if (!entry) {
          // A different activity replaces its fading predecessor in this lane.
          for (const node of lane.children) {
            clearTimeout(this.ended.get(node)); this.ended.delete(node);
          }
          lane.replaceChildren();
          const node = document.createElement('div');
          node.className = 'ev-activity-line ev-activity--' + kind;
          const status = document.createElement('small'); status.textContent = 'Ended'; status.hidden = true;
          const heading = document.createElement('strong');
          const body = document.createElement('span');
          node.append(heading, body, status); lane.append(node);
          entry = {node, status, heading, body}; this.active.set(kind, entry);
        }
      }
      entry.heading.textContent = title;
      if (entry.body.textContent !== detail) entry.body.textContent = detail;
    }
  }
}

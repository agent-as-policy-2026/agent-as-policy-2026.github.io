const titles = {model: 'Model generating', tool: 'Tool use', motion: 'Robot motion', say: 'Agent update', look: 'Viewing images', stage: 'Task stage'};
const cache = new WeakMap();

/** Resolve shared-lane priority before checking actual on-screen reading time. */
export function presentationTimeline(presentation, effectiveRate) {
  let rates = cache.get(presentation);
  if (!rates) { rates = new Map(); cache.set(presentation, rates); }
  if (rates.has(effectiveRate)) return rates.get(effectiveRate);
  const minimum = presentation.minimum_screen_seconds * effectiveRate;
  const readable = presentation.cues.filter(c => c.end - c.start >= minimum);
  const priority = {say: 2, look: 1, model: 0};
  const timeline = [];
  for (const cue of readable) {
    let spans = [[cue.start, cue.end]];
    for (const other of readable) {
      if (!(priority[other.kind] > priority[cue.kind])) continue;
      spans = spans.flatMap(([start, end]) => {
        if (other.end <= start || other.start >= end) return [[start, end]];
        return [[start, Math.min(end, other.start)], [Math.max(start, other.end), end]];
      });
    }
    for (const [start, end] of spans) {
      if (end - start >= minimum) timeline.push({...cue, start, end});
    }
  }
  // When speed filtering leaves a readable gap, show recorded chapter context.
  // This is explicitly a task stage, not a claim that a specific action is active.
  for (const stage of presentation.stages || []) {
    let gaps = [[stage.start, stage.end]];
    for (const cue of timeline) {
      gaps = gaps.flatMap(([start, end]) => {
        if (cue.end <= start || cue.start >= end) return [[start, end]];
        return [[start, Math.min(end, cue.start)], [Math.max(start, cue.end), end]];
      });
    }
    for (const [start, end] of gaps) {
      if (end - start >= minimum) timeline.push({...stage, kind: 'stage', start, end});
    }
  }
  timeline.sort((a, b) => a.start - b.start);
  rates.set(effectiveRate, timeline);
  return timeline;
}

export function presentationRows(presentation, run, effectiveRate) {
  return presentationTimeline(presentation, effectiveRate)
    .filter(cue => run >= cue.start && run < cue.end)
    .map(cue => [cue.kind, titles[cue.kind], cue.text]);
}

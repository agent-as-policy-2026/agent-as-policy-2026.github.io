#!/usr/bin/env python3
"""
AGP project page - verification gate.

Parses the \\meanrange rows of the paper's parts/4_experiments.tex BY ROW LABEL, recomputes
every cell from the pinned CSVs at full precision, and fails on any mismatch. It also checks
the derived claims the page repeats in prose, the counts in site/data/trials.csv, and the
sanitisation of everything under site/data/.

Coverage, stated honestly:
  * resource cells (time, tokens, cost) are machine-verified against the paper's own CSVs;
  * Table 1 Success cells are checked against the audited success column of the pinned CSV;
  * four Success denominators cannot be derived from any data file: GPT-5.6 Terra, GPT-5.6
    Luna and Claude Fable 5.1 in Table 2, and the five GPT-6 Astra runs that built the
    experience store in the transfer study. They are author attestations, recorded with
    their evidence in build/denominators.json, and reported here as ATTESTED, not verified.

Usage
    python3 build/verify_tables.py                 # verify; non-zero exit on any failure
    python3 build/verify_tables.py --require-signoff   # also fail while an attestation is unsigned
    python3 build/verify_tables.py --tex PATH      # verify against a different LaTeX source
"""
import argparse, csv, json, os, re, statistics, sys
from decimal import Decimal, ROUND_HALF_UP

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW  = os.path.join(HERE, 'data', 'raw')
DER  = os.path.join(HERE, 'data', 'derived')
SITE = os.path.join(ROOT, 'site', 'data')

FAILS, WARNS, OKS = [], [], []
def ok(m):   OKS.append(m)
def warn(m): WARNS.append(m); print('  WARN  ' + m)
def fail(m): FAILS.append(m); print('  FAIL  ' + m)

def rows(p):  return list(csv.DictReader(open(p)))
def rnd(x, nd):
    q = Decimal(1).scaleb(-nd) if nd else Decimal(1)
    return str(Decimal(repr(float(x))).quantize(q, rounding=ROUND_HALF_UP))
def stats(vals, nd): return (rnd(statistics.mean(vals), nd), rnd(min(vals), nd), rnd(max(vals), nd))

# ----------------------------------------------------------------- LaTeX parsing
def brace_args(s, i, n):
    """Read n brace-delimited arguments starting at s[i] == '{'. Returns (args, end index)."""
    out = []
    for _ in range(n):
        while i < len(s) and s[i].isspace(): i += 1
        if i >= len(s) or s[i] != '{': raise ValueError('expected { at %d' % i)
        depth, j = 0, i
        while j < len(s):
            if s[j] == '{': depth += 1
            elif s[j] == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        out.append(s[i + 1:j]); i = j + 1
    return out, i

def clean_num(x):
    x = re.sub(r'\$\^\{\\dagger\}\$|\$\^\\dagger\$|\\textbf|\\,|~', '', x)
    return x.replace('{', '').replace('}', '').strip()

def clean_label(x):
    x = re.sub(r'%.*$', '', x)
    x = re.sub(r'\\(quad|qquad|textit|textbf|emph|multicolumn)\b', ' ', x)
    x = re.sub(r'\{[0-9]+\}|\{@\{\}l\}', ' ', x)
    return re.sub(r'[{}\\]', ' ', x).replace('&', ' ').strip()

def parse_tables(tex_path):
    src = open(tex_path).read()
    tables = {}
    for m in re.finditer(r'\\begin\{table\}(.*?)\\end\{table\}', src, re.S):
        body = m.group(1)
        lab = re.search(r'\\label\{(tab:[^}]+)\}', body)
        if not lab: continue
        parsed = []
        for line in body.split('\n'):
            if '\\newcommand' in line:      continue     # the \meanrange DEFINITION, not a row
            if '\\multicolumn' in line:     continue     # sub-heading rows ("Codex", "Claude Code")
            stripped = line.strip()
            if stripped.startswith('%'):    continue
            if '&' not in stripped or not stripped.rstrip().endswith('\\\\'): continue
            row = stripped.rstrip()[:-2]
            cells = row.split('&')
            label = clean_label(cells[0])
            if not label: continue
            mr, i = [], 0
            while True:
                k = row.find('\\meanrange', i)
                if k < 0: break
                args, i = brace_args(row, k + len('\\meanrange'), 3)
                mr.append(tuple(clean_num(a) for a in args))
            dashes = sum(1 for c in cells[1:] if c.strip() == '--')
            success = next((c.strip() for c in cells[1:] if re.fullmatch(r'\d+/\d+', c.strip())), None)
            parsed.append(dict(label=label, meanrange=mr, dashes=dashes, success=success, raw=stripped))
        tables[lab.group(1)] = parsed
    return tables

# ----------------------------------------------------------------- expected row sets
T1_ROWS = [('Four pair assembly', 'four_pair_assembly'), ('Pyramid', 'pyramid'),
           ('Two towers', 'two_towers'), ('Six block tower', 'six_block_tower'),
           ('Die flipping', 'die_flipping'), ('Potato', 'targeted_throwing_potato'),
           ('Sequential', 'towel_sequential'), ('Simultaneous', 'towel_simultaneous')]
T2_ROWS = [('Low effort', 'gpt6_astra_low'), ('Medium effort', 'gpt6_astra_medium'),
           ('High effort', 'gpt6_astra_high'), ('GPT-5.6 Sol', 'gpt56_sol'),
           ('GPT-5.6 Terra', 'gpt56_terra'), ('GPT-5.6 Luna', 'gpt56_luna'),
           ('Claude Opus 5', 'claude_opus5'), ('Claude Fable 5.1', 'claude_fable51')]
DASH_ROW = 'gpt56_luna'          # the only row the paper prints as -- : no successful trial

# ----------------------------------------------------------------- recomputation from pinned CSVs
def load_expected():
    """slug -> dict(n_success, n_trials, time=(mean,lo,hi), tokens=..., cost=..., source=str)"""
    exp = {}
    t1 = rows(os.path.join(RAW, 'main_task_timing_table1_metrics.csv'))
    key = {'Four pair assembly': 'four_pair_assembly', 'Pyramid': 'pyramid', 'Two towers': 'two_towers',
           'Six block tower': 'six_block_tower', 'Die flipping': 'die_flipping',
           'Potato': 'targeted_throwing_potato', 'Sequential': 'towel_sequential',
           'Simultaneous': 'towel_simultaneous'}
    for task, slug in key.items():
        g  = [r for r in t1 if r['task'] == task]
        ok_ = [r for r in g if r['success'] == '1']
        exp[slug] = dict(n_success=len(ok_), n_trials=len(g),
            time=stats([float(r['time_min']) for r in ok_], 1),
            tokens=stats([float(r['tokens_k']) for r in ok_], 0),
            cost=stats([float(r['cost_usd']) for r in ok_], 2),
            source='main_task_timing_table1_metrics.csv')
    t2 = rows(os.path.join(RAW, 'paper_runs_table2_metrics.csv'))
    for model, slug in [('GPT-6 Astra low', 'gpt6_astra_low'), ('GPT-6 Astra medium', 'gpt6_astra_medium'),
                        ('GPT-6 Astra high', 'gpt6_astra_high'), ('GPT-5.6 Terra', 'gpt56_terra'),
                        ('Claude Opus 5', 'claude_opus5')]:
        g  = [r for r in t2 if r['model'] == model]
        ok_ = [r for r in g if r['success'] == '1']
        exp[slug] = dict(n_success=len(ok_), n_trials=len(g),
            time=stats([float(r['time_min']) for r in ok_], 1),
            tokens=stats([float(r['tokens_k']) for r in ok_], 0),
            cost=stats([float(r['cost_usd']) for r in ok_], 2),
            source='paper_runs_table2_metrics.csv')
    sol = rows(os.path.join(RAW, 'two_pair_assembly_per_run.csv'))
    ok_ = [r for r in sol if r['success'] == '1']
    exp['gpt56_sol'] = dict(n_success=len(ok_), n_trials=len(sol),
        time=stats([float(r['time_min']) for r in ok_], 1),
        tokens=stats([float(r['tokens_k']) for r in ok_], 0),
        cost=stats([float(r['cost_usd']) for r in ok_], 2),
        source='two_pair_assembly_per_run.csv')
    fa = rows(os.path.join(RAW, 'fable_table2_per_run.csv'))
    ok_ = [r for r in fa if r['success'] == '1']
    exp['claude_fable51'] = dict(n_success=None, n_trials=None,   # denominator is an attestation
        time=stats([float(r['time_min']) for r in ok_], 1),
        tokens=stats([float(r['tokens_k']) for r in ok_], 0),
        cost=stats([float(r['cost_usd']) for r in ok_], 2),
        source='fable_table2_per_run.csv')
    exp['gpt56_luna'] = dict(n_success=None, n_trials=None, time=None, tokens=None, cost=None,
                             source='no data file: no successful trial')
    return exp

# ----------------------------------------------------------------- checks
def check_table(name, parsed, wanted, exp, att):
    print(f'\n[{name}]')
    found = {}
    for row in parsed:
        for label, slug in wanted:
            if row['label'] == label or row['label'].startswith(label):
                found.setdefault(slug, row)
    missing = [l for l, s in wanted if s not in found]
    extra   = [r['label'] for r in parsed
               if r['meanrange'] and not any(r['label'].startswith(l) for l, _ in wanted)]
    if missing: fail(f'{name}: expected rows not found by label: {missing}')
    if extra:   fail(f'{name}: unexpected \\meanrange rows: {extra}')
    if not missing and not extra:
        ok(f'{name}: row set is exactly the {len(wanted)} expected rows')
        print(f'  ok    row set: {len(wanted)} rows, by label')
    for label, slug in wanted:
        row = found.get(slug)
        if row is None: continue
        e = exp[slug]
        if slug == DASH_ROW:
            if row['meanrange'] or row['dashes'] != 3:
                fail(f'{name}/{label}: expected three "--" resource cells, got '
                     f'{len(row["meanrange"])} \\meanrange and {row["dashes"]} dashes')
            else:
                ok(f'{name}/{label}: three "--" cells as expected (no successful trial)')
                print(f'  ok    {label:18s} --  --  --   (no successful trial)')
            _check_success(name, label, slug, row, e, att)
            continue
        if len(row['meanrange']) != 3:
            fail(f'{name}/{label}: expected 3 \\meanrange cells, found {len(row["meanrange"])}')
            continue
        good = True
        for cell, metric in zip(row['meanrange'], ('time', 'tokens', 'cost')):
            want = e[metric]
            if tuple(cell) != tuple(want):
                fail(f'{name}/{label}/{metric}: LaTeX {cell} != recomputed {want}  '
                     f'(from {e["source"]})')
                good = False
        if good:
            print(f'  ok    {label:18s} '
                  f'{row["meanrange"][0][0]:>7} [{row["meanrange"][0][1]}, {row["meanrange"][0][2]}]   '
                  f'{row["meanrange"][1][0]:>6}k   USD {row["meanrange"][2][0]}')
            ok(f'{name}/{label}: 9 resource values match {e["source"]}')
        _check_success(name, label, slug, row, e, att)

def _check_success(name, label, slug, row, e, att):
    """Success cells. Rows listed in build/denominators.json are ATTESTED: the count is a human
    review the authors stand behind, not a measurement any file can prove. Where a pinned file
    also carries the same count we say so, but the attestation remains the primary evidence."""
    if row['success'] is None:
        fail(f'{name}/{label}: no n/N Success cell found'); return
    a = att.get(slug)
    if a is not None:
        if a['printed'] != row['success']:
            fail(f'{name}/{label}: Success cell {row["success"]} != attested {a["printed"]} '
                 f'in build/denominators.json')
            return
        extra = ''
        if e['n_success'] is not None:
            got = f'{e["n_success"]}/{e["n_trials"]}'
            if got == row['success']:
                extra = f'; the transcribed review in {e["source"]} agrees'
            else:
                fail(f'{name}/{label}: attested {a["printed"]} but {e["source"]} transcribes {got}')
                return
        print(f'        {label:18s} Success {row["success"]}  ATTESTED (author sign-off, not machine-verified){extra}')
        ok(f'{name}/{label}: Success {row["success"]} attested')
        return
    if e['n_success'] is None:
        fail(f'{name}/{label}: Success {row["success"]} has neither a data file nor an entry in '
             f'build/denominators.json'); return
    want = f'{e["n_success"]}/{e["n_trials"]}'
    if row['success'] != want:
        fail(f'{name}/{label}: Success cell {row["success"]} != recomputed {want} (from {e["source"]})')
    else:
        ok(f'{name}/{label}: Success {row["success"]} matches {e["source"]}')

def check_site_tables(exp):
    """The published tables must carry exactly what was just verified."""
    print('\n[site/data vs pinned CSVs]')
    for fn, slugcol in (('table1_rendered.csv', 'config_slug'), ('table2_rendered.csv', 'config_slug')):
        p = os.path.join(SITE, fn)
        if not os.path.exists(p): fail(f'{fn} missing'); continue
        bad = 0
        for r in rows(p):
            e = exp[r[slugcol]]
            if e['time'] is None:
                if (r['time_disp'], r['tokens_disp'], r['cost_disp']) != ('--', '--', '--'):
                    fail(f'{fn}/{r[slugcol]}: expected -- resource cells'); bad += 1
                continue
            for metric, col in (('time', 'time_disp'), ('tokens', 'tokens_disp'), ('cost', 'cost_disp')):
                want = f'{e[metric][0]} [{e[metric][1]}, {e[metric][2]}]'
                if r[col] != want:
                    fail(f'{fn}/{r[slugcol]}/{metric}: published "{r[col]}" != recomputed "{want}"'); bad += 1
        if not bad:
            print(f'  ok    {fn} reproduces every recomputed cell'); ok(f'{fn} matches')

def check_transfer():
    """The experience-transfer study is new data; the paper's Fig. 3 shows the older run."""
    print('\n[experience transfer, collected 2026-09-11]')
    FROZEN = {'terra_with_experience': ('4/5', '12.5 [10.1, 16.9]', '5563 [4814, 5865]', '1.64 [1.56, 1.74]'),
              'astra_experience_store': ('5/5', '7.6 [6.5, 9.1]', '2495 [2240, 2827]', '3.79 [3.45, 4.39]'),
              'terra_empty_experience': ('1/5', '19.0 [19.0, 19.0]', '6282 [6282, 6282]', '1.98 [1.98, 1.98]')}
    p = os.path.join(SITE, 'transfer_summary.csv')
    if not os.path.exists(p): fail('site/data/transfer_summary.csv missing'); return
    for r in rows(p):
        want = FROZEN.get(r['config_slug'])
        if want is None: fail(f'transfer_summary.csv: unexpected arm {r["config_slug"]}'); continue
        got = (r['success_disp'], r['time_disp'], r['tokens_disp'], r['cost_disp'])
        if got != want:
            fail(f'transfer_summary.csv/{r["config_slug"]}: {got} != expected {want}')
        else:
            print(f'  ok    {r["config_slug"]:24s} {want[0]}  {want[1]} min  {want[2]}k  USD {want[3]}')
            ok(f'transfer/{r["config_slug"]} matches the frozen values')
    x = rows(os.path.join(DER, 'transfer_per_run.csv'))
    if sum(1 for r in x if r['counted'] == 'yes') != 10:
        fail('derived/transfer_per_run.csv: expected exactly 10 counted runs')
    if sum(1 for r in x if r['counted'] == 'no') != 2:
        fail('derived/transfer_per_run.csv: expected the 2 discarded infrastructure runs to be present and excluded')
    else:
        print('  ok    the two discarded infrastructure runs are recorded and not counted')

def check_clearances():
    """The four part clearances: derived from the pinned dimensions, compared with the copy."""
    print('\n[four pair assembly clearances]')
    path = os.path.join(HERE, 'data', 'part_clearances.csv')
    rows = list(csv.DictReader(open(path, encoding='utf-8', newline='')))
    copy = json.load(open(os.path.join(HERE, 'copy.json'), encoding='utf-8'))
    table = copy['sections']['task-four-pair-assembly']['clearance_table']['rows']
    if len(rows) != len(table):
        fail('clearance table: %d rows in the CSV, %d in the copy deck' % (len(rows), len(table)))
        return
    for src, shown in zip(rows, table):
        hole, shaft = Decimal(src['hole_mm']), Decimal(src['shaft_mm'])
        want = ((hole - shaft) / 2).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        got = [shown[0], shown[1], shown[2], shown[3]]
        expect = [src['pair'], '%.2f' % hole, '%.2f' % shaft, str(want)]
        if got != expect:
            fail('clearance row %s: page says %s, the CSV gives %s' % (src['pair'], got, expect))
        else:
            print('  ok    %s: (%s - %s) / 2 = %s mm' % (src['pair'], hole, shaft, want))
            ok('clearance ' + src['pair'])
    intro = copy['sections']['task-four-pair-assembly']['intro']
    tightest = min(((Decimal(r['hole_mm']) - Decimal(r['shaft_mm'])) / 2).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP) for r in rows)
    if ('clearance of %s mm' % tightest) not in intro:
        fail('the section intro does not state the tightest clearance as %s mm' % tightest)
    else:
        ok('tightest clearance stated in the intro')


def check_derived_claims(exp):
    """Numbers the page states in prose, derived from the same tables."""
    print('\n[derived claims used in the page copy]')
    t1 = [exp[s] for _, s in T1_ROWS]
    tmean = sorted(float(e['time'][0]) for e in t1)
    cmean = sorted(float(e['cost'][0]) for e in t1)
    claims = [
        ('time range over configurations, minutes', f'{tmean[0]:.1f} to {tmean[-1]:.1f}', '21.4 to 54.3'),
        ('cost range over configurations, USD',     f'{cmean[0]:.2f} to {cmean[-1]:.2f}', '7.46 to 27.41'),
        ('configurations at 80% or better',         str(sum(1 for e in t1 if e['n_success'] / e['n_trials'] >= 0.8)), '7'),
        ('configurations at 100%',                  str(sum(1 for e in t1 if e['n_success'] == e['n_trials'])), '5'),
        ('Table 1 trials',                          str(sum(e['n_trials'] for e in t1)), '37'),
        ('Table 1 successful trials (derived; the paper never states it)',
                                                    str(sum(e['n_success'] for e in t1)), '33'),
    ]
    for what, got, want in claims:
        if got != want: fail(f'{what}: computed {got}, page copy says {want}')
        else:           print(f'  ok    {what}: {got}'); ok(what)
    # the same claims as they stand in the paper's own prose
    intro = open(os.path.join(RAW, 'parts_1_introduction.tex')).read()
    want_intro = (f'ranges from {tmean[0]:.1f} to {tmean[-1]:.1f} minutes, with mean inference costs from '
                  f'USD {cmean[0]:.2f} to USD {cmean[-1]:.2f}')
    if want_intro in intro:
        print(f'  ok    Introduction states "{want_intro}"'); ok('introduction range')
    else:
        fail(f'Introduction does not state the recomputed range: expected "{want_intro}". '
             f'An earlier draft said 20.6; confirm the arXiv build carries the correction.')
    blocks = [exp[s] for s in ('pyramid', 'two_towers', 'six_block_tower')]
    bn, bd = sum(e['n_success'] for e in blocks), sum(e['n_trials'] for e in blocks)
    if f'{bn} of {bd} successful trials across three block construction configurations' in intro:
        print(f'  ok    Introduction states {bn} of {bd} block construction trials'); ok('block trials')
    else:
        fail(f'Introduction block-construction claim does not match the recomputed {bn} of {bd}')
    abstract = open(os.path.join(RAW, 'parts_0_abstract.tex')).read()
    pct = ', '.join(f"{100*exp[s]['n_success']//exp[s]['n_trials']}\\%"
                    for s in ('pyramid', 'two_towers', 'six_block_tower'))
    pct = pct.replace(', 80', ', and 80')
    if pct in abstract:
        print(f'  ok    Abstract states the block construction rates '
              + pct.replace(chr(92), ''))
        ok('abstract block rates')
    else:
        fail(f'Abstract block-construction rates do not match the recomputed {pct}')
    n80 = sum(1 for e in t1 if e['n_success'] / e['n_trials'] >= 0.8)
    n100 = sum(1 for e in t1 if e['n_success'] == e['n_trials'])
    WORD = {2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight'}
    body = open(os.path.join(RAW, 'parts_4_experiments.tex')).read()
    claim = (f'success rates of at least 80\\% in {WORD[n80]} of {WORD[len(t1)]} task configurations, '
             f'with 100\\% observed success in {WORD[n100]}')
    if claim in body:
        print(f'  ok    Section 4 states {WORD[n80]} of {WORD[len(t1)]} at 80% or better, {WORD[n100]} at 100%')
        ok('section 4 headline claim')
    else:
        fail(f'Section 4 headline claim does not match the recomputed "{WORD[n80]} of {WORD[len(t1)]}" / '
             f'"{WORD[n100]}" at 100%')

def check_trials():
    print('\n[site/data/trials.csv]')
    p = os.path.join(SITE, 'trials.csv')
    if not os.path.exists(p): fail('trials.csv missing'); return
    tr = rows(p)
    if len(tr) != 87: fail(f'trials.csv has {len(tr)} slots, expected 87')
    for tbl, n in (('table1', 37), ('table2', 40), ('transfer', 10)):
        got = sum(1 for r in tr if r['table'] == tbl)
        if got != n: fail(f'trials.csv: {tbl} has {got} slots, expected {n}')
    if len({r['slot_id'] for r in tr}) != len(tr): fail('trials.csv: duplicate slot_id')
    if len({r['still_id'] for r in tr}) != len(tr): fail('trials.csv: duplicate still_id')
    classes = ('explicit success', 'explicit failure', 'unclear', 'no report')
    counts = {c: sum(1 for r in tr if r['label_confidence'] == c) for c in classes}
    bad = [r['slot_id'] for r in tr if r['label_confidence'] not in classes]
    if bad: fail(f'trials.csv: unknown label_confidence on {bad}')
    dis = [r for r in tr if r['self_report_disagrees_with_audit'] == 'yes']
    for r in dis:
        contrary = ((r['label_confidence'] == 'explicit success' and r['outcome'] == 'failure') or
                    (r['label_confidence'] == 'explicit failure' and r['outcome'] == 'success'))
        if not contrary:
            fail(f'trials.csv/{r["slot_id"]}: marked as a disagreement but the labels are not contrary')
    for r in tr:
        if r['self_report_disagrees_with_audit'] == 'no':
            contrary = ((r['label_confidence'] == 'explicit success' and r['outcome'] == 'failure') or
                        (r['label_confidence'] == 'explicit failure' and r['outcome'] == 'success'))
            if contrary:
                fail(f'trials.csv/{r["slot_id"]}: contrary labels but not marked as a disagreement')
    j = json.load(open(os.path.join(SITE, 'trials.json')))
    if j['counts']['label_confidence'] != counts:
        fail(f'trials.json counts {j["counts"]["label_confidence"]} != trials.csv {counts}')
    if j['counts']['self_report_disagrees_with_audit'] != len(dis):
        fail('trials.json disagreement count != trials.csv')
    if len(j['disagreements']) != len(dis):
        fail('trials.json disagreement list length != trials.csv')
    print(f'  ok    87 slots, unique ids, {counts}')
    print(f'  ok    explicit disagreements: {len(dis)} '
          + (f'({dis[0]["config"]} trial {dis[0]["trial_index"]} of {dis[0]["n_trials"]})' if dis else ''))
    ok('trials.csv/json consistent')

DENYLIST = os.path.join(HERE, 'denylist.txt')
TEXT_EXT = {'.csv', '.json', '.txt', '.md', '.tsv', '.html', '.js', '.css', '.svg', '.xml'}

def load_denylist():
    """The needles live in build/denylist.txt, which is part of the build and never published,
    so that this script itself carries none of them and can ship with the data."""
    if not os.path.exists(DENYLIST):
        return None
    out = []
    for line in open(DENYLIST, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line.strip() or line.lstrip().startswith('#'): continue
        needle, _, why = line.partition('\t')
        out.append((needle.strip(), why.strip() or 'denylisted'))
    return out

def check_sanitisation(strict_site):
    """Nothing a visitor can download may carry an account name, a path, a bridge address,
    a trace file name, an internal batch nickname or venue wording. site/data is the data
    spine's own output and always fails; the rest of site/ is other build steps' output and
    warns unless --strict-site is given.

    Fixed strings, never regexes: several needles contain dots and colons and would match
    far more as a pattern than as text. This scan reads the text files only; site/.git is
    excluded per D6, and the mp4 and webp files are checked through their container
    metadata by build/check_denylist.py, which is the full-site gate."""
    print('\n[sanitisation of site/]')
    deny = load_denylist()
    if deny is None:
        warn('build/denylist.txt is missing; the sanitisation check did not run'); return
    site_root = os.path.dirname(SITE)
    hits, scanned = 0, 0
    for dirpath, dirs, files in os.walk(site_root):
        dirs[:] = [d for d in dirs if d != '.git']
        for fn in sorted(files):
            if os.path.splitext(fn)[1].lower() not in TEXT_EXT: continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, site_root)
            mine = rel.startswith('data' + os.sep)
            low = open(full, encoding='utf-8', errors='replace').read().lower()
            scanned += 1
            for needle, why in deny:
                if needle.lower() in low:
                    msg = f'site/{rel}: contains "{needle}" ({why})'
                    (fail if (mine or strict_site) else warn)(msg)
                    hits += 1
    if not hits:
        print(f'  ok    {scanned} text files under site/ (site/.git excluded), no denylisted string')
        print('        media is scanned through its container metadata by build/check_denylist.py')
        ok('sanitisation')
    elif not strict_site:
        print('        (hits outside site/data are warnings; use --strict-site to make them fail)')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tex', default=os.path.join(RAW, 'parts_4_experiments.tex'),
                    help='LaTeX source to verify against (default: the pinned snapshot)')
    ap.add_argument('--require-signoff', action='store_true',
                    help='also fail while any attestation in build/denominators.json is unsigned')
    ap.add_argument('--strict-site', action='store_true',
                    help='fail, not warn, on a denylist hit anywhere under site/ (launch gate)')
    a = ap.parse_args()

    print(f'AGP verification gate\n  LaTeX  {os.path.relpath(a.tex, ROOT)}\n  data   build/data/raw/ (pinned)')
    den = json.load(open(os.path.join(HERE, 'denominators.json')))
    att = {d['config_slug']: d for d in den['attested_success_denominators']}
    exp = load_expected()
    tables = parse_tables(a.tex)
    for lab, wanted, name in (('tab:task_comparison', T1_ROWS, 'Table 1'),
                              ('tab:model_effort_assembly', T2_ROWS, 'Table 2')):
        if lab not in tables: fail(f'{name}: \\label{{{lab}}} not found in the LaTeX'); continue
        check_table(name, tables[lab], wanted, exp, att)

    check_site_tables(exp)
    check_clearances()
    check_transfer()
    check_derived_claims(exp)
    check_trials()
    check_sanitisation(a.strict_site)

    print('\n[author attestations]')
    for d in den['attested_success_denominators'] + den.get('additional_attested_denominators', []):
        signed = bool((d.get('author_signoff') or {}).get('signed_by'))
        print(f'  {"SIGNED " if signed else "UNSIGNED"} {d["row"]}: Success {d["printed"]}')
        if not signed:
            (fail if a.require_signoff else warn)(
                f'{d["row"]}: Success {d["printed"]} is unsigned in build/denominators.json')

    print(f'\n{len(OKS)} checks passed, {len(WARNS)} warnings, {len(FAILS)} failures')
    if FAILS:
        print('\nFAILURES:')
        for m in FAILS: print('  - ' + m)
        sys.exit(1)
    n_att = len(den['attested_success_denominators']) + len(den.get('additional_attested_denominators', []))
    n_signed = sum(1 for d in (den['attested_success_denominators']
                               + den.get('additional_attested_denominators', []))
                   if (d.get('author_signoff') or {}).get('signed_by'))
    print('PASS - every resource cell matches the pinned CSVs at full precision.')
    print(f'       {n_att} Success denominators rest on author attestation, not on data: '
          'GPT-5.6 Terra, GPT-5.6 Luna and Claude Fable 5.1 in the model comparison, and the')
    print('       five GPT-6 Astra runs that built the experience store.')
    print(f'       {n_signed} of {n_att} attestations are signed in build/denominators.json.')

if __name__ == '__main__':
    main()

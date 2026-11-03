// Builds the GitHub Pages site: an index of every main run of the current commit, and each run's
// own Playwright HTML report under runs/<run id>/. Runs in the deploy-report job, after the tests job.
// Every value comes from the Actions API and the tests job log; nothing is typed in by hand.
//
// Env (set by Actions): GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID, GH_TOKEN.
// Usage: node scripts/build-pages-site.mjs [outDir]   (default: site)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const currentRunId = Number(process.env.GITHUB_RUN_ID);
const out = process.argv[2] || 'site';
if (!repo || !sha) throw new Error('GITHUB_REPOSITORY and GITHUB_SHA must be set');

const SERIES = 5;
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const api = (path) => JSON.parse(gh(['api', path]));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Main-branch runs of this workflow for this exact commit, oldest first. Pull requests do not count.
const runs = api(`repos/${repo}/actions/workflows/tests.yml/runs?head_sha=${sha}&branch=main&per_page=100`).workflow_runs
  .filter((r) => r.event === 'push' || r.event === 'workflow_dispatch')
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

// Job logs are fetched directly: `gh api` refuses to print them because Playwright colours its output.
const token = process.env.GH_TOKEN || gh(['auth', 'token']).trim();
async function jobLog(jobId) {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${jobId}/logs`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  // Logs expire with the run; the row then shows the job result without counts.
  if (!res.ok) return '';
  return (await res.text()).replace(/\x1b\[[0-9;]*m/g, '');
}

// Counts are read from the tests job log: the Playwright list reporter summary of that job.
async function testsJob(run) {
  const job = api(`repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`).jobs.find((j) => j.name === 'tests');
  if (!job || job.status !== 'completed') return { result: job ? job.status : 'missing' };
  const log = await jobLog(job.id);
  const n = (word) => {
    const m = log.match(new RegExp(`^\\S+\\s+(\\d+) ${word}\\b`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  const time = log.match(/^\S+\s+\d+ (?:passed|failed|flaky|skipped) \((\d+(?:\.\d+)?)(ms|s|m)\)/m);
  const running = log.match(/Running (\d+) tests? using (\d+) workers?/);
  return {
    result: job.conclusion,
    start: job.started_at,
    end: job.completed_at,
    hasLog: Boolean(log),
    total: running ? Number(running[1]) : null,
    workers: running ? Number(running[2]) : null,
    passed: n('passed'), failed: n('failed'), flaky: n('flaky'), skipped: n('skipped'),
    testTime: time ? `${time[1]} ${time[2]}` : '',
    retries0: /playwright test --retries=0/.test(log),
  };
}

const rows = [];
for (const [i, run] of runs.entries()) {
  const job = await testsJob(run);
  const dir = join(out, 'runs', String(run.id));
  // The current run's report is put there by actions/download-artifact; older ones come from their runs.
  if (!existsSync(join(dir, 'index.html'))) {
    try {
      gh(['run', 'download', String(run.id), '-R', repo, '-n', 'playwright-report', '-D', dir]);
    } catch {
      // Artifacts expire after 14 days: the row stays, without a report link.
    }
  }
  const green = job.result === 'success' && job.failed === 0 && job.flaky === 0 && job.passed > 0;
  // Runs must be one after another: a run whose tests started before the previous run's tests ended overlaps it.
  const prev = rows.at(-1)?.job;
  const overlaps = Boolean(job.start && prev?.end && new Date(job.start) < new Date(prev.end));
  rows.push({ n: i + 1, run, job, green, overlaps, firstAttempt: run.run_attempt === 1, report: existsSync(join(dir, 'index.html')) });
}

// Why a finished run does not count towards the series, or '' when it does.
const problem = (r) =>
  !r.firstAttempt ? `re-run (attempt ${r.run.run_attempt})`
    : !r.green ? (r.job.hasLog ? r.job.result : 'no log to read counts from')
      : !r.job.retries0 ? 'not run with --retries=0'
        : r.overlaps ? `overlaps run ${r.n - 1}`
          : '';

const series = rows.slice(0, SERIES);
const counted = series.filter((r) => r.job.start && !problem(r)).length;
const broken = series.find((r) => r.job.start && problem(r));
const verdict = broken
  ? { cls: 'bad', text: `Series broken at run ${broken.n}: ${problem(broken)}` }
  : counted === SERIES
    ? { cls: 'good', text: `${SERIES} of ${SERIES} runs green, first attempt, --retries=0` }
    : { cls: 'wait', text: `In progress: ${counted} of ${SERIES} green runs so far` };

const time = (iso) => (iso ? iso.replace('T', ' ').replace('Z', '') : '—');
const runUrl = (run) => `https://github.com/${repo}/actions/runs/${run.id}`;
const commitUrl = `https://github.com/${repo}/commit/${sha}`;
const latest = rows.filter((r) => r.report).at(-1);

const tableRows = rows.map((r) => {
  const { n, run, job, firstAttempt, report } = r;
  const why = job.start ? problem(r) : '';
  return `
      <tr class="${n > SERIES ? 'extra' : ''}">
        <td>${n}</td>
        <td><a href="${esc(runUrl(run))}">${run.id}</a></td>
        <td>${esc(run.event)}</td>
        <td>${firstAttempt ? '1' : `<span class="bad">${run.run_attempt}</span>`}</td>
        <td>${esc(time(job.start))}</td>
        <td>${esc(time(job.end).slice(11))}</td>
        <td><span class="pill ${!job.start ? 'wait' : why ? 'bad' : 'good'}">${esc(job.result)}</span>${why && job.result === 'success' ? ` <span class="bad">${esc(why)}</span>` : ''}</td>
        <td class="num">${job.hasLog ? job.passed : '—'}</td>
        <td class="num">${job.hasLog ? job.failed : '—'}</td>
        <td class="num">${job.hasLog ? job.flaky : '—'}</td>
        <td class="num">${job.hasLog ? job.skipped : '—'}</td>
        <td class="num">${esc(job.testTime || '—')}</td>
        <td>${report ? `<a href="runs/${run.id}/index.html">Open</a>` : '—'}</td>
      </tr>`;
}).join('');

const built = new Date().toISOString().replace('T', ' ').slice(0, 19);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Training Shop CI runs</title>
<style>
  :root { --bg: #f6f7f9; --card: #fff; --text: #1b1f24; --muted: #5b6470; --line: #dde1e6; --link: #0b5cd5;
          --good: #12733a; --good-bg: #e2f4e8; --bad: #b42318; --bad-bg: #fde7e5; --wait: #8a5a00; --wait-bg: #fdf1d8; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f1216; --card: #171b21; --text: #e6e9ed; --muted: #9aa3ad; --line: #2a3038; --link: #6ea8ff;
            --good: #6fd394; --good-bg: #133222; --bad: #ff8a80; --bad-bg: #3a1714; --wait: #f0c065; --wait-bg: #3a2c0c; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1180px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  p { margin: 4px 0; color: var(--muted); }
  a { color: var(--link); }
  code { font: 13px ui-monospace, "Cascadia Mono", Consolas, monospace; }
  .verdict { margin: 20px 0; padding: 14px 18px; border-radius: 10px; font-weight: 600; font-size: 17px; }
  .verdict.good, .pill.good { color: var(--good); background: var(--good-bg); }
  .verdict.bad, .pill.bad { color: var(--bad); background: var(--bad-bg); }
  .verdict.wait, .pill.wait { color: var(--wait); background: var(--wait-bg); }
  span.bad { color: var(--bad); font-weight: 600; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 860px; }
  th, td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th { font-size: 13px; color: var(--muted); font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  tr.extra td { color: var(--muted); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: 1px 10px; border-radius: 99px; font-size: 13px; font-weight: 600; }
  ul { color: var(--muted); padding-left: 20px; }
</style>
</head>
<body>
<main>
  <h1>Training Shop: CI runs</h1>
  <p>Workflow <code>UI tests</code>, branch <code>main</code>, commit <a href="${esc(commitUrl)}"><code>${esc(sha.slice(0, 7))}</code></a></p>
  <div class="verdict ${verdict.cls}">${esc(verdict.text)}</div>
  <div class="card">
    <table>
      <thead><tr>
        <th>#</th><th>Run</th><th>Trigger</th><th>Attempt</th><th>Tests start (UTC)</th><th>End</th>
        <th>Result</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Flaky</th><th class="num">Skipped</th>
        <th class="num">Test time</th><th>Report</th>
      </tr></thead>
      <tbody>${tableRows || '<tr><td colspan="13">No runs yet</td></tr>'}
      </tbody>
    </table>
  </div>
  <ul>
    <li>All runs of this commit on <code>main</code> (push and manual dispatch), oldest first. The series is the first ${SERIES}; later runs are listed in grey.</li>
    <li>Result is the <code>tests</code> job. Counts come from the Playwright summary in that job's log; the step is <code>npx playwright test --retries=0</code>.</li>
    <li>A re-run (attempt &gt; 1) or a run that overlaps the previous one breaks the series. A new commit starts a new series on this page.</li>
    <li>${latest ? `Latest report: <a href="runs/${latest.run.id}/index.html">run ${latest.run.id}</a>. ` : ''}Each report is the run's own <code>playwright-report</code> artifact (kept 14 days).</li>
  </ul>
  <p>Page built ${esc(built)} UTC by run <a href="${esc(runUrl({ id: currentRunId }))}">${currentRunId}</a>.</p>
</main>
</body>
</html>
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, '.nojekyll'), '');
console.log(`${verdict.text}`);
for (const r of rows) console.log(`  ${r.n}. ${r.run.id} ${r.run.event} attempt ${r.run.run_attempt}: ${r.job.result} ${r.job.passed}p/${r.job.failed}f/${r.job.flaky}fl/${r.job.skipped}s ${r.job.testTime} report:${r.report}`);

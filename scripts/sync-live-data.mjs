#!/usr/bin/env node
/* Builds data/live-activity.json — the snapshot the portfolio prefers over the
   rate-limited unauthenticated GitHub REST API. Runs tokenless for local
   testing; CI passes GITHUB_TOKEN to stay well under rate limits.
   No dependencies: Node 18+ global fetch only. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = 'kvsaikrishnaiiitn';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

async function gh(path) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': OWNER + '-live-sync'
    };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch('https://api.github.com' + path, { headers });
    if (!r.ok) throw new Error('GET ' + path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.json();
}

const [repos, events] = await Promise.all([
    gh('/users/' + OWNER + '/repos?sort=pushed&per_page=100'),
    gh('/users/' + OWNER + '/events/public?per_page=15')
]);

/* own work only: forks and private repos are not showcase material */
const mine = repos.filter(r => !r.fork && !r.private);

const totals = {
    repositories: mine.length,
    stars: mine.reduce((s, r) => s + (r.stargazers_count || 0), 0),
    forks: mine.reduce((s, r) => s + (r.forks_count || 0), 0)
};

const snapshot = {
    generated_at: new Date().toISOString(),
    owner: OWNER,
    totals,
    /* most recently pushed first (API already sorted); site renders the first 6 */
    repos: mine.slice(0, 12).map(r => ({
        name: r.name,
        full_name: r.full_name,
        description: r.description,
        html_url: r.html_url,
        language: r.language,
        stargazers_count: r.stargazers_count || 0,
        forks_count: r.forks_count || 0,
        pushed_at: r.pushed_at,
        archived: !!r.archived,
        topics: r.topics || []
    })),
    /* trimmed public events — same shape index.html's activity feed already renders */
    events: events.map(e => ({
        id: e.id,
        type: e.type,
        created_at: e.created_at,
        repo: e.repo,
        payload: e.payload
    }))
};

const out = join(root, 'data', 'live-activity.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
console.log('snapshot: ' + snapshot.repos.length + ' repos, ' + snapshot.events.length +
    ' events, totals=' + JSON.stringify(totals) + ' -> data/live-activity.json');

// Builds the GitHub Pages site (this gh-pages branch) from a checkout of main:
//   node _build/build.mjs <path to a main checkout>
// Writes index.html and docs/*.html (from main's docs/*.md) and copies docs/images. The films (films/<slug>.mp4,
// .jpg poster, .vtt subtitles) are added by hand; this script only lists them.
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';

const SRC = path.resolve(process.argv[2] || '');
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REPO = 'https://github.com/zakariaf/cinecode';
if (!fs.existsSync(path.join(SRC, 'docs/storyboard.md'))) throw new Error(`not a cinecode checkout: ${SRC}`);

const DOCS = [
  ['storyboard', 'Storyboard'], ['cast', 'Cast and rigs'], ['sets', 'Sets'], ['effects', 'Effects'],
  ['sound', 'Voices, music and sound'], ['lint', 'Lint'], ['rendering', 'Rendering'],
];
const FILMS = [
  { slug: 'solar-system', title: 'Our Solar System', len: '15:34', feature: true,
    about: 'On a hill at night, Nell asks her grandmother about a bright star, and a narrator takes them past the Sun and every planet, out to Pluto and the Kuiper Belt, and home again for the sunrise. A family film, every fact checked against NASA.',
    meta: '21 scenes · 68 shots · 168 voiced lines · 1080p · made by 36 Claude Code agents in about six hours',
    extra: `<a href="${REPO}/releases/tag/our-solar-system">Download in 1080p</a> · ` },
  { slug: 'seventy-six-summers', feature: true, title: 'Seventy-Six Summers', len: '3:47',
    about: 'A hundred-year-old tortoise has one day left to cross the valley and keep a promise he made to a six-year-old girl the last time the comet came, seventy-six years ago. A fast-talking squirrel rides along on his shell, sure that she has forgotten.',
    meta: '12 scenes · 56 shots · 56 voiced lines · 1080p' },
  { slug: 'glim', title: 'Glim', len: '0:27',
    about: 'A little mouse, caught out in the forest after dark and too frightened to find her way, is led home by a firefly.' },
  { slug: 'kite', title: 'The Kite', len: '0:32',
    about: 'A little girl wants her kite to fly higher and higher; her grandfather warns her about the only tree on the hill.' },
  { slug: 'strawberry-race', title: 'The Last Strawberry', len: '0:37',
    about: 'A gruff old hedgehog and a cheeky young frog race across the stream for the last strawberry of summer.' },
  { slug: 'storm-shelter', title: 'Storm Shelter', len: '0:34',
    about: 'A soaked badger reaches the old wayside tree in a thunderstorm and finds a shy deer already sheltering there.' },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// GitHub-style heading ids, so links like storyboard.md#camera keep working.
function slugger() {
  const seen = new Map();
  return text => {
    const base = text.replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, '').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');
    const n = seen.get(base) || 0; seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}
// Links in the docs: other docs → their page, the README → the home page, code and folders → GitHub.
function rewrite(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [p, hash = ''] = href.split('#'), h = hash ? `#${hash}` : '';
  const doc = p.match(/^(?:\.\/)?([\w-]+)\.md$/);
  if (doc && DOCS.some(([s]) => s === doc[1])) return `${doc[1]}.html${h}`;
  if (/^\.\.\/README\.md$/.test(p)) return `../index.html${h}`;
  if (p.startsWith('../')) {
    const rel = p.slice(3), isDir = !path.extname(rel) || rel.endsWith('/');
    return `${REPO}/${isDir ? 'tree' : 'blob'}/main/${rel}${h}`;
  }
  if (p.startsWith('images/')) return href;
  return `${REPO}/blob/main/docs/${p}${h}`;
}
function render(md) {
  const slug = slugger(), toc = [];
  const m = new Marked({ gfm: true });
  m.use({
    walkTokens(t) { if ((t.type === 'link' || t.type === 'image') && t.href) t.href = t.type === 'link' ? rewrite(t.href) : t.href; },
    renderer: {
      heading(text, level) {
        const id = slug(text);
        if (level === 2) toc.push([id, text.replace(/<[^>]+>/g, '')]);
        return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${level}>\n`;
      },
      table(header, body) { return `<div class="table"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`; },
    },
  });
  return { html: m.parse(md), toc };
}

const NAV = (root, here) => `<header class="top"><div class="wrap">
  <a class="mark" href="${root}index.html">cine<span>code</span></a>
  <nav><a href="${root}index.html#films"${here === 'films' ? ' aria-current="page"' : ''}>Films</a><a href="${root}index.html#install">Install</a><a href="${root}docs/storyboard.html"${here === 'docs' ? ' aria-current="page"' : ''}>Docs</a><a href="${REPO}">GitHub</a></nav>
</div></header>`;
const FOOT = `<footer><div class="wrap"><p>cinecode is open source under the MIT licence · © 2026 Zakaria Fatahi · <a href="${REPO}">github.com/zakariaf/cinecode</a></p>
<p>Every picture, movement, note and sound in these films is made by code. Only the voices come from a model (Gemini TTS).</p></div></footer>`;
const page = ({ title, desc, root, body, here }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://zakaria.dev/cinecode/hero.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}style.css"></head>
<body>${NAV(root, here)}${body}${FOOT}</body></html>
`;

// ── docs ──
fs.mkdirSync(path.join(OUT, 'docs/images'), { recursive: true });
for (const f of fs.readdirSync(path.join(SRC, 'docs/images'))) fs.copyFileSync(path.join(SRC, 'docs/images', f), path.join(OUT, 'docs/images', f));
for (const [slug, name] of DOCS) {
  const md = fs.readFileSync(path.join(SRC, `docs/${slug}.md`), 'utf8');
  const { html, toc } = render(md);
  const side = `<aside class="side"><p class="label">Docs</p><ul>${DOCS.map(([s, n]) => `<li><a href="${s}.html"${s === slug ? ' aria-current="page"' : ''}>${esc(n)}</a></li>`).join('')}</ul>
${toc.length ? `<p class="label">On this page</p><ul class="toc">${toc.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ul>` : ''}</aside>`;
  const body = `<main class="docs wrap">${side}<article class="prose">${html}
<p class="edit"><a href="${REPO}/blob/main/docs/${slug}.md">This page on GitHub</a></p></article></main>`;
  fs.writeFileSync(path.join(OUT, `docs/${slug}.html`), page({ title: `${name} · cinecode`, desc: `cinecode docs: ${name}`, root: '../', body, here: 'docs' }));
}

// ── home ──
const have = f => fs.existsSync(path.join(OUT, 'films', f));
const video = f => `<video controls preload="none" playsinline poster="films/${f.slug}.jpg"><source src="films/${f.slug}.mp4" type="video/mp4">${have(`${f.slug}.vtt`) ? `<track kind="subtitles" srclang="en" label="English" src="films/${f.slug}.vtt">` : ''}</video>`;
const feats = FILMS.filter(f => f.feature), shorts = FILMS.filter(f => !f.feature);
const STEPS = [
  ['Write', 'A screenplay: logline, characters, places, music, then scenes and shots with their lines.'],
  ['Storyboard', '<code>film.json</code>: the cast, the sets, and every shot\'s camera and beats, checked field by field.'],
  ['Voice', 'Each line from Gemini TTS, transcribed back and retried until it says the words. Cached on disk.'],
  ['Review', 'Contact sheets of every shot, and a lint for staging and editing: feet, framing, eyelines, cuts.'],
  ['Score and mix', 'A procedural score with a motif, synthesized effects and ambience, mastered to −16 LUFS.'],
  ['Render', 'Full HD in parallel worker processes, with subtitles.'],
];
const ENGINE = [
  ['14 character rigs', 'Humans of every age, and a hare, tortoise, fox, owl, squirrel and more, inked and cel-shaded, with poses, gaits, gestures and faces.', 'cast'],
  ['8 painted sets', 'Meadow, forest, stream, wayside, valley, hill, village and space, with parallax, props, walkable ground and eight times of day.', 'sets'],
  ['A camera', 'Shot sizes framed on whoever you name, push-ins, pans, cranes and moves through depth, with lead room and depth of field.', 'storyboard'],
  ['Music and sound', 'A score in ten moods, 39 synthesized effects, footsteps by surface, ambience beds and a mastered mix.', 'sound'],
  ['Effects', 'Rain, fireflies, mist, sparkles, and custom effects for skies and space.', 'effects'],
  ['Builds what is missing', 'No rig for a whale? No set for a city? The plugin builds the character, place or effect, and a gate checks it.', 'effects'],
];
const home = `<section class="hero"><img src="hero.jpg" alt="From Our Solar System: nine Earths side by side across the face of Saturn">
<div class="hero-text wrap"><h1>Animated films, made entirely by code.</h1>
<p>cinecode is a Claude Code plugin. Describe a film, and Claude writes it, stages every shot, animates it, scores it, mixes it and renders it. No drawing tools, no video model, no image files: a program paints every frame.</p>
<p class="cta"><a class="btn" href="#films">Watch the films</a><a class="btn ghost" href="#install">Install the plugin</a></p></div></section>
<main>
<section id="films" class="wrap films"><h2>Films</h2>
${feats.map(feat => `<div class="feature">${video(feat)}<div><h3>${esc(feat.title)} <span class="len">${feat.len}</span></h3><p>${esc(feat.about)}</p><p class="meta">${feat.meta}</p>
<p>${feat.extra || ''}<a href="${REPO}/tree/main/films/${feat.slug}">Screenplay, storyboard and code</a></p></div></div>`).join('\n')}
<h3 class="sub">Made from one sentence</h3><p class="lede">Each of these was made by a fresh Claude Code agent from a one-sentence idea, using the plugin's skill.</p>
<div class="grid">${shorts.map(f => `<figure>${video(f)}<figcaption><strong>${esc(f.title)}</strong> <span class="len">${f.len}</span><br>${esc(f.about)} <a href="${REPO}/tree/main/films/${f.slug}">Source</a></figcaption></figure>`).join('')}</div></section>
<section id="install" class="band"><div class="wrap two">
<div><h2>Install</h2><p>In Claude Code:</p>
<pre><code>/plugin marketplace add zakariaf/cinecode
/plugin install cinecode@cinecode</code></pre>
<p>Then open Claude Code in any folder and ask for a film in plain words, or call the skill by name:</p>
<pre><code>/cinecode:cinecode make a two-minute animated film about a fox who is afraid of the dark</code></pre>
<p>The first run checks Node 20+, ffmpeg and the drawing library. Voices need a <code>GEMINI_API_KEY</code>; everything else runs offline.</p></div>
<div><h2>How a film is made</h2><ol class="steps">${STEPS.map(([h, p]) => `<li><strong>${h}.</strong> ${p}</li>`).join('')}</ol></div>
</div></section>
<section class="wrap engine"><h2>What's in the engine</h2>
<div class="cards">${ENGINE.map(([h, p, d]) => `<a class="card" href="docs/${d}.html"><h3>${h}</h3><p>${p}</p></a>`).join('')}</div>
<p class="more">Version 0.1. Expect rough edges; issues and pull requests are welcome. Read the <a href="docs/storyboard.html">docs</a> or the <a href="${REPO}">source</a>.</p></section>
</main>`;
fs.writeFileSync(path.join(OUT, 'index.html'), page({ title: 'cinecode · animated films made entirely by code', desc: 'A Claude Code plugin that turns an idea into a finished animated film: written, staged, animated, scored, mixed and rendered by code.', root: '', body: home, here: 'films' }));
console.log(`built index.html and ${DOCS.length} docs pages into ${OUT}`);

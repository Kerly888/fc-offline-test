/* Artwork Loading Test (Test B, GitHub Pages): the offline engine.
   It downloads the page, its icons and the eight pictures into a cache named for this build, checking every picture
   against its fingerprint. Only when every file is in place does it take over; if anything fails, the half-made cache
   is deleted and the previous complete copy stays in use. Updates never touch saved progress (that lives in the
   page's own storage, not in this cache). The ?fail= versions exist only for the page's failure tests. */
'use strict';
const BUILD = '1';
const ART = [{"file": "art/909abc4fba5ab601.webp", "bytes": 234818, "sha256": "909abc4fba5ab6019ae57f09a717ff64ed3f25b9bffbf736f34e3fc192b5c95b", "type": "image/webp", "label": "The Fractured Kingdom, left field"}, {"file": "art/5cae128e920b7c5f.webp", "bytes": 231950, "sha256": "5cae128e920b7c5f5b5b2f4bf58a7f0c24b87f40f2e5c6248af614bbb2e17339", "type": "image/webp", "label": "The Starry Blossom, right field (tablet)"}, {"file": "art/97aea7182fc3739c.webp", "bytes": 175796, "sha256": "97aea7182fc3739c07dc3a619126896c196982f56bab2ca3f8abf5059dec8d41", "type": "image/webp", "label": "The Ocean\u2019s Fury, left field"}, {"file": "art/df339ca910e990cb.webp", "bytes": 87080, "sha256": "df339ca910e990cb88f0a7240c473d910a826429b34c8a3dba3555f529865fe0", "type": "image/webp", "label": "The Inventor\u2019s Codex, right page"}, {"file": "art/4b2b4b7a87f1079c.png", "bytes": 10037, "sha256": "4b2b4b7a87f1079c68d80a8678a200f785f71420d7209ac19b4c63b854045f16", "type": "image/png", "label": "The Cathedral of Hours (PNG piece)"}, {"file": "art/4fb749dc118b6936.webp", "bytes": 87878, "sha256": "4fb749dc118b69364d379c5ac4f0cdd71d4a35d17d89188d297c2d6c593c6925", "type": "image/webp", "label": "The Burning Horizon, right field"}, {"file": "art/afa725b0b854b9bf.webp", "bytes": 619430, "sha256": "afa725b0b854b9bf60c19058b009b1c2f97e5fd4d2a8a014fb985f2d9a48adaf", "type": "image/webp", "label": "The Fractured Kingdom, largest phone version"}, {"file": "art/b0f659a566f9e9f9.webp", "bytes": 327430, "sha256": "b0f659a566f9e9f998ddac4d027f3161e92b1961f0d99caa5f351b9e4b850412", "type": "image/webp", "label": "The Starry Blossom, largest phone version"}];
const FAIL = new URL(location).searchParams.get('fail');
const FILES = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'].concat(ART.map(a => a.file));
const CACHE = 'p0-' + BUILD + (FAIL ? '-try-' + FAIL : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sha(buf) { const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function tell(msg) { for (const c of await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })) c.postMessage(msg); }
function fetchT(u, ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(u, { cache: 'reload', signal: c.signal }).finally(() => clearTimeout(t)); }

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const list = FILES.slice(); if (FAIL === 'missing') list.push('art/does-not-exist.webp');
    const cache = await caches.open(CACHE);
    try {
      let done = 0;
      for (const f of list) {
        if (FAIL === 'slow') await sleep(1500);
        const r = await fetchT(f, 30000);
        if (!r.ok) throw new Error(f + ' could not be downloaded (HTTP ' + r.status + ')');
        const a = ART.find(x => x.file === f);
        if (a) { let h = await sha(await r.clone().arrayBuffer()); if (FAIL === 'corrupt' && a === ART[2]) h = 'damaged'; if (h !== a.sha256) throw new Error(f + ' did not match its fingerprint'); }
        await cache.put(f, r);
        tell({ type: 'p0-progress', done: ++done, total: list.length });
      }
    } catch (err) { await caches.delete(CACHE); throw err; }   // nothing half-made is ever kept
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('p0-') && k !== CACHE) await caches.delete(k);   // only now that the new copy is complete
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'p0-status' || !e.ports[0]) return;
  (async () => {
    const cache = await caches.open(CACHE); let count = 0, bytes = 0;
    for (const f of FILES) { const r = await cache.match(f); if (r) { count++; bytes += (await r.clone().blob()).size; } }
    e.ports[0].postMessage({ build: BUILD, count, expected: FILES.length, bytes });
  })();
});

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {   // the newest page when online, the saved page when not
    e.respondWith((async () => {
      try { return await Promise.race([fetch(req), sleep(4000).then(() => { throw new Error('slow'); })]); }
      catch (err) { const c = await caches.open(CACHE); return (await c.match('./')) || Response.error(); }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(req, { ignoreSearch: true });
    if (hit) { const h = new Headers(hit.headers); h.set('x-p0-from', 'cache'); return new Response(await hit.blob(), { status: 200, headers: h }); }
    return fetch(req);
  })());
});

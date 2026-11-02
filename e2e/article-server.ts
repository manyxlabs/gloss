// Run by Node directly, which strips the types. A local site for the web import tests: an article with a picture, and pages that try the Worker's limits.
import { createServer } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';

/** A solid PNG, so the article has a real picture to inline. */
function png(width: number, height: number, [r, g, b]: number[]) {
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length);
    out.write(type, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => [r, g, b][i % 3]!)]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ARTICLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tide pools at dawn</title>
<meta name="author" content="Ada Marsh"><script>window.tracking = true</script></head>
<body><nav><a href="/">Home</a> · <a href="/about">About</a></nav>
<article><h1>Tide pools at dawn</h1><p class="byline">By Ada Marsh</p>
<p>Tide pools are small worlds left behind when the sea pulls back, and each one keeps its own community of animals until the water returns.</p>
<p>Anemones close up to hold water in, while hermit crabs trade shells as they grow, which makes the pools a busy place at low tide.</p>
<h2>What lives there</h2>
<ul><li>Sea stars that pry open mussels with patient arms.</li><li>Sculpins that change colour to match the rocks.</li></ul>
<figure><img src="/figure.png" alt="A pool"><figcaption>A pool on the north shore.</figcaption></figure>
<p>Visitors should step only on bare rock, because every patch of weed shelters something small that cannot move out of the way in time.</p>
<p>Returning an overturned stone to where it was found keeps the creatures beneath it from drying out in the sun.</p>
</article><footer>Copyright</footer></body></html>`;

const port = Number(process.argv[2] ?? 4353);
createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path === '/article') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE);
  if (path === '/figure.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(png(320, 160, [40, 120, 200]));
  if (path === '/moved') return res.writeHead(302, { location: '/article' }).end();
  // A redirect may not lead the Worker to an address it would have refused outright.
  if (path === '/to-metadata') return res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
  if (path === '/data.json') return res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  if (path === '/huge') {
    res.writeHead(200, { 'content-type': 'text/html' });
    const block = Buffer.alloc(1024 * 1024, 'a');
    for (let i = 0; i < 7; i++) res.write(block);
    return res.end();
  }
  res.writeHead(404).end();
}).listen(port, () => console.log(`article server on ${port}`));

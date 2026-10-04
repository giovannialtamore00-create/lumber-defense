// Review sheet: every sprite in player 1's colour (plus the ones without players) on one image, for checking art.
//   node review.js <atlas dir> <out.png> [name filter regex]
var fs = require('fs'), zlib = require('zlib'), path = require('path');
var dir = process.argv[2] || path.join(__dirname, 'dist-pointy', 'assets');
var outPath = process.argv[3] || path.join(__dirname, 'review.png');
var filter = new RegExp(process.argv[4] || '.');
var m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
var png = fs.readFileSync(path.join(dir, 'atlas.png'));

// Minimal PNG decoder for the atlas (8-bit RGBA, any filter).
var p = 8, idat = [], W, H;
while (p < png.length) {
  var len = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8), d = png.slice(p + 8, p + 8 + len);
  if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); }
  if (type === 'IDAT') idat.push(d);
  p += 12 + len;
}
var raw = zlib.inflateSync(Buffer.concat(idat)), st = W * 4, img = Buffer.alloc(W * H * 4);
for (var y = 0; y < H; y++) {
  var f = raw[y * (st + 1)];
  for (var x = 0; x < st; x++) {
    var a = raw[y * (st + 1) + 1 + x], l = x >= 4 ? img[y * st + x - 4] : 0, u = y ? img[(y - 1) * st + x] : 0,
      ul = y && x >= 4 ? img[(y - 1) * st + x - 4] : 0, v = a;
    if (f === 1) v += l; else if (f === 2) v += u; else if (f === 3) v += (l + u) >> 1;
    else if (f === 4) { var pp = l + u - ul, pa = Math.abs(pp - l), pb = Math.abs(pp - u), pc = Math.abs(pp - ul); v += pa <= pb && pa <= pc ? l : pb <= pc ? u : ul; }
    img[y * st + x] = v & 255;
  }
}

var names = Object.keys(m.sprites).filter(function (n) { return !/\.p[234]$/.test(n) && filter.test(n); });
var C = 8, cw = m.sprites[names[0]].w, ch = m.sprites[names[0]].h, OW = C * cw, OH = Math.ceil(names.length / C) * ch, out = Buffer.alloc(OW * OH * 4);
for (var i = 0; i < out.length; i += 4) { out[i] = 232; out[i + 1] = 238; out[i + 2] = 226; out[i + 3] = 255; }
names.forEach(function (n, k) {
  var s = m.sprites[n], ox = (k % C) * cw, oy = Math.floor(k / C) * ch;
  for (var yy = 0; yy < s.h; yy++) for (var xx = 0; xx < s.w; xx++) {
    var si = ((s.y + yy) * W + s.x + xx) * 4;
    if (img[si + 3]) { var di = ((oy + yy) * OW + ox + xx) * 4; out[di] = img[si]; out[di + 1] = img[si + 1]; out[di + 2] = img[si + 2]; }
  }
});
function crc(b) { var c, r = ~0; for (var n = 0; n < b.length; n++) { c = (r ^ b[n]) & 255; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; r = (r >>> 8) ^ c; } return ~r >>> 0; }
function chunk(t, d) { var l = Buffer.alloc(4); l.writeUInt32BE(d.length); var td = Buffer.concat([Buffer.from(t), d]); var c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }
var r2 = Buffer.alloc((OW * 4 + 1) * OH);
for (y = 0; y < OH; y++) out.copy(r2, y * (OW * 4 + 1) + 1, y * OW * 4, (y + 1) * OW * 4);
var ih = Buffer.alloc(13); ih.writeUInt32BE(OW, 0); ih.writeUInt32BE(OH, 4); ih[8] = 8; ih[9] = 6;
fs.writeFileSync(outPath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(r2)), chunk('IEND', Buffer.alloc(0))]));
console.log(names.join(' '));

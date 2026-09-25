import fs from 'fs';
const D = new URL('./fonts/', import.meta.url).pathname;
export async function routeFonts(ctx) {
  await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ contentType: 'text/css', headers:{'access-control-allow-origin':'*'}, body: fs.readFileSync(D + 'fonts.css') }));
  await ctx.route(/fonts\.gstatic\.com/, r => {
    const f = D + new URL(r.request().url()).pathname.slice(1).replace(/\//g, '_');
    r.fulfill({ contentType: 'font/woff2', headers:{'access-control-allow-origin':'*'}, body: fs.readFileSync(f) });
  });
}

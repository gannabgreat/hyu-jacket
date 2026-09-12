# QR codes

`hyu-jacket-pages-dev.png` — screens · `hyu-jacket-pages-dev-print.png` — print

Both encode <https://hyu-jacket.pages.dev/>, error correction level H, so
they still scan through a logo overlay or a poor print. Decoded back with
CoreImage's CIDetector after generation to confirm the payload.

Regenerate (segno):

    python3 -c "import segno; q=segno.make('https://hyu-jacket.pages.dev/', error='h'); \
      q.save('qr/hyu-jacket-pages-dev.png', scale=12, border=3, dark='#14213D', light='white'); \
      q.save('qr/hyu-jacket-pages-dev-print.png', scale=24, border=4, dark='#14213D', light='white')"

The older QR in circulation points at hyu-jacket.netlify.app, which still
serves but is frozen a commit behind — Netlify's free tier blocked deploys
on 2026-09-11 and resets 2026-10-10.

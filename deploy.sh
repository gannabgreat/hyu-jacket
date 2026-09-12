#!/bin/zsh
# Publish index.html to Cloudflare Pages (https://hyu-jacket.pages.dev).
#
# The API token lives in the login keychain, never in the repo:
#   security add-generic-password -s cloudflare_api_token -a hyu-jacket -w '<token>' -U
# It is a custom token with Account -> Cloudflare Pages -> Edit.
#
# wrangler cannot list accounts with a Pages-only token, so the account id is
# passed explicitly; without it the deploy fails on an account lookup.
set -e
cd "$(dirname "$0")"

CLOUDFLARE_API_TOKEN="$(security find-generic-password -s cloudflare_api_token -w)"
CLOUDFLARE_ACCOUNT_ID=f2a11d44ffa14685ff1a313152882251
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

OUT="$(mktemp -d)"
# index.html carries every photo as base64, but the link-preview image and the
# bare photo URLs have to be real files on the site, so they ship too.
cp index.html "$OUT/index.html"
cp -- *.jpg *.png "$OUT/"
npx -y wrangler@latest pages deploy "$OUT" \
  --project-name hyu-jacket --branch main --commit-dirty=true
rm -rf "$OUT"

echo "checking the live page…"
curl -s -m 30 https://hyu-jacket.pages.dev/ | shasum -a 256 | cut -d' ' -f1
shasum -a 256 index.html | cut -d' ' -f1
echo "(the two hashes above must match)"

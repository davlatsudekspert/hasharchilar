#!/usr/bin/env bash
# Sayt va ilova API manzili: https://<wrangler.jsonc name>.<hisob workers.dev subdomeni>.workers.dev
# CI ishlatadi (apk va deploy job'lari har biri o'zi hisoblaydi — job output'lari orqali uzatilmaydi:
# secret qiymati ichida bo'lgan output'ni GitHub tashlab yuboradi).
#
# Kerak: WORKER_NAME, CLOUDFLARE_ACCOUNT_ID, WORKERS_SUBDOMAIN_FALLBACK.
# Ixtiyoriy: CLOUDFLARE_API_TOKEN (subdomen API dan o'qiladi; bo'lmasa zaxira qiymat).
# Natija (faqat manzil) stdout'ga, xabarlar stderr'ga:  URL=$(bash scripts/site-url.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=$(node scripts/wrangler-config.mjs --print name)
if [ "$NAME" != "$WORKER_NAME" ]; then
  echo "::error::wrangler.jsonc name '${NAME}' != '${WORKER_NAME}'" >&2
  exit 1
fi

SUB=""
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  SUB=$(curl -sS --max-time 20 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain" \
    | jq -r 'select(.success == true) | .result.subdomain // empty' 2>/dev/null) || SUB=""
fi
if [ -z "$SUB" ]; then
  SUB="$WORKERS_SUBDOMAIN_FALLBACK"
  echo "::warning::workers.dev subdomeni API orqali aniqlanmadi — zaxira qiymat ishlatiladi: ${SUB}" >&2
fi
if ! [[ "$SUB" =~ ^[a-z0-9-]+$ ]]; then
  echo "::error::workers.dev subdomeni yaroqsiz: '${SUB}'" >&2
  exit 1
fi

echo "https://${NAME}.${SUB}.workers.dev"

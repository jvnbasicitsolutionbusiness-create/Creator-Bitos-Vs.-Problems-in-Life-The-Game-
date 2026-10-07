#!/usr/bin/env bash
# setup-chrome.sh — get a headless Chromium working in this sandbox.
#
# There is no browser preinstalled and `apt install` is unavailable (the dpkg
# lock is held and we are not root). This works around that by downloading the
# .deb files directly and unpacking them into /tmp/libs, then pointing
# LD_LIBRARY_PATH at them. Nothing is installed system-wide.
#
# The Chrome binary itself lands in ~/.cache/ms-playwright, which is NOT part
# of the workspace snapshot, so this script has to be re-run at the start of
# any session that needs browser QA. It is idempotent.
#
# Usage:  source tools/browser-qa/setup-chrome.sh
#   then: python3 tools/browser-qa/qa.py
set -u

CHROME_DIR="$HOME/.cache/ms-playwright"
LIBS=/tmp/libs
POOL=http://deb.debian.org/debian/pool/main

export LD_LIBRARY_PATH="$LIBS/usr/lib/x86_64-linux-gnu:$LIBS/lib/x86_64-linux-gnu"

find_chrome() { ls -d "$CHROME_DIR"/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | head -1; }

# ---------------------------------------------------------------- 1. chrome
CHROME=$(find_chrome)
if [ -z "$CHROME" ]; then
  echo ">> downloading Chromium (about 115 MB)..."
  python3 -m pip install --quiet playwright || exit 1
  python3 -m playwright install chromium || exit 1
  CHROME=$(find_chrome)
fi
[ -z "$CHROME" ] && { echo "!! could not find chrome-headless-shell"; return 1 2>/dev/null || exit 1; }

# ------------------------------------------------------------- 2. libraries
# Only bother if chrome can't already start.
if ! "$CHROME" --version >/dev/null 2>&1; then
  echo ">> unpacking shared libraries into $LIBS..."
  mkdir -p /tmp/deb "$LIBS"
  cd /tmp/deb || return 1

  # Resolve "<package> <pool-subdir>" pairs straight off the Debian mirror.
  # apt-get download is unusable: the package index is stale, so most versions
  # 404. Listing the pool directory and taking the newest amd64 file works.
  best() { curl -sL "$POOL/$2/" | grep -oP '(?<=href=")[^"]+\.deb(?=")' \
           | grep -E "^${1}_[0-9].*_amd64\.deb$" | sort -V | tail -1; }
  grab() {
    local f; f=$(best "$1" "$2")
    [ -z "$f" ] && { echo "   (skip) $1"; return 1; }
    curl -sL -o "$1.deb" "$POOL/$2/$f" 2>/dev/null
    file "$1.deb" 2>/dev/null | grep -q "Debian binary" || { echo "   (bad) $1"; return 1; }
    dpkg-deb -x "$1.deb" "$LIBS" 2>/dev/null && echo "   + $1"
  }

  for spec in \
    libnspr4:n/nspr libnss3:n/nss \
    libatk1.0-0t64:a/at-spi2-core libatspi2.0-0t64:a/at-spi2-core \
    libatk-bridge2.0-0:a/at-spi2-atk \
    libcups2t64:c/cups libasound2t64:a/alsa-lib \
    libxcomposite1:libx/libxcomposite libxdamage1:libx/libxdamage \
    libxfixes3:libx/libxfixes libxrandr2:libx/libxrandr \
    libxkbcommon0:libx/libxkbcommon libgbm1:mesa/mesa libdrm2:mesa/mesa \
    libpango-1.0-0:p/pango1.0 libcairo2:c/cairo \
    libxres1:libx/libxres libxi6:libx/libxi libxtst6:libx/libxtst \
    libxcursor1:libx/libxcursor libxinerama1:libx/libxinerama \
    libxshmfence1:libx/libxshmfence ; do
    grab "${spec%%:*}" "${spec##*:}" >/dev/null
  done

  # libnss3's newest version is often missing from the pool; fall back to
  # whatever the directory listing actually offers.
  if ! "$CHROME" --version >/dev/null 2>&1; then
    for v in $(curl -sL "$POOL/n/nss/" | grep -oP 'libnss3_[^"]*_amd64\.deb' | sort -V | tail -3); do
      curl -sL -o nss.deb "$POOL/n/nss/$v" 2>/dev/null
      file nss.deb 2>/dev/null | grep -q "Debian binary" && dpkg-deb -x nss.deb "$LIBS" 2>/dev/null && break
    done
  fi
fi

# ------------------------------------------------------------------ 3. check
if "$CHROME" --version 2>/dev/null | grep -q "Chrome"; then
  echo ">> ok: $("$CHROME" --version)"
  export CHROME
  return 0 2>/dev/null || exit 0
fi
echo "!! chrome still will not start:"
"$CHROME" --version 2>&1 | head -3
return 1 2>/dev/null || exit 1

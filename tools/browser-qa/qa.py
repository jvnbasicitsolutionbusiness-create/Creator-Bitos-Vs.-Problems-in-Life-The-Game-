#!/usr/bin/env python3
"""
qa.py — real-browser QA for Creator Bitos.

The Node test suite drives the game's *logic* through a canvas stub, which
cannot catch rendering mistakes, layout problems, or browser-only failures.
This script drives the real thing in headless Chromium.

Setup (once per session — the browser is not part of the workspace snapshot):

    source tools/browser-qa/setup-chrome.sh

Usage:

    python3 tools/browser-qa/qa.py                 # boot, click, report errors
    python3 tools/browser-qa/qa.py --shots          # also save screenshots
    python3 tools/browser-qa/qa.py --sandbox        # inside a sandboxed iframe
    python3 tools/browser-qa/qa.py --url http://localhost:3000/

Headless caveats that are NOT game bugs:
  * requestAnimationFrame is throttled without a compositor, so the frame rate
    here is meaningless (single digits is normal) and timing gaps of several
    seconds between callbacks are expected.
  * The renderer occasionally dies with "Target crashed" on long runs. Re-run;
    the scripts below keep each step short for that reason.
"""

import argparse
import os
import sys
import time

ARGS = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--mute-audio']

# Collect everything the page tries to tell us, including inside iframes.
HOOK = r"""
window.__qa = { errors: [], warns: [] };
window.addEventListener('error', function (e) {
  var s = '';
  try { s = (e.error && e.error.stack) ? e.error.stack
            : (e.message + ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0)); }
  catch (_) { s = String(e.message); }
  window.__qa.errors.push('ERROR ' + s);
}, true);
window.addEventListener('unhandledrejection', function (e) {
  var s = '';
  try { s = (e.reason && e.reason.stack) ? e.reason.stack : String(e.reason); }
  catch (_) { s = String(e.reason); }
  window.__qa.errors.push('REJECTION ' + s);
});
var _err = console.error;
console.error = function () {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) {
    var a = arguments[i];
    parts.push(a && a.stack ? a.stack : String(a));
  }
  window.__qa.errors.push('CONSOLE ' + parts.join(' '));
  _err.apply(console, arguments);
};
"""

PROBE = """(() => {
  const B = window.BITOS;
  const ls = (() => { try { localStorage.setItem('p','1'); return 'ok'; } catch (e) { return 'BLOCKED:' + e.name; } })();
  return {
    booted: !!B,
    scene: B?.manager?.currentName ?? null,
    scenes: B ? Object.keys(B.scenes || {}).length : 0,
    localStorage: ls,
    cryptoSubtle: (typeof crypto !== 'undefined' && !!crypto.subtle) ? 'ok' : 'MISSING',
    resources: performance.getEntriesByType('resource').length,
    failedResources: performance.getEntriesByType('resource')
      .filter(r => r.responseStatus >= 400 || r.responseStatus === 0)
      .map(r => r.name.split('/').pop() + ':' + r.responseStatus).slice(0, 5)
  };
})()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://localhost:3000/')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--sandbox', action='store_true', help='load inside a sandboxed iframe (opaque origin)')
    ap.add_argument('--wait', type=float, default=6.0)
    opts = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit('playwright is not installed. Run: pip install playwright && source tools/browser-qa/setup-chrome.sh')

    outdir = os.path.join(os.path.dirname(__file__), '..', '..', 'tools', 'out')
    outdir = os.path.normpath(outdir)
    os.makedirs(outdir, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        page = browser.new_page(viewport={'width': 1280, 'height': 780})
        page.add_init_script(HOOK)          # applies to iframes too

        if opts.sandbox:
            page.set_content(
                '<body style="margin:0;background:#000">'
                f'<iframe sandbox="allow-scripts" src="{opts.url}" width="1280" height="720" style="border:0"></iframe>'
                '</body>')
        else:
            page.goto(opts.url, wait_until='load')

        page.wait_for_timeout(int(opts.wait * 1000))
        target = page
        if opts.sandbox:
            frames = [f for f in page.frames if f != page.main_frame]
            if not frames:
                print('!! the iframe never attached'); browser.close(); return 1
            target = frames[0]

        report = {}
        try:
            report = target.evaluate(PROBE)
        except Exception as exc:
            print(f'!! could not probe the page: {type(exc).__name__} {str(exc)[:120]}')
            print('   (the renderer may have crashed — just re-run)')
            browser.close()
            return 1

        print('--- environment ---')
        print(f"  booted        : {report['booted']}")
        print(f"  scene         : {report['scene']}")
        print(f"  scenes loaded : {report['scenes']}")
        print(f"  localStorage  : {report['localStorage']}")
        print(f"  crypto.subtle : {report['cryptoSubtle']}")
        print(f"  resources     : {report['resources']}")
        if report['failedResources']:
            print(f"  FAILED        : {report['failedResources']}")

        try:
            errs = target.evaluate('window.__qa.errors')
        except Exception:
            errs = []
        print(f'--- {len(errs)} error(s) ---')
        for e in errs[:10]:
            print('  ' + e[:400].replace('\n', '\n    '))

        if opts.shots:
            name = 'sandbox' if opts.sandbox else 'direct'
            path = os.path.join(outdir, f'qa-{name}.png')
            try:
                page.screenshot(path=path, timeout=15000)
                print(f'--- screenshot: {path}')
            except Exception as exc:
                print(f'   screenshot failed ({type(exc).__name__}) — needs a compositor')

        browser.close()

    ok = report.get('booted') and not errs
    print('\nRESULT:', 'clean' if ok else 'PROBLEMS FOUND')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""macOS front end for runner.py — same CLI, two Linux-isms patched.

    python3 exercises/_runner/runner_mac.py launch --id UN3 --scene hammer

runner.py scans /proc for PIDs and probes /tmp/.X11-unix for a display; neither
exists here. HOWTO.md says to shim those in a wrapper rather than edit the file,
so that is all this does. The two traps it documents are both live:

  * `chrome` on PATH must be an exec WRAPPER SCRIPT, not a symlink — the .app
    resolves its framework relative to the executable path and a symlink dies
    in dlopen. Create one before first use:

        printf '#!/bin/sh\\nexec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@"\\n' > ~/bin/chrome
        chmod +x ~/bin/chrome

  * a pgrep needle must not begin with '--', or BSD pgrep swallows it as
    options, matches nothing, and reports "killed 0" while Chrome keeps running.
    Hence the needle below drops the leading dashes.
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import runner  # noqa: E402


def _pids_for(user_data_dir):
    """PIDs whose cmdline contains this instance's unique --user-data-dir."""
    needle = "user-data-dir=" + user_data_dir          # no leading '--'
    try:
        out = subprocess.run(["pgrep", "-f", needle],
                             capture_output=True, text=True)
    except OSError:
        return []
    return [int(x) for x in out.stdout.split() if x.strip().isdigit()]


runner._pids_for = _pids_for
runner._have_display = lambda: True                    # macOS always has one

if __name__ == "__main__":
    sys.exit(runner.main())

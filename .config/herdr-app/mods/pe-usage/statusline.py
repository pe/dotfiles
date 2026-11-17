#!/usr/bin/env python3
"""Claude Code's status line, silent: it prints nothing and keeps what Claude Code
tells it for the pe layout to read.

  ~/.local/state/pe-herdr/limits.json              the plan's limits: five_hour, seven_day
                                                    ({used_percentage, resets_at})
  ~/.local/state/pe-herdr/context/<terminal>.json    that Herdr terminal's context_window, model and effort

Set in ~/.claude/settings.json as
  "statusLine": {"type": "command", "command": "python3 -I ~/.config/herdr-app/mods/pe-usage/statusline.py"}"""

import json, os, re, sys

STATE = os.path.join(os.path.expanduser("~"), ".local", "state", "pe-herdr")


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, path)


def main():
    try:
        s = json.load(sys.stdin)
    except Exception:
        return
    limits = s.get("rate_limits")
    if isinstance(limits, dict):
        save(os.path.join(STATE, "limits.json"), {"five_hour": limits.get("five_hour"), "seven_day": limits.get("seven_day")})
    term = os.environ.get("HC_TERMINAL_ID", "")
    window = s.get("context_window")
    model = s.get("model")
    effort = s.get("effort")
    if re.fullmatch(r"[A-Za-z0-9_.-]+", term) and (isinstance(window, dict) or isinstance(model, dict)):
        save(os.path.join(STATE, "context", f"{term}.json"), {
            "session": s.get("session_id"),
            "used": window.get("used_percentage") if isinstance(window, dict) else None,
            "model": model.get("display_name") if isinstance(model, dict) else None,
            "effort": effort.get("level") if isinstance(effort, dict) else None,
        })


if __name__ == "__main__":
    main()

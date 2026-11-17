#!/usr/bin/env python3
"""Claude Code's subagent status line, silent: it prints nothing and keeps what Claude Code
tells it about each subagent for the pe layout to read.

  ~/.local/state/pe-herdr/context/<terminal>.agents.json
      {<agent id>: {model, effort, used, tokens, size}}  that Herdr terminal's subagents
                                                         (used: % of the context window)

Set in ~/.claude/settings.json as
  "subagentStatusLine": {"type": "command", "command": "python3 -I ~/.config/herdr-app/mods/pe-usage/subagent_statusline.py"}"""

import json, os, re, sys

EFFORT = re.compile(r'"perTurnEffort":"([a-z]+)"')


# A subagent's effort, as its transcript last says it (<session>/subagents/agent-<id>.jsonl);
# the payload doesn't carry it.
def effort_of(transcript, id):
    if not isinstance(transcript, str) or not transcript.endswith(".jsonl"):
        return None
    try:
        with open(os.path.join(transcript[:-6], "subagents", f"agent-{id}.jsonl"), "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 65536))
            found = EFFORT.findall(f.read().decode("utf-8", "replace"))
    except OSError:
        return None
    return found[-1] if found else None

STATE = os.path.join(os.path.expanduser("~"), ".local", "state", "pe-herdr")


def main():
    try:
        s = json.load(sys.stdin)
    except Exception:
        return
    term = os.environ.get("HC_TERMINAL_ID", "")
    tasks = s.get("tasks") if isinstance(s, dict) else None
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", term) or not isinstance(tasks, list):
        return
    out = {}
    for t in tasks:
        if not isinstance(t, dict) or not isinstance(t.get("id"), str):
            continue
        size, tokens = t.get("contextWindowSize"), t.get("tokenCount")
        ok = isinstance(size, (int, float)) and size > 0 and isinstance(tokens, (int, float))
        out[t["id"]] = {
            "model": t.get("model") if isinstance(t.get("model"), str) else None,
            "effort": effort_of(s.get("transcript_path"), t["id"]),
            "used": tokens / size * 100 if ok else None,
            "tokens": tokens if ok else None,
            "size": size if ok else None,
        }
    path = os.path.join(STATE, "context", f"{term}.agents.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(out, f)
    os.replace(tmp, path)


if __name__ == "__main__":
    main()

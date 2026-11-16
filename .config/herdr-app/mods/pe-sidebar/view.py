#!/usr/bin/env python3
"""A Claude Code subagent's transcript ($1, a .jsonl), readable and live: what it
says, each tool it calls on one line, and the start of each result. The sidebar
opens it in a peek over the tab when a subagent row is clicked."""

import json, sys, time

BOLD, CYAN, DIM, RESET = "\033[1m", "\033[36m", "\033[2m", "\033[0m"


def flat(s, n):
    return " ".join(str(s).split())[:n]


def show(j):
    if j.get("type") not in ("assistant", "user"):
        return
    content = (j.get("message") or {}).get("content")
    if isinstance(content, str):
        if not content.startswith(("<", "[SYSTEM")):
            print(f"\n{BOLD}› {content}{RESET}")
        return
    for c in content or []:
        kind = c.get("type")
        if kind == "text":
            print("\n" + c.get("text", ""))
        elif kind == "tool_use":
            i = c.get("input") or {}
            what = i.get("command") or i.get("description") or i.get("file_path") or i.get("pattern") or i.get("prompt") or json.dumps(i)
            print(f"{CYAN}⚙ {c.get('name')}{RESET} {flat(what, 160)}")
        elif kind == "tool_result":
            r = c.get("content")
            text = r if isinstance(r, str) else " ".join(x.get("text", "") for x in r or [] if isinstance(x, dict))
            print(f"{DIM}  ↳ {flat(text, 200)}{RESET}")


def main(path):
    try:
        with open(path[: -len(".jsonl")] + ".meta.json") as f:
            title = json.load(f).get("description") or "subagent"
    except Exception:
        title = "subagent"
    print(f"\033]0;Subagent: {title}\007", end="")
    with open(path, "rb") as f:
        while True:
            raw = f.readline()
            if not raw.endswith(b"\n"):
                f.seek(-len(raw), 1)  # half a line: read it again whole
                sys.stdout.flush()
                time.sleep(0.5)
                continue
            try:
                show(json.loads(raw))
            except Exception:
                pass


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except KeyboardInterrupt:
        pass

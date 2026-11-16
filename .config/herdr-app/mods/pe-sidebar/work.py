#!/usr/bin/env python3
"""What each Claude Code in a Herdr terminal has going on beside its own turn:
its subagents, background commands and monitors, and scheduled prompts
(cron jobs and /loop wakeups), and how much of its context window it has used.
Ported from herdr-over9k (MIT), read from Claude Code's own files:

  ~/.claude/sessions/<pid>.json        each running Claude Code: its session, folder
  the process's HC_TERMINAL_ID         the Herdr terminal it runs in
  ~/.claude/projects/<folder>/<session>.jsonl              its transcript
  ~/.claude/projects/<folder>/<session>/subagents/*.json[l]  its subagents
  $XDG_STATE_HOME/pe-herdr/context/<terminal>.json  its context, as its status line was
                                                    told (pe-usage/statusline.py)

Prints one JSON object keyed by terminal: {"t13": {"context": 42, "subagents": [...],
"tasks": [...]}}, only what still runs. A transcript only grows (to hundreds of MB):
what it says is kept in $XDG_STATE_HOME/pe-herdr/ (default ~/.local/state), with how
far it was read, and each run reads only what was added since. Python 3, standard
library only."""

import glob, hashlib, json, os, re, subprocess, time
from datetime import datetime

HOME = os.path.expanduser("~")
CLAUDE = os.path.join(HOME, ".claude")
STATE = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.join(HOME, ".local", "state"), "pe-herdr")
V = 3  # bump when the state's shape changes: old states are read anew
SLICE = 64 * 1024 * 1024  # at most this much of a transcript per run; the rest waits for the next
TOOLS = {"Bash", "Monitor", "CronCreate", "CronDelete", "ScheduleWakeup"}
# Lines worth parsing: tool calls, their results, and notices about tasks.
MARKS = (b'"tool_use"', b'"toolUseResult"', b"<task-id>", b"Successfully stopped task", b"agent-message from=")
# A task that ended: its notice carries a status (or a monitor expired), it was
# stopped, or (a subagent) it handed its report back.
NOTICE = re.compile(r"<task-id>([A-Za-z0-9]+)</task-id>(.{0,600})")
STOPPED = re.compile(r"Successfully stopped task: ([A-Za-z0-9]+)")
HANDBACK = re.compile(r'agent-message from=\\"([A-Za-z0-9]+)')
OUTPUT = re.compile(r"Output is being written to: (\S+?\.output)")


def seconds(ts):
    try:
        return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (OSError, ValueError):
        return False


# The Herdr terminal a process runs in: Linux from its environment, macOS from ps.
def terminal_of(pid):
    try:
        with open(f"/proc/{pid}/environ", "rb") as f:
            for kv in f.read().split(b"\0"):
                if kv.startswith(b"HC_TERMINAL_ID="):
                    return kv.split(b"=", 1)[1].decode()
        return None
    except FileNotFoundError:
        pass
    except OSError:
        return None
    try:
        out = subprocess.run(["ps", "-wwE", "-p", str(pid), "-o", "command="], capture_output=True, text=True, timeout=3).stdout
        m = re.search(r"(?:^|\s)HC_TERMINAL_ID=(\S+)", out)
        return m.group(1) if m else None
    except Exception:
        return None


def transcript_of(session, cwd):
    if cwd:
        p = os.path.join(CLAUDE, "projects", re.sub(r"[^A-Za-z0-9]", "-", cwd), f"{session}.jsonl")
        if os.path.isfile(p):
            return p
    found = glob.glob(os.path.join(CLAUDE, "projects", "*", f"{session}.jsonl"))
    return found[0] if found else None


def fresh(head):
    return {"v": V, "head": head, "offset": 0, "uses": {}, "shells": {}, "monitors": {}, "crons": {}, "deleted": [], "wake": None, "ended": {}}


# Reads what was added to a transcript since its state's offset, whole lines only.
def update(path):
    os.makedirs(STATE, exist_ok=True)
    sf = os.path.join(STATE, hashlib.sha1(path.encode()).hexdigest()[:16] + ".json")
    with open(path, "rb") as f:
        head = hashlib.sha1(f.read(4096)).hexdigest()
        size = f.seek(0, 2)
        try:
            with open(sf) as s:
                st = json.load(s)
        except Exception:
            st = None
        # One written anew (shorter, or starting differently) is read from the top.
        if not st or st.get("v") != V or st.get("head") != head or st.get("offset", 0) > size:
            st = fresh(head)
        if st["offset"] == size:
            return st
        f.seek(st["offset"])
        data = f.read(SLICE)
    end = data.rfind(b"\n") + 1  # a line still being written waits
    for raw in data[:end].split(b"\n"):
        if any(m in raw for m in MARKS):
            line(st, raw)
    st["offset"] += end
    # A call that never got its result (interrupted) is forgotten after a day.
    now = time.time()
    st["uses"] = {k: u for k, u in st["uses"].items() if now - u["t"] < 86400}
    tmp = f"{sf}.{os.getpid()}"
    with open(tmp, "w") as s:
        json.dump(st, s)
    os.replace(tmp, sf)
    return st


def line(st, raw):
    text = raw.decode("utf-8", "replace")
    try:
        j = json.loads(text)
    except Exception:
        return
    t = seconds(j.get("timestamp") or "") or int(time.time())
    for m in NOTICE.finditer(text):
        if "<status>" in m.group(2) or "Monitor expired" in m.group(2):
            st["ended"][m.group(1)] = t
    for rx in (STOPPED, HANDBACK):
        for m in rx.finditer(text):
            st["ended"][m.group(1)] = t
    content = (j.get("message") or {}).get("content")
    if j.get("type") == "assistant" and isinstance(content, list):
        for c in content:
            if c.get("type") == "tool_use" and c.get("name") in TOOLS:
                i = c.get("input") or {}
                st["uses"][c["id"]] = {"n": c["name"], "t": t, **{k: i[k] for k in ("description", "command", "prompt", "reason", "id") if isinstance(i.get(k), str)}}
        return
    r = j.get("toolUseResult")
    if j.get("type") != "user" or not isinstance(r, dict) or not isinstance(content, list) or not content:
        return
    tid = content[0].get("tool_use_id", "")
    use = st["uses"].pop(tid, None)
    if not use:
        return
    if r.get("backgroundTaskId"):
        out = OUTPUT.search(json.dumps(content[0].get("content")))
        st["shells"][r["backgroundTaskId"]] = {"desc": use.get("description") or use.get("command") or "Background command", "start": t, "output": out.group(1) if out else None}
    elif r.get("taskId") and use["n"] == "Monitor":
        out = OUTPUT.search(json.dumps(content[0].get("content")))
        st["monitors"][r["taskId"]] = {"desc": use.get("description") or "Monitor", "start": t, "until": t + (r.get("timeoutMs") or 300000) // 1000, "output": out.group(1) if out else None}
    elif r.get("scheduledFor") and use["n"] == "ScheduleWakeup":
        st["wake"] = {"id": tid, "desc": use.get("reason") or "Wakeup", "start": t, "at": r["scheduledFor"] // 1000}
    elif r.get("humanSchedule") and r.get("id"):
        st["crons"][r["id"]] = {"desc": use.get("prompt") or "", "start": t, "schedule": r["humanSchedule"], "recurring": bool(r.get("recurring")), "next": (r.get("nextFireAt") or 0) // 1000}
    elif use["n"] == "CronDelete" and use.get("id"):
        st["deleted"].append(use["id"])


# Its context as % used, as Claude Code last told its status line, if that was
# this session (a terminal can run another since).
def context(term, session):
    try:
        with open(os.path.join(STATE, "context", f"{term}.json")) as f:
            c = json.load(f)
    except Exception:
        return None
    return round(c["used"]) if c.get("session") == session and isinstance(c.get("used"), (int, float)) else None


def tasks(st, now):
    out = []
    for kind, group in (("shell", st["shells"]), ("monitor", st["monitors"])):
        for id, x in group.items():
            if id not in st["ended"] and (kind == "shell" or x["until"] > now):
                out.append({"kind": kind, "id": id, "desc": x["desc"], "start": x["start"], "output": x["output"]})
    for id, x in st["crons"].items():
        # A recurring one lasts 7 days; a one-off until its time.
        if id not in st["deleted"] and (x["next"] > now - 120 if not x["recurring"] else now - x["start"] < 7 * 86400):
            out.append({"kind": "cron", "id": id, "desc": x["desc"], "start": x["start"], "schedule": x["schedule"]})
    w = st["wake"]
    if w and w["at"] > now:
        out.append({"kind": "wakeup", "id": w["id"], "desc": w["desc"], "start": w["start"], "at": w["at"]})
    return out


# Subagents still running: not marked finished, no notice since they last wrote,
# and written to in the last half hour (older ones are leftovers).
def subagents(path, st, now):
    out = []
    for meta in glob.glob(os.path.join(path[:-6], "subagents", "*.meta.json")):
        file = meta[: -len(".meta.json")] + ".jsonl"
        try:
            with open(meta) as f:
                m = json.load(f)
            at = int(os.path.getmtime(file))
            with open(file, "rb") as f:
                start = seconds(json.loads(f.readline()).get("timestamp") or "") or at
        except Exception:
            continue
        sid = os.path.basename(meta).split(".")[0].removeprefix("agent-")
        ended = st["ended"].get(sid)
        if m.get("finished") or (ended and at <= ended + 5) or now - at > 1800:
            continue
        out.append({"id": sid, "desc": m.get("description") or m.get("agentType") or "Subagent", "start": start, "file": file})
    return sorted(out, key=lambda x: x["start"])


def main():
    now = int(time.time())
    found = {}
    for sfile in glob.glob(os.path.join(CLAUDE, "sessions", "*.json")):
        try:
            with open(sfile) as f:
                s = json.load(f)
            pid = int(s["pid"])
        except Exception:
            continue
        if not alive(pid):
            continue
        term = terminal_of(pid)
        path = transcript_of(s.get("sessionId"), s.get("cwd")) if term and re.fullmatch(r"[A-Za-z0-9_.-]+", term) else None
        if not path:
            continue
        try:
            st = update(path)
        except OSError:
            continue
        found[term] = {"context": context(term, s.get("sessionId")), "subagents": subagents(path, st, now), "tasks": tasks(st, now)}
    # States of transcripts not read for a week go, and terminals' contexts not told.
    for old in glob.glob(os.path.join(STATE, "*.json")) + glob.glob(os.path.join(STATE, "context", "*.json")):
        if now - os.path.getmtime(old) > 7 * 86400:
            os.remove(old)
    print(json.dumps(found))


if __name__ == "__main__":
    main()

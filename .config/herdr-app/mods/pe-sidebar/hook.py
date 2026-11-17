#!/usr/bin/env python3
"""Claude Code hook: keeps what a Claude Code in a Herdr terminal has going on beside
its own turn (its subagents, background commands and monitors, scheduled prompts and
wakeups) in ~/.local/state/pe-herdr/work/<terminal>.json, for the pe-sidebar to read.
Prints nothing. The terminal is the hook's HC_TERMINAL_ID.

  SessionStart, SessionEnd    a session begins with nothing; ends with its file gone
  SubagentStart/SubagentStop  a subagent runs; it stops, and stays listed only while
                              background work is still running (it may resume)
  Stop                        the session's running tasks, as Claude Code lists them
  PostToolUse                 what a Bash, Monitor, CronCreate/CronDelete or
                              ScheduleWakeup call started, and what a TaskStop ended

Set in ~/.claude/settings.json as "hooks": {"<Event>": [{"hooks": [{"type": "command",
"async": true, "command": "python3 -I ~/.config/herdr-app/mods/pe-sidebar/hook.py"}]}]},
PostToolUse with "matcher": "Monitor|CronCreate|CronDelete|ScheduleWakeup|TaskStop", and with
"matcher": "Bash" through a filter that starts this only for a command run in the background
(most are not; see settings.json).
Python 3, standard library only."""

import fcntl, glob, json, os, re, sys, time

STATE = os.path.join(os.path.expanduser("~"), ".local", "state", "pe-herdr")
WORK = os.path.join(STATE, "work")
CONTEXT = os.path.join(STATE, "context")


def fresh(session):
    return {"session": session, "subagents": {}, "tasks": {}, "crons": {}, "wake": None}


def load(path):
    try:
        with open(path) as f:
            st = json.load(f)
        return st if isinstance(st, dict) else None
    except Exception:
        return None


def save(path, st):
    tmp = f"{path}.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(st, f)
    os.replace(tmp, path)


def remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


# An id as Claude Code gives it, if it can go into a path.
def plain(id):
    return id if isinstance(id, str) and re.fullmatch(r"[A-Za-z0-9_-]+", id) else None


def first_line(text):
    return str(text or "").split("\n")[0].strip()


# A subagent's transcript, beside the session's: <session>/subagents/agent-<id>.jsonl.
def subagent_file(s, agent):
    tp = s.get("transcript_path")
    return os.path.join(tp[:-6], "subagents", f"agent-{agent}.jsonl") if isinstance(tp, str) and tp.endswith(".jsonl") else None


# The description a subagent was given, from the file Claude Code keeps beside its transcript.
def subagent_desc(file):
    try:
        with open(file[:-6] + ".meta.json") as f:
            return json.load(f).get("description")
    except Exception:
        return None


# A background command's output: Claude Code's tasks folder, beside the session's scratchpad.
def output_of(s, task):
    pad = s.get("scratchpad_dir")
    return os.path.join(os.path.dirname(pad), "tasks", f"{task}.output") if isinstance(pad, str) and pad else None


# The tasks Claude Code lists as running (Stop and SubagentStop carry them).
def running(s):
    tasks = s.get("background_tasks")
    return [t for t in tasks if isinstance(t, dict) and t.get("status") == "running" and isinstance(t.get("id"), str)] if isinstance(tasks, list) else None


def sync(st, s, now):
    tasks = running(s)
    if tasks is None:
        return None
    ids = {t["id"] for t in tasks}
    for t in tasks:
        if t.get("type") in ("shell", "monitor") and t["id"] not in st["tasks"]:
            st["tasks"][t["id"]] = {"kind": t["type"], "desc": first_line(t.get("description") or t.get("command")) or "Background task", "start": now, "output": output_of(s, t["id"])}
        if t.get("type") == "subagent":
            # One the hooks didn't see start (the session began before them) is listed here.
            sub = st["subagents"].setdefault(t["id"], {"type": t.get("agent_type"), "desc": None, "start": now, "file": subagent_file(s, t["id"]), "waiting": False}) if plain(t["id"]) else None
            if sub and t.get("description"):
                sub["desc"] = first_line(t["description"])
    # What it no longer lists has ended.
    for id in [i for i in st["tasks"] if i not in ids]:
        del st["tasks"][id]
    return tasks


# Whether a subagent is waiting on background work: a task it started still runs.
def waits(st, agent):
    return agent in st["subagents"] and any(t.get("owner") == agent for t in st["tasks"].values())


def event(st, s, name, now):
    agent = plain(s.get("agent_id"))
    # (Claude Code's own helpers stop too, with no type: not subagents.)
    named = bool(agent) and bool(s.get("agent_type"))
    if name == "SubagentStart" and named:
        old = st["subagents"].get(agent, {})
        file = subagent_file(s, agent)
        st["subagents"][agent] = {
            "type": s.get("agent_type"),
            "desc": old.get("desc") or (file and subagent_desc(file)) or s.get("agent_type"),
            "start": old.get("start") or now,
            "file": file,
            "waiting": False,
        }
    elif name == "SubagentStop":
        tasks = sync(st, s, now)
        sub = st["subagents"].get(agent) if named else None
        if sub:
            # It stopped, but with its own background work still running it resumes.
            if tasks is not None and waits(st, agent):
                sub["waiting"] = True
            else:
                del st["subagents"][agent]
    elif name == "Stop":
        tasks = sync(st, s, now)
        if tasks is not None:
            # One that was interrupted never says it stopped: it's no longer listed (one
            # waiting on background work isn't listed either, while that runs).
            listed = {t["id"] for t in tasks}
            for id in [i for i in st["subagents"] if i not in listed and not (st["subagents"][i].get("waiting") and waits(st, i))]:
                del st["subagents"][id]
    elif name == "PostToolUse":
        tool, inp, resp = s.get("tool_name"), s.get("tool_input") or {}, s.get("tool_response")
        if not isinstance(resp, dict) or not isinstance(inp, dict):
            return
        if tool == "Bash" and resp.get("backgroundTaskId"):
            id = resp["backgroundTaskId"]
            st["tasks"][id] = {"kind": "shell", "desc": first_line(inp.get("description") or inp.get("command")) or "Background command", "start": now, "owner": agent, "output": output_of(s, id)}
        elif tool == "Monitor" and resp.get("taskId"):
            id = resp["taskId"]
            # A persistent one runs until it is stopped; the others until their time.
            until = None if resp.get("persistent") else now + (resp.get("timeoutMs") or 300000) // 1000
            st["tasks"][id] = {"kind": "monitor", "desc": first_line(inp.get("description")) or "Monitor", "start": now, "until": until, "owner": agent, "output": output_of(s, id)}
        elif tool == "CronCreate" and resp.get("id"):
            st["crons"][resp["id"]] = {"desc": inp.get("prompt") or "", "start": now, "schedule": resp.get("humanSchedule") or "", "recurring": bool(resp.get("recurring")), "next": (resp.get("nextFireAt") or 0) // 1000}
        elif tool == "CronDelete":
            st["crons"].pop(inp.get("id"), None)
        elif tool == "TaskStop":
            # A command or a subagent that was stopped says nothing else.
            for id in (resp.get("task_id"), inp.get("task_id"), inp.get("shell_id")):
                st["tasks"].pop(id, None)
                st["subagents"].pop(id, None)
        elif tool == "ScheduleWakeup" and resp.get("scheduledFor"):
            st["wake"] = {"id": s.get("tool_use_id") or "wake", "desc": inp.get("reason") or "Wakeup", "start": now, "at": resp["scheduledFor"] // 1000}


def main():
    try:
        s = json.load(sys.stdin)
    except Exception:
        return
    name = s.get("hook_event_name") if isinstance(s, dict) else None
    term = os.environ.get("HC_TERMINAL_ID", "")
    if not name or not re.fullmatch(r"[A-Za-z0-9_.-]+", term):
        return
    os.makedirs(WORK, exist_ok=True)
    path = os.path.join(WORK, f"{term}.json")
    now = int(time.time())
    session = s.get("session_id")
    # Hooks run at once, each on its own: one at a time per terminal.
    with open(f"{path}.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        st = load(path)
        context = os.path.join(CONTEXT, f"{term}.json")
        if name == "SessionEnd":
            if st and st.get("session") == session:
                remove(path)
                remove(context)
                remove(os.path.join(CONTEXT, f"{term}.agents.json"))
            return
        if name == "SessionStart":
            if not (st and st.get("session") == session and s.get("source") == "compact"):
                # What the status line kept of an earlier session goes; the new one's may be there already.
                if (load(context) or {}).get("session") != session:
                    remove(context)
                    remove(os.path.join(CONTEXT, f"{term}.agents.json"))
                st = fresh(session)
            # Terminals not heard from for a week go.
            for old in glob.glob(os.path.join(WORK, "*")) + glob.glob(os.path.join(CONTEXT, "*")):
                if now - os.path.getmtime(old) > 7 * 86400:
                    remove(old)
        else:
            # A session the hooks didn't see begin (started before them), or another one in this terminal.
            if not st or st.get("session") != session:
                st = fresh(session)
            event(st, s, name, now)
        save(path, st)


if __name__ == "__main__":
    main()

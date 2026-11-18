// Spaces with their tabs under them, agents and terminals alike. Under each tab, its
// sub-agents (`hc run`) and what a Claude Code there runs beside its turn: subagents,
// background commands, scheduled prompts (hook.py's files); on the tab, a line for its agent
// (model, effort unless medium, context used); on the space, a line of its folder's git
// (branch, and status as starship's). Sets the window's title to "Herdr · space · session". Click to
// show, right-click for its menu, drag a space to reorder. Worktree spaces sit under their
// main checkout's; folding a main space folds them in too.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, agents, terminals, focused, run, openOverlay, exec, hc, appHome, theme, shared, setShared, setAgentOrder, setWindowTitle, watchFolder, readTextFile, home, window, checking } from "herdr";

const ICONS = "mods/workspace-chrome";

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function where(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
// A space's name and its git tail never shrink below this, so a short one ("api")
// stays readable instead of turning into an ellipsis next to a long branch.
const SIDE_MIN = 48;
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;
// What the hooks (hook.py) and the status line (pe-usage/statusline.py) keep for each Claude Code.
const STATE = () => `${home()}/.local/state/pe-herdr`;

// A terminal's work as rows to show now: its subagents (as hook.py keeps them) and its
// background tasks, minus what has run out by itself (a monitor's time, a wakeup, a one-off cron).
function workRows(w, now, agents) {
  const sec = now / 1000;
  const subagents = Object.entries(w?.subagents ?? {})
    .map(([id, x]) => ({ id, desc: x.desc || x.type || "Subagent", start: x.start, file: x.file, ...agents?.[id] }))
    .sort((a, b) => a.start - b.start);
  const tasks = [
    ...Object.entries(w?.tasks ?? {})
      .filter(([, x]) => x.kind !== "monitor" || !x.until || x.until > sec)
      .map(([id, x]) => ({ kind: x.kind, id, desc: x.desc, start: x.start, output: x.output })),
    // A recurring cron lasts 7 days; a one-off until its time.
    ...Object.entries(w?.crons ?? {})
      .filter(([, x]) => (x.recurring ? sec - x.start < 7 * 86400 : x.next > sec - 120))
      .map(([id, x]) => ({ kind: "cron", id, desc: x.desc, start: x.start, schedule: x.schedule })),
    ...(w?.wake && w.wake.at > sec ? [{ kind: "wakeup", ...w.wake }] : []),
  ];
  return { subagents, tasks };
}

const readJson = async (path) => {
  try { return JSON.parse((await readTextFile(path)) ?? "null"); } catch { return null; }
};

// Places looked at together (two git runs each).
const AT_ONCE = 6;

// All runs, finished: a place isn't done while one of its runs still holds a slot.
async function both(...runs) {
  const done = await Promise.allSettled(runs);
  const failed = done.find((d) => d.status === "rejected");
  if (failed) throw failed.reason;
  return done.map((d) => d.value);
}

// `git status --porcelain=v2 --branch --show-stash`, counted as starship's git_status does.
function parseStatus(out) {
  const n = { conflicted: 0, stashed: 0, deleted: 0, renamed: 0, modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0 };
  for (const l of out.split("\n")) {
    if (l.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(l);
      if (m) [n.ahead, n.behind] = [Number(m[1]), Number(m[2])];
    } else if (l.startsWith("# stash ")) n.stashed = Number(l.slice(8)) || 0;
    else if (l.startsWith("? ")) n.untracked++;
    else if (l.startsWith("u ")) n.conflicted++;
    else if (l[0] === "1" || l[0] === "2") {
      const x = l[2], y = l[3];
      if (x === "D" || y === "D") n.deleted++;
      if (l[0] === "2" && (x === "R" || y === "R")) n.renamed++;
      if (y === "M") n.modified++;
      if ("AMTC".includes(x)) n.staged++;
    }
  }
  return n;
}

// The same marks as starship.toml's [git_status], in its order.
function statusMarks(n) {
  const diverged = n.ahead > 0 && n.behind > 0;
  return [
    n.conflicted && `☹︎${n.conflicted}`,
    n.stashed && `⚑${n.stashed}`,
    n.deleted && `✘${n.deleted}`,
    n.renamed && `»${n.renamed}`,
    n.modified && `+${n.modified}`,
    n.staged && `•${n.staged}`,
    n.untracked && `?${n.untracked}`,
    diverged ? `⇡${n.ahead}⇣${n.behind}` : n.ahead > 0 ? `⇡${n.ahead}` : n.behind > 0 ? `⇣${n.behind}` : "",
  ].filter(Boolean).join("");
}

// A model's id, as a subagent reports it, named as an agent's is: "claude-opus-4-7[1m]" -> "Opus 4.7 1M".
const shortId = (m) => {
  const size = /\[(\d+[mk])\]$/i.exec(m)?.[1];
  const name = m.replace(/\[.*\]$/, "").replace(/^claude-/, "").replace(/^([a-z]+)-(\d+)-(\d+)$/, "$1 $2.$3");
  return name.replace(/^./, (c) => c.toUpperCase()) + (size ? ` ${size.toUpperCase()}` : "");
};

// 31971 -> "32k".
const kilo = (n) => `${Math.round(n / 1000)}k`;

// "Opus 4.7 (1M context)" -> "Opus 4.7 1M".
const shortModel = (m) => m.replace(/\s*\((\d+[MK]) context\)/i, " $1").replace(/\s*\(.*\)$/, "");

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✳ Fix login", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// Each tab's lead pane: its first agent, else its focused terminal, else its first terminal.
function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

// A tab's name: one someone gave it, else its agent's or program's own title, else the program.
function tabTitle(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== l?.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  if (tab.named && tab.name !== prog) return tab.name;
  return telling ? live : prog || tab.name;
}

// "sudo -Hu root vim x ~" -> "vim x ~": sudo and its options, those that take a value included.
function unsudo(cmd) {
  const w = cmd.split(/\s+/);
  if (w[0] !== "sudo") return cmd;
  let i = 1;
  while (i < w.length && w[i].startsWith("-")) {
    if (w[i] === "--") { i++; break; }
    i += !w[i].startsWith("--") && /[ughpCDRTUrt]$/.test(w[i]) ? 2 : 1;
  }
  return w.slice(i).join(" ") || cmd;
}

// A sub-agent's name: the one it was given, else its own title, else its program.
const kidTitle = (k) => k.name || clean(k.title) || k.template || k.program?.name || k.address;

// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

// Live sub-agents of `addr`, depth first, each with the tree lines in front of it;
// `more`: rows follow them at the top level, so none of these is the last.
function tree(all, addr, lead = [], more = false) {
  // (Not the sidebar's own live views: labelled pe=view.)
  const kids = all.filter((k) => k.parent === addr && k.state === "live" && k.labels?.pe !== "view");
  return kids.flatMap((k, i) => {
    const last = i === kids.length - 1 && !more;
    return [
      { t: k, lines: [...lead, last ? "└" : "├"] },
      ...tree(all, k.address, [...lead, last ? "" : "│"]),
    ];
  });
}

// What the hooks found, as rows: each kind's icon, and what its row says on the right.
const WORK = {
  subagent: { icon: "mods/pe-sidebar/subagent.svg", tip: "Subagent" },
  shell: { icon: `${ICONS}/terminal.svg`, tip: "Background command" },
  monitor: { icon: `${ICONS}/terminal.svg`, tip: "Monitor" },
  cron: { icon: `${ICONS}/clock.svg`, tip: "Scheduled prompt" },
  wakeup: { icon: `${ICONS}/clock.svg`, tip: "Wakeup" },
};

// "<1m", "12m", "3h", "2d".
function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// Herdr's status marks: a spinner while working, "!" when blocked, a dot when done, a ring when idle.
function status(t, s) {
  if (s === "working") return svg(`${ICONS}/spinner.svg`).size(12).mx(1).flex_none().text_color(t.working).spin(900);
  if (s === "blocked") return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
  if (s === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  if (s === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done);
  return div().w(14).flex_none();
}

// Tab rows start under the space's name: past its avatar and the gap.
const TAB_INDENT = 27;

export default class Sidebar extends View {
  init(_props, cx) {
    this.git = {}; // where() or a tab's folder -> { name, branch, ahead, behind, repo, linked, st }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.at = {}; // space -> its where() at the last look
    this.watching = new Map(); // local repos' pending folder watches
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.hovered = null;
    this.scroll = ScrollHandle.new(); // the list's position: the shown tab is brought into view through it
    this.activeAt = -1; // the shown tab's place among the list's children, -1 when not drawn
    this.work = {}; // terminal -> { context, model, effort, subagents, tasks }, as read from the state folder
    this.viewers = {}; // subagent id or task id -> the terminal showing it live
    // Folded spaces and folded sub-agent trees, by space id / terminal address.
    try { this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]")); } catch { this.folded = new Set(); }
    if (checking()) return;
    // Refresh only when the refs could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
    this.watchWork(cx);
    // What runs out by itself (a monitor's time, a wakeup), and rows' ages, move on without a change.
    cx.timer.every(30000, (cx) => { if (Object.keys(this.work).length) { this.refreshWork(cx); cx.notify(); } });
  }

  async close() {
    setWindowTitle(null);
    for (const t of Object.values(this.viewers)) run("terminal.kill", { terminal: t });
  }

  // Reads what the hooks and the status line keep when it changes: they write a file per
  // terminal, in work/ and context/.
  watchWork(cx) {
    cx.spawn(async (cx) => {
      await exec("mkdir", ["-p", `${STATE()}/work`, `${STATE()}/context`]).catch(() => {});
      this.refreshWork(cx);
      for (const dir of ["work", "context"]) {
        cx.spawn(async (cx) => {
          for (;;) {
            try { await watchFolder(`${STATE()}/${dir}`); } catch { await cx.sleep(5000); continue; }
            this.refreshWork(cx);
          }
        });
      }
    });
  }

  // The state of each terminal running a Claude Code; the window redraws if it changed.
  refreshWork(cx) {
    if (this.reading) {
      this.again = true;
      return;
    }
    this.reading = true;
    cx.spawn(async (cx) => {
      try {
        const now = Date.now();
        const next = {};
        await Promise.all(panes().filter((p) => p.terminal && p.program?.key === "claude").map((p) => p.terminal).map(async (t) => {
          const [w, c, a] = await Promise.all([readJson(`${STATE()}/work/${t}.json`), readJson(`${STATE()}/context/${t}.json`), readJson(`${STATE()}/context/${t}.agents.json`)]);
          if (!w && !c) return;
          next[t] = {
            context: typeof c?.used === "number" ? Math.round(c.used) : null,
            model: c?.model ?? null,
            effort: c?.effort ?? null,
            ...workRows(w, now, a),
          };
        }));
        const text = JSON.stringify(next);
        if (text !== this.workText) {
          this.workText = text;
          this.work = next;
          this.prune();
          cx.notify();
        }
      } catch {}
      this.reading = false;
      if (this.again) {
        this.again = false;
        this.refreshWork(cx);
      }
    });
  }

  // Live views of what no longer runs stop.
  prune() {
    const running = new Set(Object.values(this.work).flatMap((w) => [...w.subagents.map((x) => `subagent-${x.id}`), ...w.tasks.map((x) => `${x.kind}-${x.id}`)]));
    for (const [key, t] of Object.entries(this.viewers)) {
      if (running.has(key)) continue;
      run("terminal.kill", { terminal: t });
      delete this.viewers[key];
    }
  }

  // A live view (a subagent's transcript, a command's output) in a peek over the tab;
  // one terminal per `key`, so a second click shows the same one.
  view(key, argv, cx) {
    cx.spawn(async (cx) => {
      const open = this.viewers[key];
      if (open && terminals().some((k) => k.address === open && k.state === "live")) return run("terminal.peek", { terminal: open });
      const r = await hc(["run", "--bg", "--json", "--label", "pe=view", "--", ...argv]).catch(() => null);
      let t = null;
      try { t = JSON.parse(r?.stdout ?? "").address; } catch {}
      if (!t) return;
      this.viewers[key] = t;
      // A moment for the window to know the new terminal, else the peek is empty.
      await cx.sleep(500);
      run("terminal.peek", { terminal: t });
    });
  }

  // A row for what the hooks found, under the tab: its icon, what it is, and its age,
  // its schedule or when it wakes. A subagent or a command with output opens live.
  workRow(t, x, lines, nested) {
    const kind = WORK[x.kind];
    const now = Date.now();
    const right = x.kind === "cron" ? x.schedule : x.kind === "wakeup" ? `in ${duration(x.at * 1000 - now)}` : duration(now - x.start * 1000);
    const live = x.kind === "subagent" ? (x.file ? ["python3", "-I", `${appHome()}/mods/pe-sidebar/view.py`, x.file] : null)
      : x.output ? ["sh", "-c", 'printf "\\033]0;%s\\007" "$2"; exec tail -n +1 -F "$1"', "sh", x.output, x.desc] : null;
    const row = h_flex()
      .id(`work-${x.kind}-${x.id}`)
      .h(24)
      .flex_none()
      .pl(8 + TAB_INDENT + (nested ? 22 : 0) + 6)
      .pr(8)
      .items_center()
      .rounded(8)
      .text_size(12.5)
      .children(lines.map((l) => div().self_start().mt(-4).w(9).h(16).mr(4).flex_none()
        .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6))))
      .child(svg(kind.icon).size(13).mr(7).flex_none().text_color(t.dim))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(x.desc.split("\n")[0]))
      .child(div().ml(8).flex_none().text_size(11).text_color(t.dim).child(right));
    // A subagent's model, effort (unless medium) and context, under its row.
    const effort = x.effort && x.effort !== "medium" ? x.effort : null;
    const tip = `${kind.tip}: ${x.desc}`;
    const open = (el) => el.when(Boolean(live), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.view(`${x.kind}-${x.id}`, live, cx)));
    if (x.kind !== "subagent" || !(x.model || effort || x.used != null)) return open(row).tooltip(tip);
    const used = x.used == null ? null : Math.round(x.used);
    // Tooltip, hover and click sit on the wrapper, so they cover both lines.
    return open(v_flex().id(`work-box-${x.kind}-${x.id}`).flex_none().rounded(8).tooltip(tip))
      .child(row)
      .child(h_flex().h(15).mb(2).pl(8 + TAB_INDENT + (nested ? 22 : 0) + 6).pr(8).items_center().text_size(11).text_color(t.dim).overflow_hidden()
        .children(lines.map((l) => div().w(9).h(15).mr(4).flex_none()
          .when(l === "├" || l === "│", (el) => el.border_l(1.5).border_color(t.input))))
        .child(div().w(20).flex_none())
        .child(h_flex().gap(6).items_center()
          .when(Boolean(x.model), (m) => m.child(div().flex_none().child(shortId(x.model))))
          .when(Boolean(effort), (m) => m.child(div().flex_none().text_color(t.muted).child(effort)))
          .when(used != null, (m) => m.child(div().id(`sub-ctx-${x.id}`).flex_none()
            .when(used >= 50, (c) => c.text_color(used >= 80 ? t.ansi1 : t.ansi3))
            .tooltip(x.tokens != null ? `Context used: ${kilo(x.tokens)} of ${kilo(x.size)} tokens` : "Context used").child(`${used}%`)))));
  }

  fold(key, cx) {
    this.folded.has(key) ? this.folded.delete(key) : this.folded.add(key);
    localStorage.setItem("folded", JSON.stringify([...this.folded]));
    cx.notify();
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const ps = panes();
    const due = this.due(now, sp, ps);
    // A Claude Code started or gone: read its state.
    const claude = ps.filter((p) => p.terminal && p.program?.key === "claude").map((p) => p.terminal).sort().join();
    if (claude !== this.claude) {
      this.claude = claude;
      this.refreshWork(cx);
    }
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), and repos
  // in view whose fallback is due.
  due(now, sp, ps) {
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter(Boolean));
    // The folder of each tab's lead pane, for the status under its row.
    for (const l of leadPanes(ps).values()) if (l.cwd) keys.add(l.cwd);
    for (const k of Object.keys(this.git)) if (!keys.has(k)) {
      delete this.git[k];
      delete this.checked[k];
    }
    const repos = new Set(Object.values(this.git).filter(Boolean).map((g) => g.repo));
    for (const [repo, pending] of this.watching) if (!repos.has(repo)) {
      this.watching.delete(repo);
      pending.cancel();
    }
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) {
        for (const k of [at[spaceOf[p.tab].id], keys.has(p.cwd) ? p.cwd : null]) if (k) this.sameRepo(k, keys).forEach((r) => due.add(r));
      }
    }
    this.busy = busy;
    if (window().active) {
      for (const k of keys) if (this.git[k] && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(AT_ONCE, keys.length) }, async () => {
          while (next < keys.length) await this.check(keys[next++], cx);
        }));
      }
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo, and its status (`st`).
  async check(cwd, cx) {
    this.checked[cwd] = Date.now();
    try {
      // Ref-only reads avoid scanning the worktree or waking its index watch.
      const [r, common] = await both(
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd }),
        exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd }),
      );
      if (r.code !== 0 || common.code !== 0) {
        this.git[cwd] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
      // The status takes no optional locks: it must not rewrite the index, or the watch on the repo would fire again.
      const [branch, counts, status] = await both(
        exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd }),
        exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd }),
        exec("git", ["--no-optional-locks", "status", "--porcelain=v2", "--branch", "--show-stash"], { cwd }),
      );
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
      this.git[cwd] = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo, linked: repo !== `${top}/.git`, st: status.code === 0 ? parseStatus(status.stdout) : null };
      this.watch(repo, cx);
    } catch {
      this.git[cwd] ??= null;
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    const pending = watchFolder(repo);
    this.watching.set(repo, pending);
    cx.spawn(async (cx) => {
      let current = pending;
      try {
        for (;;) {
          await current;
          if (this.watching.get(repo) !== current) return;
          const keys = Object.keys(this.git).filter((k) => this.git[k]?.repo === repo);
          if (!keys.length) break;
          this.refreshGit(keys, cx);
          await cx.sleep(1000);
          current = watchFolder(repo);
          this.watching.set(repo, current);
        }
      } catch {}
      if (this.watching.get(repo) === current) this.watching.delete(repo);
    });
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered(sp, ps) {
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: false });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      out.push(...list.filter((k) => nested(k) && k.g.repo === r.g.repo).map((k) => ({ ...k, tree: true })));
    }
    // Keep the model's order in step, so space.next and the menus agree with the list.
    const order = sp.map((w) => w.id);
    const target = out.map((r) => r.w.id);
    const key = JSON.stringify(target);
    if (order.every((id, i) => id === target[i])) this.ordering = null;
    else if (this.ordering !== key) {
      this.ordering = key;
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
    }
    return out.filter((r) => this.shown.has(r.w.id));
  }

  // Only what's unusual, after the name: the repo, when the name doesn't already say it.
  // The branch and the status are on the space's own second line.
  gitTail(g, tree, name, t) {
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const at = tree || same(g.name) ? "" : g.name;
    return h_flex()
      .flex_auto()
      .min_w(at ? SIDE_MIN : 0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(at), (el) => el.child(div().min_w(0).truncate().child(at)));
  }

  // A small control on a row (add, fold), its press kept from the row's own.
  control(t, id, child, action) {
    return div().id(id).h(18).px(3).gap(3).flex().flex_none().items_center().rounded(4)
      .text_size(11).text_color(t.dim).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
      .child(child);
  }

  hover(key) {
    return (on, cx) => {
      if (on) this.hovered = key;
      else if (this.hovered === key) this.hovered = null;
      cx.notify();
    };
  }

  spaceRow({ w, i, g, tree, trees }, t, sp) {
    const fromIndex = this.pressed === null ? -1 : sp.findIndex((s) => s.id === this.pressed);
    const color = (shared("space.colors") ?? {})[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    const folded = this.folded.has(w.id);
    const hot = this.hovered === w.id;
    // A detached HEAD has no branch to name: its line is only the status, and only when there is one.
    const detached = g?.branch === "(detached)";
    const marks = g?.st ? statusMarks(g.st) : "";
    const gitLine = Boolean(g?.branch) && (!detached || Boolean(marks));
    const header = h_flex().h(30).gap(9).items_center()
      .when(tree, (el) => el.child(svg(`${ICONS}/branch.svg`).size(13).flex_none().text_color(t.dim)))
      .when(!tree, (el) => el.child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?")))
      .child(div().flex_initial().min_w(SIDE_MIN).truncate().font_medium().text_color(t.foreground).child(w.name))
      .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1())
      .when(hot, (el) => el.child(this.control(t, `space-add-${w.id}`, svg(`${ICONS}/plus.svg`).size(12), () => {
        if (!w.active) run("space.select", { id: w.id });
        openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
      })))
      .when(trees > 0, (el) => el.child(h_flex().id(`trees-${w.id}`).flex_none().gap(3).items_center().text_size(11).text_color(t.dim).tooltip("Worktrees folded in")
        .child(svg(`${ICONS}/branch.svg`).size(11).flex_none()).child(String(trees))))
      .when(folded && w.status && w.status !== "idle", (el) => el.child(status(t, w.status)))
      .when(hot || folded, (el) => el.child(this.control(t, `space-fold-${w.id}`,
        svg(`${ICONS}/chevron-${folded ? "right" : "down"}.svg`).size(11), (cx) => this.fold(w.id, cx))));
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .mt(i === 0 ? 0 : 4)
      .flex_none()
      .rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_hover(this.hover(w.id))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, (line) => line.bottom(0))
          .when(fromIndex > i, (line) => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        if (this.pressed !== null && this.over !== w.id) {
          this.over = w.id;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex((s) => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) {
          if (w.active) this.fold(w.id, cx);
          else run("space.select", { id: w.id });
        }
        cx.notify();
      })
      .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } }))
      .when(tree, (el) => el.pl(22))
      .child(header)
      // Under the name: its git (branch, status on the right), aligned with the name.
      .when(gitLine, (el) => el.pb(4).child(
        h_flex().h(17).pl(tree ? 22 : 27).gap(8).items_center().text_size(11).text_color(t.dim)
          .child(h_flex().id(`branch-${w.id}`).flex_1().min_w(0).gap(8).items_center().tooltip(g.linked ? "Branch of a linked worktree" : "Branch")
            .when(!detached, (b) => b
              .child(h_flex().w(16).flex_none().justify_center().child(svg(g.linked ? "mods/pe-sidebar/worktree.svg" : `${ICONS}/branch.svg`).size(11).flex_none()))
              .child(div().min_w(0).truncate().child(g.branch))))
          .when(Boolean(marks), (m) => m.child(div().id(`git-${w.id}`).flex_none().tooltip("Git status").child(marks)))));
  }

  // One row per tab, named after its agent or program, with its sub-agents under it.
  tabRows(w, nested, t, ctx) {
    const { leads, byPane, listed, all, f, order } = ctx;
    return w.tabs.flatMap((tab) => {
      const lead = leads.get(tab.id);
      const on = w.active && tab.active;
      const tabPanes = byPane.get(tab.id) ?? [];
      const work = tabPanes.flatMap((p) => {
        const w = this.work[p.terminal];
        return w ? [...w.subagents.map((x) => ({ ...x, kind: "subagent" })), ...w.tasks] : [];
      });
      const kids = lead ? tree(all, lead.terminal, [], work.length > 0) : [];
      const count = kids.length + work.length;
      // How full its context window is: yellow from 50%, red from 80%.
      const info = this.work[lead?.terminal];
      const used = info?.context;
      const effort = info?.effort && info.effort !== "medium" ? info.effort : null;
      const agentLine = Boolean(info?.model || effort || used != null);
      const indent = 8 + TAB_INDENT + (nested ? 22 : 0); // under the tab's icon; the name starts 24 further
      const foldKey = `kids-${lead?.terminal}`;
      const open = !this.folded.has(foldKey);
      const showing = on && lead && f?.pane === lead.pane ? f.shown : null;
      for (const p of tabPanes) if (listed.has(p.terminal)) order.push(p.terminal);
      const select = () => {
        if (!w.active) run("space.select", { id: w.id });
        if (!tab.active) run("tab.select", { id: tab.id });
      };
      const full = tabTitle(tab, lead);
      // A command run with sudo: shown without it, and its icon red.
      const sudo = !tab.named && /^sudo(\s|$)/.test(full);
      const name = sudo ? unsudo(full) : full;
      const pic = icon(lead?.program, 15, sudo ? t.ansi1 : t.foreground);
      const hot = this.hovered === tab.id;
      const idle = !on && (!tab.status || tab.status === "idle");
      if (on && !showing) this.activeAt = ctx.index;
      ctx.index += 1;
      const row = v_flex()
        .id(`tab-${tab.id}`)
        .flex_none()
        .rounded(8)
        .cursor_pointer()
        .when(on && !showing, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_hover(this.hover(tab.id))
        .on_click(() => {
          if (!lead) return select();
          // A sub-agent shown in the lead pane goes back to the pane's own terminal.
          if (f?.pane === lead.pane && f.shown) run("terminal.show", { pane: lead.pane });
          run("pane.focus", { pane: lead.pane });
        })
        .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: tab.id, space: w.id } } }))
        .child(h_flex().h(28).pl(8 + TAB_INDENT + (nested ? 22 : 0)).pr(8).gap(8).items_center()
          .child(h_flex().w(16).flex_none().justify_center().when(Boolean(pic), (el) => el.child(pic))
            .when(!pic, (el) => el.child(svg(`${ICONS}/terminal.svg`).size(14).text_color(sudo ? t.ansi1 : t.dim))))
          .child(div().id(`tab-title-${tab.id}`).flex_1().min_w(0).truncate().text_color(idle ? t.muted : t.foreground).tooltip(full).child(name))
          .when(count > 0 && (hot || !open), (el) => el.child(this.control(t, `fold-${tab.id}`,
            h_flex().gap(3).items_center().child(svg(`${ICONS}/chevron-${open ? "down" : "right"}.svg`).size(11)).when(!open, (el) => el.child(String(count))),
            (cx) => this.fold(foldKey, cx))))
          .child(status(t, tab.status)))
        // Under the name: its agent (model, effort unless medium, context).
        .when(agentLine, (el) => el.pb(4))
        .when(agentLine, (el) => el.child(
          h_flex().h(17).pl(indent + 24).pr(8).gap(6).items_center().text_size(11).text_color(t.dim).overflow_hidden()
            .when(Boolean(info?.model), (m) => m.child(div().flex_none().child(shortModel(info.model))))
            .when(Boolean(effort), (m) => m.child(div().flex_none().text_color(t.muted).child(effort)))
            .when(used != null, (m) => m.child(div().id(`ctx-${tab.id}`).flex_none()
              .when(used >= 50, (c) => c.text_color(used >= 80 ? t.ansi1 : t.ansi3)).tooltip("Context used").child(`${used}%`)))));
      if (!open) return [row];
      const subs = kids.map((s) => {
        const k = s.t;
        const shownHere = k.address === showing;
        if (shownHere) this.activeAt = ctx.index;
        ctx.index += 1;
        const kp = icon(k.program, 13, t.foreground);
        return h_flex()
          .id(`sub-${k.address}`)
          .h(26)
          .flex_none()
          .pl(8 + TAB_INDENT + (nested ? 22 : 0) + 6)
          .pr(8)
          .items_center()
          .rounded(8)
          .text_size(12.5)
          .cursor_pointer()
          .when(shownHere, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => {
            // A kept sub-agent has a pane of its own; the rest show in the tab's lead pane.
            const own = ctx.paneOf.get(k.address);
            if (own) return run("pane.focus", { pane: own });
            select();
            run("terminal.show", { terminal: k.address, pane: lead.pane });
          })
          .children(s.lines.map((l) => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
            .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
            .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6))))
          .when(Boolean(kp), (el) => el.child(div().mr(7).child(kp)))
          .child(div().id(`sub-title-${k.address}`).flex_1().min_w(0).truncate().text_color(shownHere ? t.foreground : t.muted).tooltip(kidTitle(k)).child(kidTitle(k)))
          .child(div().ml(8).child(status(t, kidStatus(k, listed))));
      });
      return [row, ...subs, ...work.map((x, i) => { ctx.index += 1; return this.workRow(t, x, [i === work.length - 1 ? "└" : "├"], nested); })];
    });
  }

  // "Herdr · space · session": the shown tab's name, as its row reads.
  windowTitle(sp, leads) {
    const w = sp.find((s) => s.active);
    const tab = w?.tabs.find((c) => c.active);
    const session = tab ? tabTitle(tab, leads.get(tab.id)) : null;
    const title = ["Herdr", w?.name, session].filter(Boolean).join(" · ");
    if (title !== this.title) {
      this.title = title;
      setWindowTitle(title);
    }
  }

  render() {
    const t = theme();
    const sp = spaces();
    const ps = panes();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const ids = new Set(sp.map((p) => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[p.id] = palette.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);

    const leads = leadPanes(ps);
    this.windowTitle(sp, leads);
    const rows = this.ordered(sp, ps);
    const all = terminals();
    const byPane = new Map();
    for (const p of ps) if (p.terminal) (byPane.get(p.tab) ?? byPane.set(p.tab, []).get(p.tab)).push(p);
    const ctx = {
      leads,
      byPane,
      paneOf: new Map(ps.filter((p) => p.terminal).map((p) => [p.terminal, p.pane])),
      listed: new Map(agents().map((a) => [a.address, a.status])),
      all,
      f: focused(),
      order: [],
      index: 0,
    };
    this.activeAt = -1;
    // A folded main space takes its worktree spaces with it.
    const foldedRepos = new Set(rows.filter((r) => !r.tree && r.g && !r.g.linked && this.folded.has(r.w.id)).map((r) => r.g.repo));
    const hidden = (r) => r.tree && foldedRepos.has(r.g.repo);
    const list = rows.filter((r) => !hidden(r)).flatMap((r) => {
      ctx.index += 1;
      const trees = foldedRepos.has(r.g?.repo) && !r.tree ? rows.filter((k) => hidden(k) && k.g.repo === r.g.repo).length : 0;
      return [this.spaceRow({ ...r, trees }, t, sp), ...(this.folded.has(r.w.id) ? [] : this.tabRows(r.w, r.tree, t, ctx))];
    });
    setAgentOrder(ctx.order);
    // Bring the shown tab into view when it, or its place in the list, changes.
    const active = `${focused()?.tab}:${this.activeAt}`;
    if (active !== this.revealed) {
      this.revealed = active;
      if (this.activeAt >= 0) this.scroll.scroll_to_item(this.activeAt);
    }
    return v_flex().id("pe-list").size_full().min_h(0).bg(t.chrome).text_size(13).px(8).pb(14).overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
      .on_size_change((_size, cx) => { if (this.activeAt >= 0) { this.scroll.scroll_to_item(this.activeAt); cx.notify(); } })
      .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
      .children(list);
  }
}

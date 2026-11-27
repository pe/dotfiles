// Tab helpers shared by pe-sidebar and pe-topbar: a tab's lead pane, its title, the status marks.

import { div, svg } from "gpui-kit";

const ICONS = "mods/workspace-chrome";

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✳ Fix login", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
export const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// Each tab's lead pane: its first agent, else its focused terminal, else its first terminal.
export function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

// A tab's name: one someone gave it, else its agent's or program's own title, else the program.
export function tabTitle(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== l?.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  if (tab.named && tab.name !== prog) return tab.name;
  return telling ? live : prog || tab.name;
}

// "sudo -Hu root vim x ~" -> "vim x ~": sudo and its options, those that take a value included.
export function unsudo(cmd) {
  const w = cmd.split(/\s+/);
  if (w[0] !== "sudo") return cmd;
  let i = 1;
  while (i < w.length && w[i].startsWith("-")) {
    if (w[i] === "--") { i++; break; }
    i += !w[i].startsWith("--") && /[ughpCDRTUrt]$/.test(w[i]) ? 2 : 1;
  }
  return w.slice(i).join(" ") || cmd;
}

// Herdr's status marks: a spinner while working, "!" when blocked, a dot when done, a ring when idle.
export function status(t, s) {
  if (s === "working") return svg(`${ICONS}/spinner.svg`).size(12).mx(1).flex_none().text_color(t.working).spin(900);
  if (s === "blocked") return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
  if (s === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  if (s === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done);
  return div().w(14).flex_none();
}

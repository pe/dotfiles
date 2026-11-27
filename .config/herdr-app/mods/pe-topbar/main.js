// Bar above the panes, as the Terminals layout has: tabs of the shown space, new tab, Changes toggle.
// It exists only while the sidebar is hidden (it sizes itself to 0 otherwise), leaving room for the macOS traffic lights and shows the space picker.
// Tab titles, icons and marks come from pe-sidebar/tabs.js, as in the sidebar.
// Dragging it moves the window.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, focused, run, theme, window, layout, settings, openOverlay } from "herdr";

import { leadPanes, tabTitle, unsudo, status } from "./tabs.js";

const ICONS = "mods/workspace-chrome";
// A program must have run this long before its ending marks a background tab (as in pe-sidebar).
const MIN_RUN_MS = 3000;

const find = (n, id) => n?.id === id ? n : (n?.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null;
const stop = (_e, cx) => cx.stop_propagation();

export default class Topbar extends View {
  init() {
    this.ran = {}; // pane -> when a program (not a shell or agent) took its foreground
    this.finished = new Set(); // tabs where a program ended while the tab wasn't shown, until it is
  }

  // As pe-sidebar: a program that ran MIN_RUN_MS in front of a shell and ended while its tab
  // wasn't shown marks the tab "done" until it is shown.
  trackFinished(sp, ps) {
    const now = Date.now();
    const shown = new Set(sp.filter((s) => s.active).flatMap((s) => (s.tabs ?? []).filter((t) => t.active).map((t) => t.id)));
    const ran = {};
    for (const p of ps) {
      if (!p.terminal) continue;
      const running = !(p.program?.shell || p.program?.agent);
      if (running) ran[p.pane] = this.ran[p.pane] ?? now;
      else if (this.ran[p.pane] && now - this.ran[p.pane] >= MIN_RUN_MS && !shown.has(p.tab)) this.finished.add(p.tab);
    }
    for (const id of shown) this.finished.delete(id);
    for (const id of [...this.finished]) if (!sp.some((s) => (s.tabs ?? []).some((t) => t.id === id))) this.finished.delete(id);
    this.ran = ran;
  }

  render() {
    const t = theme();
    const w = window();
    const root = layout();
    const sidebar = find(root, "sidebar");
    const panel = find(root, "panel");
    const bar = find(root, "topbar");
    const want = sidebar?.hidden ? 40 : 0;
    if (bar && bar.size?.px !== want) run("layout.resize", { id: "topbar", px: want });
    const all = panes();
    const sp = spaces();
    this.trackFinished(sp, all);
    if (!sidebar?.hidden) return div();
    const space = sp.find((s) => s.active);
    const leads = leadPanes(all);
    const f = focused();
    const panelOn = panel && !panel.hidden;
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? (root.traffic_lights[0] + 64) / settings().zoom
      : 10;

    const button = (id, tip, icon, on, onClick) => div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6)
      .bg(on ? t.selected : t.canvas).text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).on_mouse_down("left", stop).on_click(onClick).child(svg(icon).size(15));

    const tab = (c) => {
      const lead = leads.get(c.id);
      const full = tabTitle(c, lead);
      const sudo = !c.named && /^sudo(\s|$)/.test(full);
      const name = sudo ? unsudo(full) : full;
      const g = lead?.program;
      const pic = g?.icon
        ? (g.tint ? svg(g.icon).size(15).flex_none().text_color(sudo ? t.ansi1 : t.foreground) : image(g.icon).w(15).h(15).flex_none())
        : svg(`${ICONS}/terminal.svg`).size(14).flex_none().text_color(sudo ? t.ansi1 : t.dim);
      const idle = !c.active && (!c.status || c.status === "idle");
      return h_flex().id(`pt-${c.id}`).flex_shrink(1).min_w(0).max_w(240).h(28).pl(6).pr(8).gap(8).items_center().rounded(6).text_size(12.5)
        .bg(c.active ? t.selected : t.canvas)
        .hover((s) => s.bg(c.active ? t.selected : t.hover))
        .on_mouse_down("left", stop)
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } });
        })
        .on_click(() => {
          if (!lead) return run("tab.select", { id: c.id });
          // A sub-agent shown in the lead pane goes back to the pane's own terminal.
          if (f?.pane === lead.pane && f.shown) run("terminal.show", { pane: lead.pane });
          run("pane.focus", { pane: lead.pane });
        })
        .child(h_flex().w(16).flex_none().justify_center().child(pic))
        .child(div().id(`pt-title-${c.id}`).min_w(0).truncate().text_color(idle ? t.muted : t.foreground).tooltip(full).child(name))
        .child(status(t, this.finished.has(c.id) && (!c.status || c.status === "idle") ? "done" : c.status));
    };

    // pt(8) mirrors the 8 px padding the panes have below the bar, so the row looks centered.
    return h_flex().size_full().min_w(0).pl(lights).pr(10).pt(8).gap(3).items_center()
      .when(Boolean(space), (el) => el.child(
        h_flex().id("pt-space").h(28).px(10).mr(4).flex_none().items_center().rounded(6).text_size(12.5)
          .bg(t.hover).text_color(t.foreground).on_mouse_down("left", stop)
          .on_click(() => openOverlay({ mod: "picker", kind: "popup", at: "top", offset: 40, width: 640, height: 0.8 }))
          .child(svg("mods/terminals-bar/stack.svg").size(14).flex_none().mr(6).text_color(t.muted))
          .child(div().max_w(160).truncate().child(space.name))))
      .child(h_flex().flex_1().min_w(0).gap(3).items_center().children((space?.tabs ?? []).map(tab)))
      .child(button("pt-new", "New tab", `${ICONS}/plus.svg`, false, () => run("tab.new", { space: space?.id })))
      .child(button("pt-changes", "Changes (cmd-g)", "mods/changes/changes.svg", panelOn, () => run("layout.toggle", { id: "panel" })));
  }
}

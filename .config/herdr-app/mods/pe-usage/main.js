// Claude's plan usage at the foot of the sidebar: the five-hour session and the weekly
// limit, as % used. Claude Code tells its status line (statusline.py, silent), which
// keeps it in $XDG_STATE_HOME/pe-herdr/limits.json; read here every 15 seconds. It moves
// when a Claude Code session does, which is when it changes.

import { View, div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, theme, checking } from "herdr";

// "3d 12h", "2h 15m" or "40m".
function until(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}

export default class Usage extends View {
  init(_props, cx) {
    this.limits = null;
    if (checking()) return;
    this.read(cx);
    cx.timer.every(15000, (cx) => this.read(cx));
  }

  read(cx) {
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", 'cat "${XDG_STATE_HOME:-$HOME/.local/state}/pe-herdr/limits.json"']).catch(() => null);
      const text = r?.code === 0 ? r.stdout : null;
      if (!text || text === this.text) return;
      this.text = text;
      try { this.limits = JSON.parse(text); } catch {}
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const tone = (n) => (n >= 90 ? t.blocked : n >= 75 ? t.ansi3 : t.foreground);
    const part = (id, label, w) => {
      // A window past its reset starts again from nothing.
      const left = until((w?.resets_at ?? NaN) * 1000 - Date.now());
      const n = typeof w?.used_percentage === "number" ? (left ? w.used_percentage : 0) : null;
      return h_flex().id(id).gap(5).items_center().flex_none()
        .when(Boolean(left), (el) => el.tooltip(`Resets in ${left}`))
        .child(div().text_color(t.dim).child(label))
        .child(div().font_medium().text_color(n == null ? t.dim : tone(n)).child(n == null ? "–" : `${Math.round(n)}%`));
    };
    return h_flex().id("pe-usage").size_full().bg(t.chrome).border_t(1).border_color(t.border).px(16).gap(14).items_center()
      .text_size(12)
      .child(div().id("u-icon").flex_none().tooltip("Claude plan usage").child(image("icons/claude.svg").w(16).h(16)))
      .when(!this.limits, (el) => el.child(div().flex_1().truncate().text_color(t.dim).child("Waiting for Claude Code")))
      .when(Boolean(this.limits), (el) => el
        .child(part("u-5h", "5h", this.limits.five_hour))
        .child(part("u-wk", "Week", this.limits.seven_day)));
  }
}

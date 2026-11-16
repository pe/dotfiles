// The sidebar's top row, as Herdr's default brand row: its icon and "Herdr", past the macOS
// traffic lights, with a new-space button in place of search and the sidebar toggle.
// Dragging it moves the window.

import { div, image, svg, View } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, theme, window } from "herdr";

export default class Header extends View {
  render() {
    const t = theme();
    const w = window();
    return h_flex().size_full().bg(t.chrome).pl(14).pr(10).gap(4).items_center().text_size(13.5)
      .when(w?.platform === "macos" && !w?.fullscreen, (el) => el.pl(76))
      .child(h_flex().flex_1().gap(8).items_center()
        .child(image("frame/welcome/herdr.png").size(20).rounded(5))
        .child(div().font_semibold().text_color(t.foreground).child("Herdr")))
      .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("New space")
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(15)));
  }
}

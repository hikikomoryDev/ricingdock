// Opens the preferences window and photographs each page.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(800);
    t.GLib.spawn_command_line_async('gnome-extensions prefs ricingdock@hikikomoriDev');
    let win;
    for (let i = 0; i < 40 && !(win && win.get_frame_rect().width > 0); i++) {
        await t.wait(300);
        win = global.get_window_actors().map(a => a.meta_window)
            .find(w => w.get_title()?.includes('RicingDock'));
    }
    await t.wait(1500);
    const f = win.get_frame_rect();
    t.log(`prefs at ${f.x},${f.y} ${f.width}x${f.height}`);
    await t.shot('look');
    // Tabs sit in the header bar: Look, Layout, Behaviour.
    await t.click(f.x + f.width / 2 + 10, f.y + 22);
    await t.wait(800);
    await t.shot('layout');
    await t.click(f.x + f.width / 2 + 150, f.y + 22);
    await t.wait(800);
    await t.shot('behaviour');
}

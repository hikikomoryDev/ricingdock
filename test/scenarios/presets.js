// Presets set the whole dock; defaults on a fresh install.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    t.log(`fresh install: mode=${s.get_string('mode')} show-apps=${s.get_string('show-apps-position')}`);
    t.GLib.spawn_command_line_async('gnome-extensions prefs ricingdock@hikikomoriDev');
    let win;
    for (let i = 0; i < 40 && !(win && win.get_frame_rect().width > 0); i++) {
        await t.wait(300);
        win = global.get_window_actors().map(a => a.meta_window).find(w => w.get_title()?.includes('RicingDock'));
    }
    await t.wait(1500);
    await t.shot('look');
    const f = win.get_frame_rect();
    const X = Number(t.GLib.getenv('BTN_X') ?? 0), Y = Number(t.GLib.getenv('BTN_Y') ?? 0);
    if (!X)
        return;
    const keys = ['mode', 'show-apps-position', 'spacing', 'visibility', 'indicator-style', 'background-color', 'accent-color', 'blur-radius', 'border-width'];
    const dump = () => keys.map(k => `${k}=${s.get_value(k).print(false)}`).join(' ');
    await t.click(f.x + X, f.y + Y, t.Clutter.BUTTON_PRIMARY, 1200);
    t.log(`after Dark Glass: ${dump()}`);
    await t.shot('dark-glass');
    await t.click(f.x + X - 307, f.y + Y, t.Clutter.BUTTON_PRIMARY, 1200);
    t.log(`after Dark Mint:  ${dump()}`);
}

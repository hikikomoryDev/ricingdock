// Picks "Always" in the visibility dropdown the way a user would.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(800);
    const s = t.dock()._settings;
    s.connect('changed::visibility', () => t.log(`settings changed: visibility=${s.get_string('visibility')}`));
    t.GLib.spawn_command_line_async('gnome-extensions prefs ricingdock@hikikomoriDev');
    let win;
    for (let i = 0; i < 40 && !(win && win.get_frame_rect().width > 0); i++) {
        await t.wait(300);
        win = global.get_window_actors().map(a => a.meta_window)
            .find(w => w.get_title()?.includes('RicingDock'));
    }
    await t.wait(1500);
    const f = win.get_frame_rect();
    // A preset first: that is what used to freeze every later change.
    await t.click(f.x + 550, f.y + 181);                // "Candy" preset button
    await t.wait(800);
    t.log(`after preset: accent=${s.get_string('accent-color')}`);
    await t.click(f.x + f.width / 2 + 150, f.y + 22);   // Behaviour tab
    await t.wait(800);
    await t.click(f.x + f.width - 120, f.y + 136);      // "Show the dock" dropdown
    await t.wait(900);
    await t.shot('popover');
    t.log(`before pick: visibility=${s.get_string('visibility')}`);
    await t.click(f.x + 597, f.y + 186);                // "Always"
    await t.wait(1000);
    await t.shot('picked');
    t.log(`after pick: visibility=${s.get_string('visibility')} dock shown=${t.dock()._dock._shown} strut=${Boolean(t.dock()._dock._strut)}`);
}

// Linked padding slider keeps the top/bottom ratio; unlinking shows both.
// KNOB_X / KNOB_Y: where the Padding knob sits relative to the window.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_int('padding-top', 8);
    s.set_int('padding-bottom', 4);
    t.GLib.spawn_command_line_async('gnome-extensions prefs ricingdock@hikikomoriDev');
    let win;
    for (let i = 0; i < 40 && !(win && win.get_frame_rect().width > 0); i++) {
        await t.wait(300);
        win = global.get_window_actors().map(a => a.meta_window)
            .find(w => w.get_title()?.includes('RicingDock'));
    }
    await t.wait(1500);
    const f = win.get_frame_rect();
    t.log(`window ${f.x},${f.y}`);
    await t.click(f.x + f.width / 2 + 10, f.y + 22);      // Layout tab
    await t.wait(800);
    await t.shot('layout');
    const kx = Number(t.GLib.getenv('KNOB_X') ?? 0), ky = Number(t.GLib.getenv('KNOB_Y') ?? 0);
    if (!kx)
        return;
    const seat = t.Clutter.get_default_backend().get_default_seat();
    const p = seat.create_virtual_device(t.Clutter.InputDeviceType.POINTER_DEVICE);
    const now = () => t.GLib.get_monotonic_time();
    p.notify_absolute_motion(now(), f.x + kx, f.y + ky);
    await t.wait(100);
    p.notify_button(now(), t.Clutter.BUTTON_PRIMARY, t.Clutter.ButtonState.PRESSED);
    for (let i = 1; i <= 20; i++) {
        p.notify_absolute_motion(now(), f.x + kx + i * 2, f.y + ky);
        await t.wait(20);
    }
    p.notify_button(now(), t.Clutter.BUTTON_PRIMARY, t.Clutter.ButtonState.RELEASED);
    await t.wait(700);
    const top = s.get_int('padding-top'), bottom = s.get_int('padding-bottom');
    t.log(`dragged linked slider -> top=${top} bottom=${bottom} ratio=${(top / Math.max(1, bottom)).toFixed(2)} (should be ~2)`);
    await t.shot('dragged');
    await t.click(f.x + 595, f.y + 496);                   // unlink switch
    await t.wait(700);
    t.log(`linked=${s.get_boolean('padding-linked')}`);
    await t.shot('unlinked');
}

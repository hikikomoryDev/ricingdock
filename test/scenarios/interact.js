// Clicks, scroll, drag-to-reorder and the overview.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const dock = t.dock()._dock;
    const tracker = t.Shell.WindowTracker.get_default();
    const center = actor => {
        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        return [x + w / 2, y + h / 2];
    };
    const item = id => dock._items.get(id);
    const favs = () => global.settings.get_strv('favorite-apps').map(s => s.replace('.desktop', '').split('.').pop()).join(' ');

    // Two editor windows.
    t.launch('org.gnome.TextEditor.desktop');
    await t.wait(2200);
    item('org.gnome.TextEditor.desktop').app.open_new_window(-1);
    await t.wait(2000);
    const editor = item('org.gnome.TextEditor.desktop');
    t.log(`editor windows=${editor.windows().length} dots=${editor._indicator.get_n_children()}`);

    const [ex, ey] = center(editor);
    const focusWin = () => global.display.focus_window?.get_stable_sequence();
    const before = focusWin();
    await t.click(ex, ey);
    await t.wait(500);
    t.log(`click on focused 2-window app: focus ${before} -> ${focusWin()} (should switch)`);
    const s1 = focusWin();
    await t.scroll(ex, ey, 1);
    await t.wait(400);
    t.log(`scroll: focus ${s1} -> ${focusWin()} (should switch)`);

    // Single-window app: click focuses, click again minimizes.
    t.launch('org.gnome.Calculator.desktop');
    for (let i = 0; i < 20 && tracker.focus_app?.get_id() !== 'org.gnome.Calculator.desktop'; i++)
        await t.wait(300);
    await t.move(960, 300, 500);
    const calc = item('org.gnome.Calculator.desktop');
    const [cx, cy] = center(calc);
    const w = calc.windows()[0];
    t.log(`calculator focused=${tracker.focus_app?.get_id()} minimized=${w.minimized}`);
    await t.click(cx, cy);
    await t.wait(700);
    t.log(`click on focused: minimized=${w.minimized} (should be true)`);
    await t.click(cx, cy);
    await t.wait(700);
    t.log(`click again: minimized=${w.minimized} (should restore)`);

    // Drag Brave to after Files.
    t.log(`favorites before: ${favs()}`);
    const first = item(t.favs()[0]);
    const files = item('org.gnome.Nautilus.desktop');
    const [bx, by] = center(first);
    const [fx, fy] = center(files);
    await t.move(bx, by, 200);
    const pointer = t.Clutter.get_default_backend().get_default_seat()
        .create_virtual_device(t.Clutter.InputDeviceType.POINTER_DEVICE);
    const now = () => t.GLib.get_monotonic_time();
    pointer.notify_absolute_motion(now(), bx, by);
    await t.wait(50);
    pointer.notify_button(now(), t.Clutter.BUTTON_PRIMARY, t.Clutter.ButtonState.PRESSED);
    await t.wait(350);
    for (let i = 1; i <= 30; i++) {
        pointer.notify_absolute_motion(now(), bx + (fx + 40 - bx) * i / 30, by - 4);
        await t.wait(30);
    }
    await t.wait(400);
    await t.shot('drag');
    pointer.notify_button(now(), t.Clutter.BUTTON_PRIMARY, t.Clutter.ButtonState.RELEASED);
    await t.wait(1000);
    t.log(`favorites after: ${favs()}`);

    // Overview: our dock stays, the stock dash is hidden.
    await t.move(960, 300);
    t.Main.overview.show();
    await t.wait(1500);
    t.log(`overview: dock shown=${dock._shown} stock dash visible=${t.Main.overview.dash.visible}`);
    await t.shot('overview');
    const [ax, ay] = center(dock._showApps);
    await t.click(ax, ay);
    await t.wait(1500);
    t.log(`apps grid: checked=${t.Main.overview.dash.showAppsButton.checked}`);
    await t.shot('appgrid');
}

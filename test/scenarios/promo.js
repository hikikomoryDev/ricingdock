// Screenshots for the extensions.gnome.org page and the README.
export default async function (t) {
    const {GLib, Gio} = t;
    await t.move(960, 300);
    await t.wait(1000);
    const s = t.dock()._settings;
    const set = keys => {
        for (const [k, v] of Object.entries(keys)) {
            const type = s.settings_schema.get_key(k).get_value_type().dup_string();
            if (typeof v === 'boolean') s.set_boolean(k, v);
            else if (typeof v === 'string') s.set_string(k, v);
            else if (type === 'i') s.set_int(k, v);
            else s.set_double(k, v);
        }
    };
    const MINT = {
        'mode': 'full', 'show-apps-position': 'start-edge', 'dock-height': 100, 'padding-sides': 8, 'spacing': 20,
        'magnify-scale': 1.3, 'magnify-push': true, 'magnify-active': true,
        'background-color': 'rgb(0,0,0)', 'blur': true, 'blur-radius': 45, 'blur-brightness': 0.85,
        'corner-radius': 18, 'border-width': 0, 'accent-color': 'rgb(110,231,200)', 'indicator-style': 'pill',
        'visibility': 'fixed', 'show-labels': false,
    };
    const GLASS = {...MINT, 'background-color': 'rgba(18,18,24,0.40)', 'blur-radius': 60, 'blur-brightness': 0.8,
        'border-width': 1, 'border-color': 'rgba(255,255,255,0.14)', 'accent-color': 'rgb(255,255,255)'};
    set(MINT);
    const tracker = t.Shell.WindowTracker.get_default();
    for (const id of ['org.gnome.TextEditor.desktop', 'org.gnome.Nautilus.desktop', 'org.gnome.Calculator.desktop']) {
        t.launch(id);
        for (let i = 0; i < 20 && tracker.focus_app?.get_id() !== id; i++)
            await t.wait(300);
    }
    await t.wait(1000);
    // Keep the wallpaper clear: minimise the windows, then re-focus the calculator.
    for (const a of global.get_window_actors())
        if (a.meta_window.get_wm_class() !== 'org.gnome.Calculator') a.meta_window.minimize();
    const send = (id, props) => Gio.DBus.session.emit_signal(null, '/promo', 'com.canonical.Unity.LauncherEntry', 'Update',
        new GLib.Variant('(sa{sv})', [`application://${id}`, props]));
    send('org.gnome.TextEditor.desktop', {'count': GLib.Variant.new_int64(3), 'count-visible': GLib.Variant.new_boolean(true)});
    const calcWin = global.get_window_actors().map(a => a.meta_window).find(w => w.get_wm_class() === 'org.gnome.Calculator');
    calcWin?.minimize();
    await t.wait(400);
    calcWin?.unminimize();
    calcWin?.activate(global.get_current_time());
    await t.wait(300);
    calcWin?.move_frame(true, 1300, 200);
    calcWin?.minimize();
    await t.wait(800);
    const dock = () => t.dock()._dock;
    const hover = async id => {
        const it = dock()._items.get(id);
        const [x, y] = it.get_transformed_position();
        await t.move(x + 30, y + 30, 900);
    };
    await hover('org.gnome.Ptyxis.desktop');
    await t.shot('promo-dark-mint');
    await t.move(960, 300, 700);
    set({...GLASS, 'mode': 'island'});
    await t.wait(900);
    await hover('org.gnome.Loupe.desktop');
    await t.shot('promo-dark-glass-island');
    await t.move(960, 300, 700);
    set(MINT);
    await t.wait(900);
    const kb = t.Clutter.get_default_backend().get_default_seat().create_virtual_device(t.Clutter.InputDeviceType.KEYBOARD_DEVICE);
    kb.notify_keyval(GLib.get_monotonic_time(), t.Clutter.KEY_Super_L, t.Clutter.KeyState.PRESSED);
    await t.wait(1400);
    await t.shot('promo-hints');
    kb.notify_keyval(GLib.get_monotonic_time(), t.Clutter.KEY_Super_L, t.Clutter.KeyState.RELEASED);
}

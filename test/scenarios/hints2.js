// Hints sit on the top-left corner, clear of the running indicator and the
// unread counter, with apps running.
export default async function (t) {
    const {GLib, Gio} = t;
    await t.move(960, 300);
    await t.wait(800);
    t.dock()._settings.set_string('indicator-style', 'pill');
    t.launch('org.gnome.TextEditor.desktop');
    t.launch('org.gnome.Calculator.desktop');
    await t.wait(3000);
    Gio.DBus.session.emit_signal(null, '/rdtest', 'com.canonical.Unity.LauncherEntry', 'Update',
        new GLib.Variant('(sa{sv})', ['application://org.gnome.TextEditor.desktop', {'count': GLib.Variant.new_int64(4), 'count-visible': GLib.Variant.new_boolean(true)}]));
    await t.move(960, 300, 800);
    const dock = t.dock()._dock;
    const kb = t.Clutter.get_default_backend().get_default_seat().create_virtual_device(t.Clutter.InputDeviceType.KEYBOARD_DEVICE);
    kb.notify_keyval(t.GLib.get_monotonic_time(), t.Clutter.KEY_Super_L, t.Clutter.KeyState.PRESSED);
    await t.wait(1300);
    const ed = dock._items.get('org.gnome.TextEditor.desktop');
    const box = a => { const [x, y] = a.get_transformed_position(); const [w, h] = a.get_transformed_size(); return {x1: x, y1: y, x2: x + w, y2: y + h}; };
    const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
    const hint = box(ed._hint), badge = box(ed._badge), ind = box(ed._indicator.get_children()[0]);
    t.log(`hint over badge: ${overlap(hint, badge)} | hint over running pill: ${overlap(hint, ind)}`);
    await t.shot('hints');
    kb.notify_keyval(t.GLib.get_monotonic_time(), t.Clutter.KEY_Super_L, t.Clutter.KeyState.RELEASED);
}

// Progress gauge at 10 / 62 / 100 %, next to the running pill.
export default async function (t) {
    const {GLib, Gio} = t;
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('indicator-style', 'pill');
    s.set_int('dock-height', 100);
    t.launch('org.gnome.Nautilus.desktop');
    await t.wait(2500);
    await t.move(960, 300, 500);
    for (const p of [0.1, 0.62, 1.0]) {
        Gio.DBus.session.emit_signal(null, '/p', 'com.canonical.Unity.LauncherEntry', 'Update',
            new GLib.Variant('(sa{sv})', ['application://org.gnome.Nautilus.desktop',
                {'progress': GLib.Variant.new_double(p), 'progress-visible': GLib.Variant.new_boolean(true)}]));
        await t.wait(500);
        await t.shot(`p${Math.round(p * 100)}`);
    }
}

// Counter stays on the icon's top-right corner at rest and zoomed.
export default async function (t) {
    const {GLib, Gio} = t;
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_string('visibility', 'fixed');
    await t.wait(500);
    const dock = t.dock()._dock;
    const send = (id, n, p) => Gio.DBus.session.emit_signal(null, '/rdtest', 'com.canonical.Unity.LauncherEntry', 'Update',
        new GLib.Variant('(sa{sv})', [`application://${id}`, {
            'count': GLib.Variant.new_int64(n), 'count-visible': GLib.Variant.new_boolean(true),
            ...(p !== undefined ? {'progress': GLib.Variant.new_double(p), 'progress-visible': GLib.Variant.new_boolean(true)} : {}),
        }]));
    send('org.gnome.TextEditor.desktop', 7, 0.6);
    send('org.gnome.Nautilus.desktop', 128);
    await t.wait(600);
    const rel = id => {
        const it = dock._items.get(id);
        const [ix, iy] = it.icon.get_transformed_position();
        const [iw, ih] = it.icon.get_transformed_size();
        const [bx, by] = it._badge.get_transformed_position();
        const [bw, bh] = it._badge.get_transformed_size();
        // badge centre relative to icon's top-right corner, in icon widths
        return `badge ${it._badge.text}: centre at (${((bx + bw / 2 - ix - iw) / iw).toFixed(3)}, ${((by + bh / 2 - iy) / ih).toFixed(3)}) of icon, icon ${iw.toFixed(1)}px`;
    };
    t.log(`rest  ${rel('org.gnome.TextEditor.desktop')} | ${rel('org.gnome.Nautilus.desktop')}`);
    await t.shot('rest');
    const it = dock._items.get('org.gnome.Nautilus.desktop');
    const [x, y] = it.get_transformed_position();
    const [w, h] = it.get_transformed_size();
    await t.move(x + w / 2, y + h / 2, 700);
    t.log(`zoom  ${rel('org.gnome.Nautilus.desktop')}`);
    await t.shot('zoom');
}

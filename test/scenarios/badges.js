// Well-formed update for an installed app shows; junk is ignored.
export default async function (t) {
    const {GLib, Gio} = t;
    await t.wait(1000);
    const dock = t.dock()._dock;
    const send = (sig, value) => Gio.DBus.session.emit_signal(null, '/rdtest',
        'com.canonical.Unity.LauncherEntry', 'Update', new GLib.Variant(sig, value));
    const count = () => dock.badges._entries.size;
    send('(sa{sv})', ['application://org.gnome.TextEditor.desktop', {count: GLib.Variant.new_int64(3), 'count-visible': GLib.Variant.new_boolean(true)}]);
    for (let i = 0; i < 500; i++)
        send('(sa{sv})', [`application://junk${i}.desktop`, {count: GLib.Variant.new_int64(1)}]);
    send('(s)', ['application://org.gnome.Calculator.desktop']);
    send('(sa{sv})', ['application://org.gnome.Calculator.desktop', {count: GLib.Variant.new_string('<b>x</b>'), 'count-visible': GLib.Variant.new_boolean(true)}]);
    await t.wait(800);
    const editor = dock._items.get('org.gnome.TextEditor.desktop');
    const calc = dock._items.get('org.gnome.Calculator.desktop');
    t.log(`entries=${count()} editor badge=${editor._badge?.text} calc badge=${calc._badge?.text ?? 'none'}`);
}

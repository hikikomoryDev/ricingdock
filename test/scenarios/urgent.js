// An app asking for attention: the icon bounces, the tile stays plain.
export default async function (t) {
    const {GLib, Gio} = t;
    await t.move(960, 300);
    await t.wait(800);
    const dock = t.dock()._dock;
    const it = dock._items.get('org.gnome.TextEditor.desktop');
    const send = props => Gio.DBus.session.emit_signal(null, '/rdtest', 'com.canonical.Unity.LauncherEntry', 'Update',
        new GLib.Variant('(sa{sv})', ['application://org.gnome.TextEditor.desktop', props]));
    const lift = async () => {
        let m = 0;
        for (let i = 0; i < 40; i++) {
            m = Math.max(m, Math.abs(it._body.translation_y));
            await t.wait(30);
        }
        return m.toFixed(1);
    };
    send({'urgent': GLib.Variant.new_boolean(true)});
    t.log(`urgent: lift ${await lift()}px | tile style "${it.tile.get_style()}"`);
    const n = c => send({'count': GLib.Variant.new_int64(c), 'count-visible': GLib.Variant.new_boolean(true)});
    n(1);
    t.log(`first counter (1): lift ${await lift()}px`);
    n(2);
    t.log(`new message (2): lift ${await lift()}px`);
    n(3);
    t.log(`new message (3): lift ${await lift()}px`);
    n(1);
    t.log(`read some (1): lift ${await lift()}px`);
}

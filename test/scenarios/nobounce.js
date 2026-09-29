// Switches: no bounce on messages / launch; magnification off and presets.
export default async function (t) {
    const {GLib, Gio} = t;
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    const dock = () => t.dock()._dock;
    const lift = async it => {
        let m = 0;
        for (let i = 0; i < 30; i++) {
            m = Math.max(m, Math.abs(it._body.translation_y));
            await t.wait(30);
        }
        return m.toFixed(1);
    };
    const msg = c => Gio.DBus.session.emit_signal(null, '/rdtest', 'com.canonical.Unity.LauncherEntry', 'Update',
        new GLib.Variant('(sa{sv})', ['application://org.gnome.TextEditor.desktop', {'count': GLib.Variant.new_int64(c), 'count-visible': GLib.Variant.new_boolean(true)}]));
    const ed = () => dock()._items.get('org.gnome.TextEditor.desktop');
    msg(1); await t.wait(1500);
    s.set_boolean('attention-bounce', false);
    msg(2);
    t.log(`messages off: lift ${await lift(ed())}px`);
    s.set_boolean('attention-bounce', true);
    msg(3);
    t.log(`messages on: lift ${await lift(ed())}px`);
    s.set_boolean('launch-bounce', false);
    const calc = dock()._items.get('org.gnome.Calculator.desktop');
    calc.bounce();
    t.log(`launch off: lift ${await lift(calc)}px`);
    for (const [on, scale] of [[false, 1.3], [true, 1.1], [true, 1.5]]) {
        s.set_boolean('magnify', on);
        s.set_double('magnify-scale', scale);
        await t.wait(600);
        const it = dock()._items.get('org.gnome.Nautilus.desktop');
        const [x, y] = it.get_transformed_position();
        await t.move(x + 30, y + 30, 700);
        t.log(`magnify=${on} scale=${scale}: hovered icon scale ${it.currentScale.toFixed(2)}`);
        await t.move(960, 300, 500);
    }
}

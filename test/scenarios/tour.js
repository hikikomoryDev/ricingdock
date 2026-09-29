// Walks through the main behaviours; run with different settings files.
export default async function (t) {
    const {GLib, Gio} = t;
    await t.move(960, 400);
    await t.wait(1200);
    const dock = t.dock()._dock;
    const center = actor => {
        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        return [x + w / 2, y + h / 2];
    };
    const edit = () => dock._items.get('org.gnome.TextEditor.desktop');
    const mon = t.Main.layoutManager.primaryMonitor;
    const edge = async () => {
        if (dock._g.position === 'bottom')
            await t.move(mon.x + mon.width / 2, mon.y + mon.height - 1);
        else if (dock._g.position === 'left')
            await t.move(mon.x, mon.y + mon.height / 2);
        else
            await t.move(mon.x + mon.width - 1, mon.y + mon.height / 2);
        await t.wait(900);
    };
    // Autohide starts hidden: bring the dock up the way a user would.
    const reveal = async () => {
        if (!dock._shown)
            await edge();
    };
    t.log(`rest rect ${JSON.stringify(dock._restRect)}`);
    const [px, py] = dock._panel.get_transformed_position();
    const [pw, ph] = dock._panel.get_transformed_size();
    t.log(`panel at ${px},${py} size ${pw}x${ph}`);
    await t.shot('01-rest');

    await reveal();
    const [ex, ey] = center(edit());
    const vertical = dock._g.vertical;
    if (vertical)
        await t.glide(ex, ey - 250, ex, ey, 14, 500);
    else
        await t.glide(ex - 250, ey, ex, ey, 14, 500);
    await t.wait(400);
    await t.shot('02-hover');

    await t.click(ex, ey);
    await t.wait(2500);
    await reveal();
    Gio.DBus.session.emit_signal(null, '/rdtest', 'com.canonical.Unity.LauncherEntry', 'Update',
        new GLib.Variant('(sa{sv})', ['application://org.gnome.TextEditor.desktop', {
            'count': GLib.Variant.new_int64(7),
            'count-visible': GLib.Variant.new_boolean(true),
            'progress': GLib.Variant.new_double(0.6),
            'progress-visible': GLib.Variant.new_boolean(true),
        }]));
    await t.move(960, 400);
    await t.wait(800);
    t.log(`launched: running=${edit().app.state} shown=${dock._shown} overlap=${dock._overlap}`);
    await t.shot('03-running');

    await reveal();
    const [mx, my] = center(edit());
    await t.click(mx, my, t.Clutter.BUTTON_SECONDARY, 700);
    await t.shot('04-menu');
    await t.click(960, 300, t.Clutter.BUTTON_PRIMARY, 500);

    const win = edit().app.get_windows()[0];
    win.maximize();
    await t.move(960, 400);
    await t.wait(1500);
    t.log(`maximized: shown=${dock._shown} overlap=${dock._overlap} holds=${dock._holds}`);
    // Clicks beside the dock must reach the window underneath.
    const probeY = dock._g.vertical ? mon.y + mon.height / 2 : mon.y + mon.height - 40;
    const probeX = dock._g.vertical ? (dock._g.position === 'left' ? 40 : mon.width - 40) : 100;
    t.log(`pick beside dock: ${global.stage.get_actor_at_pos(t.Clutter.PickMode.REACTIVE, probeX, probeY)}`);
    await t.shot('05-maximized');

    await edge();
    t.log(`edge: shown=${dock._shown} revealed=${dock._revealed}`);
    await t.shot('06-revealed');

    await t.move(960, 300);
    await t.wait(1200);
    t.log(`away: shown=${dock._shown}`);

    // Click the focused single-window app: it should minimize.
    await t.move(ex, ey);
    t.log(`before click: focus=${t.Shell.WindowTracker.get_default().focus_app?.get_id()}`);
}

// Drag a pinned icon to a new place, with the user's settings.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_boolean('magnify-push', true);
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const favs = () => global.settings.get_strv('favorite-apps').map(v => v.replace('.desktop', '').split(/[._]/).pop()).join(' ');
    const centre = id => { const it = dock._items.get(id); const [x, y] = it.get_transformed_position(); const [w, h] = it.get_transformed_size(); return [x + w / 2, y + h / 2]; };
    const p = t.Clutter.get_default_backend().get_default_seat().create_virtual_device(t.Clutter.InputDeviceType.POINTER_DEVICE);
    const now = () => t.GLib.get_monotonic_time();
    const drag = async (fromId, toX, toY, name) => {
        const [fx, fy] = centre(fromId);
        await t.move(fx, fy, 500);
        p.notify_button(now(), t.Clutter.BUTTON_PRIMARY, t.Clutter.ButtonState.PRESSED);
        await t.wait(300);
        for (let i = 1; i <= 25; i++) {
            p.notify_absolute_motion(now(), fx + (toX - fx) * i / 25, fy + (toY - fy) * i / 25);
            await t.wait(25);
        }
        await t.wait(300);
        const gap = dock._box.get_children().filter(c => !c.app && c.restMain === dock._g.cell && !c.setScale);
        t.log(`  mid-drag ${name}: gaps ${gap.length} width ${gap.map(c => c.width.toFixed(0)).join(',')}`);
        await t.shot(name);
        p.notify_button(now(), t.Clutter.BUTTON_PRIMARY, t.Clutter.ButtonState.RELEASED);
        await t.wait(900);
    };
    t.log(`before:        ${favs()}`);
    const DND = await import('resource:///org/gnome/shell/ui/dnd.js');
    let overs = 0, lastTarget = '';
    const orig = dock.handleDragOver.bind(dock);
    dock.handleDragOver = (...a) => { overs++; return orig(...a); };
    DND.addDragMonitor({dragMotion: e => {
        let a = e.targetActor, chain = [];
        for (let i = 0; a && i < 6; i++, a = a.get_parent())
            chain.push(`${a.constructor.name}${a.reactive ? '' : '(nr)'}${a._delegate?.handleDragOver ? '*' : ''}`);
        lastTarget = chain.join(' < ');
        return DND.DragMotionResult.CONTINUE;
    }});
    const [tx, ty] = centre('org.gnome.Calculator.desktop');
    const [first, second] = t.favs();
    await drag(second, tx + 10, ty, 'drag1');
    t.log(`second→calc: ${favs()} | handleDragOver calls ${overs} | target ${lastTarget}`);
    const [bx, by] = centre(first);
    await drag('org.gnome.Calculator.desktop', bx - 25, by, 'drag2');
    t.log(`calc→first:    ${favs()}`);
    // Dropped off the dock: nothing changes and the icon comes back.
    const [nx, ny] = centre('org.gnome.Nautilus.desktop');
    await drag('org.gnome.Nautilus.desktop', nx, ny - 400, 'drag3');
    const files = dock._items.get('org.gnome.Nautilus.desktop');
    t.log(`dropped away:  ${favs()} | files visible=${files.visible} placeholders=${dock._box.get_children().filter(c => !c.app && !c.setScale && c.restMain === dock._g.cell).length}`);
    // Pin a running app by dragging it among the pinned ones.
    const pin = t.env('PIN_APP', 'org.gnome.Settings.desktop');
    t.launch(pin);
    await t.wait(3000);
    await t.move(960, 300, 600);
    const [sx, sy] = centre('org.gnome.Nautilus.desktop');
    await drag(pin, sx + 10, sy, 'drag4');
    t.log(`pinned:        ${favs()}`);
}

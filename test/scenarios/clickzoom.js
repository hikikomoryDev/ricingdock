// Clicks on the magnified part of an icon, outside its resting square.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', t.GLib.getenv('MODE') || 'full');
    s.set_double('magnify-scale', Number(t.GLib.getenv('SCALE') || 1.5));
    s.set_boolean('magnify-push', t.GLib.getenv('PUSH') !== '0');
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const it = dock._items.get('org.gnome.Nautilus.desktop');
    let clicks = 0;
    it.connect('clicked', () => clicks++);
    it.activate = () => {};   // count only, don't open Files
    const [x, y] = it.get_transformed_position();
    const [w, h] = it.get_transformed_size();
    await t.move(x + w / 2, y + h / 2, 800);             // zoom in
    const [tx, ty] = it.tile.get_transformed_position();
    const [tw, th] = it.tile.get_transformed_size();
    t.log(`slot ${x.toFixed(0)},${y.toFixed(0)} ${w}x${h} | zoomed tile ${tx.toFixed(0)},${ty.toFixed(0)} ${tw.toFixed(0)}x${th.toFixed(0)}`);
    const pad = (w - it.icon.get_transformed_size()[0] / (it.currentScale || 1)) / 2;
    const spots = {
        'slot corner (outside picture)': [x + 3, y + 3],
        'slot bottom edge': [x + w / 2, y + h - 3],
        centre: [tx + tw / 2, ty + th / 2],
        'above slot': [tx + tw / 2, ty + 4],
        'left edge': [tx + 3, ty + th * 0.6],
        'right edge': [tx + tw - 3, ty + th * 0.6],
    };
    const owner = a => { while (a && !a.app) a = a.get_parent(); return a?.app?.get_id() ?? `${a}`; };
    for (const [name, [px, py]] of Object.entries(spots)) {
        await t.move(x + w / 2, y + h / 2, 800);         // zoomed again
        const picked = global.stage.get_actor_at_pos(t.Clutter.PickMode.REACTIVE, px, py);
        const before = clicks;
        await t.click(px, py, t.Clutter.BUTTON_PRIMARY, 250);
        t.log(`${name}: ${clicks > before ? 'CLICKED' : 'missed'} (under pointer: ${owner(picked)})`);
    }
}

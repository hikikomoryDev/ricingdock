// Hover an icon, then wiggle the pointer by a pixel the way a hand does, and
// watch whether the other icons move.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const ids = [...dock._items.keys()];
    const files = dock._items.get('org.gnome.Nautilus.desktop');
    const [x, y] = files.get_transformed_position();
    const [w, h] = files.get_transformed_size();
    const cx = x + w / 2, cy = y + h / 2;
    await t.move(cx, cy, 800);                      // settle on Files
    const pos = () => ids.map(id => dock._items.get(id).get_transformed_position()[0]);
    const base = pos();
    const moved = new Map();
    let relayouts = 0;
    dock._box.connect('notify::allocation', () => relayouts++);
    for (let i = 0; i < 40; i++) {
        await t.move(cx + (i % 2 ? 1 : -1), cy + (i % 3) - 1, 50);
        pos().forEach((p, k) => {
            const d = Math.abs(p - base[k]);
            if (d > 0.01)
                moved.set(ids[k], Math.max(moved.get(ids[k]) ?? 0, d));
        });
    }
    t.log(`row relayouts while wiggling: ${relayouts}`);
    t.log(`icons that moved (max px): ${[...moved].map(([k, v]) => `${k.split(/[._]/)[k.startsWith('org') ? 2 : 0]}=${v.toFixed(2)}`).join(' ') || 'none'}`);
    t.log(`files scale ${files.currentScale} x positions: ${base.map(v => v.toFixed(2)).join(' ')}`);
}

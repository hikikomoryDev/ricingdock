// During the grow and shrink animation, every other icon should move in one
// direction only. Count direction reversals per icon, frame by frame.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const s = t.dock()._settings;
    s.set_string('mode', t.GLib.getenv('MODE') || 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const ids = [...dock._items.keys()];
    const files = dock._items.get('org.gnome.Nautilus.desktop');
    const [x, y] = files.get_transformed_position();
    const [w, h] = files.get_transformed_size();
    const run = async (label, px, py) => {
        const track = ids.map(() => []);
        const hoveredIcon = [];
        const sample = () => {
            ids.forEach((id, k) => track[k].push(dock._items.get(id).get_transformed_position()[0]));
            const [ix] = files.icon.get_transformed_position();
            const [iw] = files.icon.get_transformed_size();
            hoveredIcon.push(ix + iw / 2);
        };
        await t.move(px, py, 1);
        for (let i = 0; i < 45; i++) {
            sample();
            await t.wait(10);
        }
        let reversals = 0, worst = '';
        track.forEach((xs, k) => {
            let dir = 0, rev = 0;
            for (let i = 1; i < xs.length; i++) {
                const d = xs[i] - xs[i - 1];
                if (Math.abs(d) < 1e-3)
                    continue;
                const sgn = Math.sign(d);
                if (dir && sgn !== dir)
                    rev++;
                dir = sgn;
            }
            reversals += rev;
            if (rev)
                worst += ` ${ids[k].split(/[._]/)[ids[k].startsWith('org') ? 2 : 0]}:${rev}`;
        });
        const c = hoveredIcon.filter(v => isFinite(v));
        const drift = Math.max(...c) - Math.min(...c);
        t.log(`${label}: direction reversals ${reversals}${worst} | hovered icon centre drift ${drift.toFixed(2)} px`);
    };
    await run('grow', x + w / 2, y + h / 2);
    await run('shrink', 960, 400);
}

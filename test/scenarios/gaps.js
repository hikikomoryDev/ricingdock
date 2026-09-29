// Gaps either side of the hovered icon, for the first icon hovered and for
// icons reached by moving along the row.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(1000);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_double('magnify-scale', Number(t.GLib.getenv('SCALE') || 1.3));
    s.set_boolean('magnify-push', true);
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const items = [...dock._items.values()];
    const rest = items.map(it => { const [x] = it.get_transformed_position(); const [w] = it.get_transformed_size(); return x + w / 2; });
    const [, y0] = items[0].get_transformed_position();
    const [, h] = items[0].get_transformed_size();
    const centres = () => items.map(it => { const [x] = it.icon.get_transformed_position(); const [w] = it.icon.get_transformed_size(); return x + w / 2; });
    const report = (label, k) => {
        const c = centres();
        const shifts = c.map((v, i) => (v - rest[i]).toFixed(1)).join(' ');
        t.log(`${label}: hovered #${k} | gap left ${(c[k] - c[k - 1]).toFixed(1)} right ${(c[k + 1] - c[k]).toFixed(1)} (rest pitch ${(rest[1] - rest[0]).toFixed(1)}) | shifts ${shifts}`);
    };
    await t.move(rest[3], y0 + h / 2, 900);
    report('first hover', 3);
    await t.shot('hover3');
    await t.glide(rest[3], y0 + h / 2, rest[5], y0 + h / 2, 10, 250);
    await t.wait(900);
    report('moved along', 5);
    await t.shot('hover5');
    await t.glide(rest[5], y0 + h / 2, rest[7], y0 + h / 2, 10, 250);
    await t.wait(900);
    report('moved again', 7);
}

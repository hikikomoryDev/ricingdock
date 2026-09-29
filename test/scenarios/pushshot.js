export default async function (t) {
    await t.move(960, 300);
    await t.wait(1000);
    const s = t.dock()._settings;
    s.set_string('mode', 'island');
    s.set_double('magnify-scale', 1.5);
    s.set_boolean('magnify-push', true);
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const items = [...dock._items.values()];
    for (const [name, idx] of [['first', 0], ['middle', 5]]) {
        const it = items[idx];
        const [x, y] = it.get_transformed_position();
        const [w, h] = it.get_transformed_size();
        await t.move(x + w / 2, y + h / 2, 700);
        await t.shot(name);
    }
}

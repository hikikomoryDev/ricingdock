// Hovering an edge-pinned Show Apps button (or empty dock) must not zoom
// any icon of the row.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    const dock = () => t.dock()._dock;
    const report = label => {
        const big = [...dock()._items.values()].filter(it => it.currentScale > 1.001)
            .map(it => `${it.app.get_id().split(/[._]/)[it.app.get_id().startsWith('org') ? 2 : 0]}:${it.currentScale.toFixed(2)}`);
        t.log(`${label}: ${big.join(' ') || 'no icon zoomed'} | button ${dock()._showApps.currentScale.toFixed(2)}`);
    };
    for (const pos of ['start-edge', 'end-edge']) {
        s.set_string('show-apps-position', pos);
        await t.wait(700);
        const b = dock()._showApps;
        const [bx, by] = b.get_transformed_position();
        const first = [...dock()._items.values()][0];
        const [fx, fy] = first.get_transformed_position();
        await t.move(fx + 30, fy + 30, 700);                // on the first icon
        report(`${pos}: on first icon`);
        await t.glide(fx + 30, fy + 30, bx + 30, by + 30, 10, 200);   // over to the button
        await t.wait(700);
        report(`${pos}: on the button`);
        await t.move(1500, by + 30, 700);                   // empty part of the bar
        report(`${pos}: empty bar`);
        await t.move(960, 300, 600);
    }
}

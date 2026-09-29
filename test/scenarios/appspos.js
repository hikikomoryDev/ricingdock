// Show Apps at each place, in full width and island; side padding.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('visibility', 'fixed');
    s.set_boolean('magnify-push', true);
    s.set_double('magnify-scale', 1.3);
    const dock = () => t.dock()._dock;
    const mon = t.Main.layoutManager.primaryMonitor;
    const cases = [
        ['full', 'end', 'center', 8], ['full', 'start', 'center', 8],
        ['full', 'end-edge', 'center', 8], ['full', 'start-edge', 'center', 24],
        ['full', 'start-edge', 'start', 8], ['full', 'end-edge', 'end', 8],
        ['island', 'end-edge', 'center', 30], ['island', 'start', 'center', 8],
    ];
    for (const [mode, pos, align, sides] of cases) {
        s.set_string('mode', mode);
        s.set_string('show-apps-position', pos);
        s.set_string('alignment', align);
        s.set_int('padding-sides', sides);
        await t.wait(700);
        const d = dock();
        const b = d._showApps;
        const [bx] = b.get_transformed_position();
        const [bw] = b.get_transformed_size();
        const items = [...d._items.values()];
        const xs = items.map(it => it.get_transformed_position()[0]);
        const first = Math.min(...xs), last = Math.max(...xs) + 60;
        const [px] = d._panel.get_transformed_position();
        const [pw] = d._panel.get_transformed_size();
        t.log(`${mode} ${pos} align=${align} sides=${sides}: button x ${bx}..${bx + bw} (in ${b.get_parent() === d._box ? 'row' : 'panel'}) | icons ${first}..${last} | panel ${px}..${px + pw} | origin ok=${Math.abs(d._restOrigin - first) < 0.5 || b.get_parent() === d._box}`);
        await t.shot(`${mode}-${pos}-${align}`);
    }
    // Hovering the edge button zooms it; clicking it opens the app grid.
    s.set_string('mode', 'full');
    s.set_string('show-apps-position', 'end-edge');
    s.set_string('alignment', 'center');
    await t.wait(700);
    const b = dock()._showApps;
    const [bx, by] = b.get_transformed_position();
    await t.move(bx + 30, by + 30, 600);
    t.log(`edge button hover scale ${b.currentScale.toFixed(2)}`);
    await t.click(bx + 30, by + 30, t.Clutter.BUTTON_PRIMARY, 1200);
    t.log(`app grid open: ${t.Main.overview.visible && t.Main.overview.dash.showAppsButton.checked}`);
}

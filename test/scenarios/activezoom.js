// The focused app's icon stays magnified with the pointer away.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    const dock = () => t.dock()._dock;
    const tracker = t.Shell.WindowTracker.get_default();
    const scales = () => [...dock()._items.values()].map(it => `${it.app.get_id().split(/[._]/)[it.app.get_id().startsWith('org') ? 2 : 0].slice(0, 5)}:${it.currentScale.toFixed(2)}`).filter(v => !v.endsWith('1.00')).join(' ') || 'all 1.00';
    t.log(`nothing focused: ${scales()}`);
    t.launch('org.gnome.Calculator.desktop');
    for (let i = 0; i < 20 && tracker.focus_app?.get_id() !== 'org.gnome.Calculator.desktop'; i++)
        await t.wait(300);
    await t.wait(800);
    t.log(`calculator focused, pointer away: ${scales()}`);
    const files = dock()._items.get('org.gnome.Nautilus.desktop');
    const [x, y] = files.get_transformed_position();
    await t.move(x + 30, y + 30, 800);
    t.log(`hover Files: ${scales()}`);
    await t.move(960, 300, 900);
    t.log(`pointer away again: ${scales()}`);
    const calc = dock()._items.get('org.gnome.Calculator.desktop');
    const [cx, cy] = calc.get_transformed_position();
    await t.move(cx + 30, cy + 30, 800);
    t.log(`hover the active Calculator: ${scales()}`);
    const [fx, fy] = files.get_transformed_position();
    files.app.activate = files.app.activate;
    await t.move(fx + 30, fy + 30, 800);
    t.log(`hover Files again: ${scales()}`);
    await t.move(960, 300, 900);
    t.launch('org.gnome.TextEditor.desktop');
    for (let i = 0; i < 20 && tracker.focus_app?.get_id() !== 'org.gnome.TextEditor.desktop'; i++)
        await t.wait(300);
    await t.wait(800);
    t.log(`editor focused: ${scales()}`);
    const c2 = dock()._items.get('org.gnome.Calculator.desktop');
    const [qx, qy] = c2.get_transformed_position();
    await t.move(qx + 30, qy + 30, 800);
    t.log(`hover inactive Calculator: ${scales()}`);
    await t.click(qx + 30, qy + 30, t.Clutter.BUTTON_PRIMARY, 1000);
    t.log(`clicked it (focus ${tracker.focus_app?.get_id()}): ${scales()}`);
    await t.move(960, 300, 900);
    s.set_boolean('magnify-active', false);
    await t.wait(800);
    t.log(`option off: ${scales()}`);
    s.set_boolean('magnify-active', true);
    await t.wait(800);
    t.log(`option on: ${scales()}`);
    await t.shot('active');
}

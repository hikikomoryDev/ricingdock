// Clicking a magnified icon makes it active: it shrinks smoothly from the
// hover size to the active size, never dipping below it.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(800);
    const s = t.dock()._settings;
    s.set_string('mode', 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_string('visibility', 'fixed');
    const dock = () => t.dock()._dock;
    const tracker = t.Shell.WindowTracker.get_default();
    t.launch('org.gnome.Calculator.desktop');
    for (let i = 0; i < 20 && tracker.focus_app?.get_id() !== 'org.gnome.Calculator.desktop'; i++)
        await t.wait(300);
    t.launch('org.gnome.TextEditor.desktop');
    for (let i = 0; i < 20 && tracker.focus_app?.get_id() !== 'org.gnome.TextEditor.desktop'; i++)
        await t.wait(300);
    await t.move(960, 300, 1000);
    const calc = dock()._items.get('org.gnome.Calculator.desktop');
    const [x, y] = calc.get_transformed_position();
    await t.move(x + 30, y + 30, 800);
    const seen = [];
    const tl = new t.Clutter.Timeline({actor: dock()._panel, duration: 1000, repeat_count: -1});
    tl.connect('new-frame', () => seen.push(calc.currentScale));
    tl.start();
    await t.click(x + 30, y + 30, t.Clutter.BUTTON_PRIMARY, 900);
    tl.stop();
    const min = Math.min(...seen);
    let ups = 0;
    for (let i = 1; i < seen.length; i++)
        if (seen[i] > seen[i - 1] + 1e-4) ups++;
    t.log(`after click: start ${seen[0].toFixed(3)} end ${seen.at(-1).toFixed(3)} min ${min.toFixed(3)} rises ${ups} over ${seen.length} frames | focus ${tracker.focus_app?.get_id()}`);
    const moving = seen.filter((v, i) => i > 0 && Math.abs(v - seen[i - 1]) > 1e-4);
    const steps = seen.slice(1).map((v, i) => v - seen[i]).filter(d => Math.abs(d) > 1e-4);
    t.log(`shrink frames: ${moving.length} | step sizes ${steps.map(d => d.toFixed(3)).join(' ')}`);
}

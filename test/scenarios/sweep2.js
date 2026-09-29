// Fast sweep with neighbours making room: sample every frame and count
// jerks (a move against the previous one) and whole-pixel steps.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(1000);
    const s = t.dock()._settings;
    s.set_string('mode', t.GLib.getenv('MODE') || 'full');
    s.set_double('magnify-scale', 1.3);
    s.set_boolean('magnify-push', true);
    s.set_string('visibility', 'fixed');
    await t.wait(800);
    const dock = t.dock()._dock;
    const items = [...dock._items.values()];
    const [x0, y0] = items[1].get_transformed_position();
    const [x1] = items[7].get_transformed_position();
    const [, h] = items[1].get_transformed_size();
    const track = items.map(() => []);
    const tl = new t.Clutter.Timeline({actor: dock._panel, duration: 1000, repeat_count: -1});
    const panelX = [], rowX = [], extras = [], focus = [], zoom = [];
    tl.connect('new-frame', () => {
        items.forEach((it, k) => track[k].push(it.get_transformed_position()[0]));
        panelX.push(dock._panel.get_transformed_position()[0]);
        rowX.push(dock._box.get_transformed_position()[0]);
        extras.push(dock._panel._extra ?? 0);
        focus.push(dock._focus);
        zoom.push(dock._zoom);
    });
    tl.start();
    await t.glide(x0, y0 + h / 2, x1, y0 + h / 2, 30, 450);
    await t.glide(x1, y0 + h / 2, x0, y0 + h / 2, 30, 450);
    await t.wait(500);
    tl.stop();
    let jerks = 0, steps = 0, moves = 0;
    const per = track.map(xs => {
        let j = 0;
        for (let i = 2; i < xs.length; i++) {
            const a = xs[i - 1] - xs[i - 2], b = xs[i] - xs[i - 1];
            if (Math.abs(b) > 1e-3) {
                moves++;
                if (Math.abs(b - Math.round(b)) < 1e-3)
                    steps++;
            }
            if (Math.abs(a) > 0.05 && Math.abs(b) > 0.05 && Math.sign(a) !== Math.sign(b))
                j++;
        }
        jerks += j;
        return j;
    });
    t.log(`frames ${track[0].length} | jerks per icon: ${per.join(' ')} (total ${jerks}) | whole-pixel steps ${steps} of ${moves} moves`);
    const rev = xs => { let r = 0; for (let i = 2; i < xs.length; i++) { const a = xs[i-1]-xs[i-2], b = xs[i]-xs[i-1]; if (Math.abs(a) > 0.01 && Math.abs(b) > 0.01 && Math.sign(a) !== Math.sign(b)) r++; } return r; };
    t.log(`panel x range ${Math.min(...panelX)}..${Math.max(...panelX)} reversals ${rev(panelX)} | row x range ${Math.min(...rowX)}..${Math.max(...rowX)} | extra range ${Math.min(...extras).toFixed(2)}..${Math.max(...extras).toFixed(2)} reversals ${rev(extras)} | zoom reversals ${rev(zoom)}`);
    const bg = dock._tint.get_transformed_size()[0], row = dock._box.get_transformed_size()[0];
    t.log(`panel extra at end ${dock._panel._extra} tint ${bg.toFixed(1)} row ${row.toFixed(1)}`);
}

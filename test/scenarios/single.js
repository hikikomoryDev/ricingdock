// Single-icon zoom: only the hovered icon grows, even with the pointer near
// its edge, and moving along the row hands the growth over smoothly.
export default async function (t) {
    await t.move(960, 400);
    await t.wait(1000);
    const dock = t.dock()._dock;
    const ids = [...dock._items.keys()];
    const scales = () => ids.map(id => dock._items.get(id).currentScale.toFixed(2)).join(' ');
    const files = dock._items.get('org.gnome.Nautilus.desktop');
    const [x, y] = files.get_transformed_position();
    const [w, h] = files.get_transformed_size();
    t.log(`order: ${ids.map(i => i.split(/[._]/)[i.startsWith('org') ? 2 : 0]).join(' ')}`);
    await t.move(x + w / 2, y + h / 2, 500);
    t.log(`center of Files: ${scales()}`);
    await t.shot('center');
    await t.move(x + 3, y + h / 2, 500);
    t.log(`left edge of Files: ${scales()}`);
    await t.move(x - 8, y + h / 2, 60);
    t.log(`just crossed to neighbour (60ms): ${scales()}`);
    await t.wait(400);
    t.log(`settled on neighbour: ${scales()}`);
    await t.shot('neighbour');
    await t.move(960, 400, 600);
    t.log(`pointer away: ${scales()} settling=${Boolean(dock._settleTimeline)}`);
    await t.wait(1500);
    t.log(`pointer away +1.5s: ${scales()} settling=${Boolean(dock._settleTimeline)}`);
}

// Holding Super shows 1–9 on pinned icons; a quick tap doesn't.
export default async function (t) {
    await t.move(960, 300);
    await t.wait(1000);
    const dock = t.dock()._dock;
    const kb = t.Clutter.get_default_backend().get_default_seat()
        .create_virtual_device(t.Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const now = () => t.GLib.get_monotonic_time();
    const hints = () => [...dock._items.values()].filter(it => it._hint).map(it => it._hint.child?.text ?? it._hint.text).join(',') || 'none';
    // Quick tap: under the hold delay.
    kb.notify_keyval(now(), t.Clutter.KEY_Super_L, t.Clutter.KeyState.PRESSED);
    await t.wait(150);
    t.log(`quick tap, while down: ${hints()}`);
    kb.notify_keyval(now(), t.Clutter.KEY_Super_L, t.Clutter.KeyState.RELEASED);
    await t.wait(600);
    t.Main.overview.hide();
    await t.wait(900);
    // Hold.
    kb.notify_keyval(now(), t.Clutter.KEY_Super_L, t.Clutter.KeyState.PRESSED);
    await t.wait(1300);
    t.log(`held 1.3 s: ${hints()}`);
    await t.shot('hints');
    kb.notify_keyval(now(), t.Clutter.KEY_Super_L, t.Clutter.KeyState.RELEASED);
    await t.wait(500);
    t.log(`released: ${hints()}`);
}

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 hikikomoriDev

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {css, textOn} from './util.js';

const MAX_DOTS = 4;
const SCROLL_COOLDOWN_US = 250 * 1000;
const MENU_SIDE = {bottom: St.Side.BOTTOM, left: St.Side.LEFT, right: St.Side.RIGHT};

// One square cell of the dock. Magnification grows the cell along the dock
// axis and lets the tile and icon overflow away from the screen edge; the
// cross-axis allocation never changes, so the dock background stays put.
const DockTile = GObject.registerClass(
class RicingDockTile extends St.Button {
    _init(dock, makeIcon, iconSize) {
        super._init({
            style_class: 'ricingdock-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
        });
        this._dock = dock;
        this._g = dock.geometry;
        this._scale = 1;
        this._iconPx = iconSize * this._g.sf;
        this.restMain = this._g.cell;
        this.labelText = '';

        this._content = new St.Widget();
        this.set_child(this._content);

        // Click area: the icon's whole column of the dock, halfway into the
        // gap on each side and across the full dock height, so wide spacing
        // or padding doesn't leave dead spots between icons.
        this._hit = new St.Widget({reactive: true});
        this._content.add_child(this._hit);

        this._body = new St.Widget();
        this._content.add_child(this._body);

        // Reactive so the whole magnified tile takes clicks and hover, not
        // just the icon's resting square; events bubble up to this button.
        this._tile = new St.Widget({style_class: 'ricingdock-tile', reactive: true});
        this._tile.animateLaunch = () => this.bounce();
        this._body.add_child(this._tile);

        // One picture, drawn at the magnified size and scaled down at rest,
        // so growing and shrinking is a smooth scale of the same image.
        this._iconDrawn = Math.round(iconSize * this._g.maxScale);
        this._iconRest = iconSize;
        this._icon = makeIcon(this._iconDrawn);
        // The picture and what is pinned to it (unread counter, progress bar)
        // share one frame that zooms as a whole, so the counter stays on the
        // icon's corner without being placed again every frame.
        this._iconFrame = new St.Widget();
        this._iconFrame.add_child(this._icon);
        this._body.add_child(this._iconFrame);
        this._framePx = this._iconDrawn * this._g.sf;

        this._indicator = new St.BoxLayout({
            style_class: 'ricingdock-indicator',
            orientation: this._g.vertical
                ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
        });
        this._content.add_child(this._indicator);

        this.connect('notify::hover', () => {
            this._syncPseudo();
            this._dock.onItemHover(this);
        });
        this.connect('notify::pressed', () => this._syncPseudo());
        // Label sizes need the theme, which only exists once on the stage.
        this.connect('notify::mapped', () => {
            if (this.mapped)
                this._placeExtras();
        });
        this.connect('destroy', () => this._onDestroy());

        this.restyle();
        this.setScale(1, this._g.cell);
    }

    get tile() {
        return this._tile;
    }

    setClickable(on) {
        this.reactive = on;
        this._tile.reactive = on;
        this._hit.reactive = on;
    }

    get currentScale() {
        return this._scale;
    }

    get icon() {
        return this._icon;
    }

    _onDestroy() {
        this.destroyed = true;
        this._body.remove_all_transitions();
    }

    _syncPseudo() {
        const highlight = this._dock.settings.get_boolean('hover-highlight');
        if (highlight && (this.hover || this._forcedHover))
            this._tile.add_style_pseudo_class('hover');
        else
            this._tile.remove_style_pseudo_class('hover');
        if (highlight && this.pressed)
            this._tile.add_style_pseudo_class('active');
        else
            this._tile.remove_style_pseudo_class('active');
    }

    setForcedHover(on) {
        this._forcedHover = on;
        this._syncPseudo();
    }

    restyle() {
        const radius = Math.round(this._g.iconSize * 0.28);
        // Attention is shown by a bounce only (setUrgent); no highlight.
        this._tile.set_style(`border-radius: ${radius}px;`);
        this._syncPseudo();
        this._updateIndicator();
    }

    // s: how much the icon is magnified; main: the whole-pixel length its
    // slot takes along the row. The dock picks `main` for all icons at once
    // (see Dock._setScales) so neighbours never jitter by a pixel.
    setScale(s, main = Math.round(this._g.cell * s)) {
        if (s === this._scale && main === this._main)
            return;
        this._scale = s;
        if (main !== this._main) {
            this._main = main;
            this._placeSlot(main);
        }
        // Per frame only the zoom changes: nothing works out a position
        // again, which is what made icons shimmer while they grew.
        this._tile.set_scale(s, s);
        const k = s * this._iconRest / this._iconDrawn;
        this._iconFrame.set_scale(k, k);
    }

    // Puts the tile and the picture where they rest in a slot of `main`
    // pixels, and pins the point they zoom around: the middle of the side
    // that faces the screen edge.
    _placeSlot(main) {
        const g = this._g;
        if (g.vertical)
            this.set_size(g.cell, main);
        else
            this.set_size(main, g.cell);
        const [px, py] = {bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5]}[g.position];

        // Across: from the dock's far side to its screen edge; along: half
        // the spacing beyond the slot on each side.
        const before = g.position === 'right' ? g.padTop : g.position === 'left' ? g.padBottom : g.padTop;
        const halfGap = g.spacing / 2;
        if (g.vertical)
            this._hit.set_position(-before, (main - g.cell) / 2 - halfGap);
        else
            this._hit.set_position((main - g.cell) / 2 - halfGap, -before);
        if (g.vertical)
            this._hit.set_size(g.panelCross, g.cell + g.spacing);
        else
            this._hit.set_size(g.cell + g.spacing, g.panelCross);

        const along = (main - g.cell) / 2;
        this._tile.set_size(g.cell, g.cell);
        if (g.vertical)
            this._tile.set_position(0, along);
        else
            this._tile.set_position(along, 0);
        this._tile.set_pivot_point(px, py);

        // The frame holds the full-size picture; at rest it is scaled down
        // around its pivot so the icon sits `pad` in from the tile's edge.
        const size = this._framePx;
        const pad = (g.cell - this._iconPx) / 2;
        let fx, fy;
        if (g.position === 'bottom') {
            fx = main / 2 - size / 2;
            fy = g.cell - pad - size;
        } else if (g.position === 'left') {
            fx = pad;
            fy = main / 2 - size / 2;
        } else {
            fx = g.cell - pad - size;
            fy = main / 2 - size / 2;
        }
        this._iconFrame.set_size(size, size);
        this._iconFrame.set_position(fx, fy);
        this._iconFrame.set_pivot_point(px, py);
        this._placeIndicator();
    }

    // Badge and progress bar: subclasses fill these in.
    _placeExtras() {
    }

    _indicatorCount() {
        return 0;
    }

    _updateIndicator() {
        const g = this._g;
        const ind = this._indicator;
        ind.destroy_all_children();
        this._indicatorSize = [0, 0];
        const n = this._indicatorCount();
        const style = this._dock.settings.get_string('indicator-style');
        if (n === 0 || style === 'none')
            return;

        const alpha = this._focused ? 1 : 0.55;
        const color = css(this._dock.accent, alpha);
        const d = g.dot;
        const gap = Math.max(2, Math.round(d * 0.75 / g.sf));
        let mainTotal = 0, crossMax = 0;
        const put = (main, cross) => {
            mainTotal += (mainTotal > 0 ? gap * g.sf : 0) + main;
            crossMax = Math.max(crossMax, cross);
            const w = new St.Widget({
                style: `background-color: ${color}; border-radius: ${Math.ceil(cross / g.sf / 2)}px;`,
            });
            if (g.vertical)
                w.set_size(cross, main);
            else
                w.set_size(main, cross);
            ind.add_child(w);
        };
        ind.set_style(`spacing: ${gap}px;`);
        if (style === 'dots') {
            for (let i = 0; i < Math.min(n, MAX_DOTS); i++)
                put(d, d);
        } else if (style === 'pill') {
            put(Math.round(d * (1 + 1.5 * Math.min(n, MAX_DOTS))), d);
        } else {
            put(Math.round(g.cell * (this._focused ? 0.55 : 0.32)), Math.max(g.sf * 2, Math.round(d * 0.75)));
        }
        this._indicatorSize = g.vertical ? [crossMax, mainTotal] : [mainTotal, crossMax];
        this._placeIndicator();
    }

    _placeIndicator() {
        const g = this._g;
        const ind = this._indicator;
        // Centred on the icon's place in the row, not on the growing tile,
        // so the dots stay put while the icon zooms.
        const size = this._main ?? g.cell;
        const [w, h] = this._indicatorSize ?? [0, 0];
        if (!g.vertical)
            ind.set_position(Math.round((size - w) / 2), g.cell + g.dotGap);
        else if (g.position === 'left')
            ind.set_position(-g.dotGap - w, Math.round((size - h) / 2));
        else
            ind.set_position(g.cell + g.dotGap, Math.round((size - h) / 2));
    }

    // A launch and a call for attention each have their own switch.
    bounce(attention = false) {
        const key = attention ? 'attention-bounce' : 'launch-bounce';
        if (!this._dock.settings.get_boolean(key) || this._bouncing)
            return;
        const g = this._g;
        const prop = g.vertical ? 'translation_x' : 'translation_y';
        const height = g.growSign * Math.round(g.cell * 0.32);
        this._bouncing = true;
        // onStopped, not onComplete: an interrupted hop must still clear the
        // flag, or the icon would never bounce again.
        const hop = left => {
            this._body.ease({
                [prop]: height,
                duration: this._dock.ms(220),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: up => {
                    if (!up) {
                        this._bouncing = false;
                        this._body[prop] = 0;
                        return;
                    }
                    this._body.ease({
                        [prop]: 0,
                        duration: this._dock.ms(260),
                        mode: Clutter.AnimationMode.EASE_OUT_BOUNCE,
                        onStopped: down => {
                            if (down && left > 1) {
                                hop(left - 1);
                            } else {
                                this._bouncing = false;
                                this._body[prop] = 0;
                            }
                        },
                    });
                },
            });
        };
        hop(2);
    }
});

export const AppItem = GObject.registerClass(
class RicingDockAppItem extends DockTile {
    _init(dock, app) {
        super._init(dock, size => app.create_icon_texture(size), dock.geometry.iconSize);
        this.app = app;
        this.labelText = app.get_name();
        this._delegate = this;
        this._lastScroll = 0;

        this._draggable = DND.makeDraggable(this, {timeoutThreshold: 200});
        this._draggable.connect('drag-begin', () => {
            Main.overview.beginItemDrag(this);
            this._dock.onItemDragBegin(this);
        });
        this._draggable.connect('drag-cancelled', () => Main.overview.cancelledItemDrag(this));
        this._draggable.connect('drag-end', () => {
            Main.overview.endItemDrag(this);
            this._dock.onItemDragEnd(this);
        });

        const rightClick = new Clutter.ClickGesture({
            required_button: Clutter.BUTTON_SECONDARY,
            recognize_on_press: true,
        });
        rightClick.connect('recognize', () => this.popupMenu());
        this.add_action(rightClick);

        this.connect('scroll-event', (actor, event) => this._onScroll(event));
        app.connectObject(
            'windows-changed', () => this._updateIndicator(),
            'notify::state', () => this._updateIndicator(),
            this);
        this._updateIndicator();
        this.updateBadge();
    }

    _onDestroy() {
        super._onDestroy();
        this._menu?.destroy();
        this._menu = null;
    }

    // --- DND source ---
    getDragActor() {
        return this.app.create_icon_texture(this._g.iconSize);
    }

    getDragActorSource() {
        return this.icon;
    }

    windows() {
        return this.app.get_windows().filter(w => !w.is_skip_taskbar());
    }

    _indicatorCount() {
        if (!this.app || this.app.state === Shell.AppState.STOPPED)
            return 0;
        return Math.max(1, this.windows().length);
    }

    setFocused(focused) {
        if (this._focused === focused)
            return;
        this._focused = focused;
        if (focused)
            this.setUrgent(false);
        this._updateIndicator();
    }

    setUrgent(urgent) {
        urgent = Boolean(urgent);
        if (this._urgent === urgent)
            return;
        this._urgent = urgent;
        if (urgent)
            this.bounce(true);
    }

    vfunc_clicked(button) {
        this.activate(button);
    }

    activate(button) {
        const app = this.app;
        const event = Clutter.get_current_event();
        const mods = event ? event.get_state() : 0;
        const ctrl = (mods & Clutter.ModifierType.CONTROL_MASK) !== 0;
        const wantNew = button === Clutter.BUTTON_MIDDLE || ctrl;

        if (wantNew && app.can_open_new_window()) {
            this.bounce();
            app.open_new_window(-1);
            Main.overview.hide();
            return;
        }
        if (app.state !== Shell.AppState.RUNNING) {
            this.bounce();
            app.activate();
            Main.overview.hide();
            return;
        }

        const windows = this.windows();
        const focused = Shell.WindowTracker.get_default().focus_app === app;
        if (!Main.overview.visible && focused && windows.length > 0 &&
            this._dock.settings.get_string('click-action') === 'cycle') {
            if (windows.length === 1)
                windows[0].minimize();
            else
                this.cycleWindows(1);
            return;
        }
        app.activate();
        Main.overview.hide();
    }

    cycleWindows(dir) {
        const windows = this.windows().sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
        if (windows.length === 0)
            return;
        const current = windows.indexOf(global.display.focus_window);
        let next;
        if (current === -1)
            next = dir > 0 ? 0 : windows.length - 1;
        else
            next = (current + dir + windows.length) % windows.length;
        Main.activateWindow(windows[next]);
    }

    _onScroll(event) {
        if (!this._dock.settings.get_boolean('scroll-cycles') ||
            this.app.state !== Shell.AppState.RUNNING)
            return Clutter.EVENT_PROPAGATE;
        let dir = 0;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
        case Clutter.ScrollDirection.LEFT:
            dir = -1;
            break;
        case Clutter.ScrollDirection.DOWN:
        case Clutter.ScrollDirection.RIGHT:
            dir = 1;
            break;
        case Clutter.ScrollDirection.SMOOTH: {
            const [dx, dy] = event.get_scroll_delta();
            const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
            dir = delta > 0.3 ? 1 : delta < -0.3 ? -1 : 0;
            break;
        }
        }
        const now = GLib.get_monotonic_time();
        if (dir === 0 || now - this._lastScroll < SCROLL_COOLDOWN_US)
            return Clutter.EVENT_STOP;
        this._lastScroll = now;
        this.cycleWindows(dir);
        return Clutter.EVENT_STOP;
    }

    popupMenu() {
        if (!this._menu) {
            this._menu = new AppMenu(this._tile, MENU_SIDE[this._g.position], {
                favoritesSection: true,
                showSingleWindows: true,
            });
            this._menu.setApp(this.app);
            this._menu.connect('open-state-changed', (menu, open) => {
                if (!open) {
                    this.setForcedHover(false);
                    this._dock.onMenuClosed(this);
                }
            });
            Main.overview.connectObject('hiding', () => this._menu?.close(), this);
            Main.uiGroup.add_child(this._menu.actor);
            this._menuManager = new PopupMenu.PopupMenuManager(this);
            this._menuManager.addMenu(this._menu);
        }
        this._dock.onMenuOpened(this);
        this.setForcedHover(true);
        this._menu.open(BoxPointer.PopupAnimation.FULL);
        return Clutter.EVENT_STOP;
    }

    updateBadge() {
        const entry = this._dock.settings.get_boolean('show-badges')
            ? this._dock.badges.get(this.app.get_id()) : null;

        const count = entry?.countVisible && entry.count > 0 ? entry.count : 0;
        // A new unread message: hop, like asking for attention.
        if (count > (this._lastCount ?? count))
            this.bounce(true);
        this._lastCount = count;
        if (count) {
            if (!this._badge) {
                this._badge = new St.Label({style_class: 'ricingdock-badge', y_align: Clutter.ActorAlign.CENTER});
                // Re-pinned only when its own size changes (new number).
                this._badge.connect('notify::width', () => this._placeExtras());
                this._iconFrame.add_child(this._badge);
            }
            this._badge.text = count > 99 ? '99+' : String(count);
        } else {
            this._badge?.destroy();
            this._badge = null;
        }

        const progress = entry?.progressVisible ? Math.clamp(entry.progress, 0, 1) : -1;
        if (progress >= 0) {
            if (!this._progressTrack) {
                this._progressTrack = new St.Widget({style_class: 'ricingdock-progress-track'});
                this._progressFill = new St.Widget({style_class: 'ricingdock-progress-fill'});
                this._progressTrack.add_child(this._progressFill);
                this._iconFrame.add_child(this._progressTrack);
            }
            this._progress = progress;
        } else {
            this._progressTrack?.destroy();
            this._progressTrack = this._progressFill = null;
        }

        this.setUrgent(entry?.urgent && !this._focused);
        this._styleExtras();
        this._placeExtras();
    }

    restyle() {
        super.restyle();
        this._styleExtras?.();
    }

    _styleExtras() {
        const accent = this._dock.accent;
        // Sized for the full-size picture: the frame scales it down at rest.
        const font = Math.max(9, Math.round(this._iconDrawn * 0.27));
        this._badge?.set_style(
            `background-color: ${css(accent)}; color: ${textOn(accent)}; font-size: ${font}px;` +
            ` border-radius: ${font}px; min-width: ${Math.round(font * 0.9)}px;`);
        // Progress reads as a gauge, not as another running pill: a dark
        // groove with a light rim, filled from the left with the accent.
        const barH = this._progressHeight();
        this._progressTrack?.set_style(
            `border-radius: ${barH}px; background-color: rgba(16,16,22,0.78);` +
            ' border: 1.5px solid rgba(255,255,255,0.45);');
        this._progressFill?.set_style(`border-radius: ${barH}px; background-color: ${css(accent)};`);
        if (this._hint) {
            // A true circle of fixed size: dark glass, an accent ring and a
            // bold white digit, readable on any icon.
            const d = this._hintSize();
            this._hint.set_size(d, d);
            this._hint.set_style(
                `border-radius: ${d}px; background-color: rgba(16,16,22,0.86);` +
                ` border: ${Math.max(2, Math.round(d * 0.07))}px solid ${css(accent)};` +
                ' box-shadow: 0 2px 6px rgba(0,0,0,0.45);');
            this._hint.child.set_style(`color: #ffffff; font-weight: 800; font-size: ${Math.round(d * 0.5)}px;`);
        }
    }

    // Height of the progress gauge in icon-frame pixels.
    _progressHeight() {
        return Math.max(6, Math.round(this._framePx * 0.17 / this._g.sf));
    }

    // In icon-frame pixels (the full-size picture); the frame scales it.
    _hintSize() {
        return Math.round(this._framePx * 0.44 / this._g.sf);
    }

    // The Super+number shortcut this icon answers to, shown while Super is
    // held; null hides it. Pinned to the picture like the unread counter.
    // `delay` staggers the pop-in along the row.
    setHint(number, delay = 0) {
        if (number === null) {
            if (!this._hint)
                return;
            const hint = this._hint;
            this._hint = null;
            hint.ease({
                opacity: 0,
                scale_x: 0.7,
                scale_y: 0.7,
                duration: this._dock.ms(140),
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onStopped: () => hint.destroy(),
            });
            return;
        }
        if (!this._hint) {
            const label = new St.Label({
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._hint = new St.Bin({
                style_class: 'ricingdock-hint',
                child: label,
                opacity: 0,
                scale_x: 0.6,
                scale_y: 0.6,
                pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            });
            this._iconFrame.add_child(this._hint);
            this._styleExtras();
            this._placeExtras();
            this._hint.ease({
                opacity: 255,
                scale_x: 1,
                scale_y: 1,
                delay: this._dock.ms(delay),
                duration: this._dock.ms(220),
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            });
        }
        this._hint.child.text = String(number);
    }

    // In the icon frame's own coordinates: the frame is the full-size
    // picture, so these positions hold at every zoom level.
    _placeExtras() {
        const size = this._framePx;
        // Off the stage the label has no size yet; 'mapped' calls back here.
        if (this._badge?.get_stage()) {
            const [w, h] = this._badge.get_size();
            this._badge.set_position(Math.round(size - w * 0.75), Math.round(-h * 0.25));
        }
        // Top-left corner, mirroring the unread counter on the right and
        // clear of the running indicator below.
        if (this._hint) {
            const d = this._hintSize() * this._g.sf;
            this._hint.set_position(Math.round(-d * 0.25), Math.round(-d * 0.25));
        }
        // Inside the picture, over its lower part and well above the
        // running indicator.
        if (this._progressTrack) {
            const sf = this._g.sf;
            const w = Math.round(size * 0.76);
            const h = Math.round(this._progressHeight() * sf);
            // The fill sits inside the rim (its 1.5 px border) with a small gap.
            const rim = 1.5 * sf, gap = 1.5 * sf;
            this._progressTrack.set_position(Math.round((size - w) / 2), Math.round(size * 0.74 - h / 2));
            this._progressTrack.set_size(w, h);
            const innerW = w - 2 * (rim + gap), innerH = h - 2 * (rim + gap);
            this._progressFill.set_position(gap, gap);
            this._progressFill.set_size(Math.max(innerH, innerW * this._progress), innerH);
        }
    }
});

export const ShowAppsItem = GObject.registerClass(
class RicingDockShowApps extends DockTile {
    _init(dock) {
        super._init(dock, size => new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            icon_size: size,
            style_class: 'ricingdock-grid-icon',
        }), Math.round(dock.geometry.iconSize * 0.6));
        this.labelText = _('Show Apps');
        this._delegate = this;
    }

    vfunc_clicked() {
        const button = Main.overview.dash.showAppsButton;
        if (Main.overview.visible && button.checked)
            Main.overview.hide();
        else if (Main.overview.visible)
            button.checked = true;
        else
            Main.overview.showApps();
    }

    sync() {
        const on = Main.overview.visible && Main.overview.dash.showAppsButton.checked;
        if (on)
            this._tile.add_style_pseudo_class('checked');
        else
            this._tile.remove_style_pseudo_class('checked');
    }

    // Dropping a pinned app here unpins it, like the stock dash.
    handleDragOver(source) {
        const id = source?.app?.get_id();
        if (id && AppFavorites.getAppFavorites().isFavorite(id)) {
            this.setForcedHover(true);
            return DND.DragMotionResult.MOVE_DROP;
        }
        return DND.DragMotionResult.NO_DROP;
    }

    acceptDrop(source) {
        this.setForcedHover(false);
        const id = source?.app?.get_id();
        if (!id || !AppFavorites.getAppFavorites().isFavorite(id))
            return false;
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            AppFavorites.getAppFavorites().removeFavorite(id);
            return GLib.SOURCE_REMOVE;
        });
        return true;
    }
});

export const Separator = GObject.registerClass(
class RicingDockSeparator extends St.Widget {
    _init(g) {
        super._init({
            style_class: 'ricingdock-separator',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const len = Math.round(g.cell * 0.56);
        const thick = Math.max(1, g.sf);
        const pad = 2;
        if (g.vertical) {
            this.set_size(len, thick);
            this.set_style(`margin: ${pad}px 0;`);
        } else {
            this.set_size(thick, len);
            this.set_style(`margin: 0 ${pad}px;`);
        }
        this.restMain = thick + 2 * pad * g.sf;
    }
});

export const Placeholder = GObject.registerClass(
class RicingDockPlaceholder extends St.Widget {
    _init(g, dock) {
        super._init({style_class: 'ricingdock-placeholder'});
        this._g = g;
        this._dock = dock;
        this.set_size(g.cell, g.cell);
        this.restMain = g.cell;
    }

    // The gap opens and closes smoothly, like the stock dash's.
    animateIn() {
        const prop = this._g.vertical ? 'height' : 'width';
        this[prop] = 0;
        this.ease({[prop]: this._g.cell, duration: this._dock.ms(160), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    animateOut() {
        const prop = this._g.vertical ? 'height' : 'width';
        this.ease({
            [prop]: 0,
            duration: this._dock.ms(160),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.destroy(),
        });
    }
});

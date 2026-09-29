// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 hikikomoriDev

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import {AppItem, Placeholder, Separator, ShowAppsItem} from './items.js';
import {LauncherEntries} from './badges.js';
import {RoundedCornersEffect} from './effects.js';
import {css, parseColor} from './util.js';

// Keys that only change paint; everything not listed here and not read on
// use rebuilds the dock.
const STYLE_KEYS = new Set([
    'background-color', 'blur-radius', 'blur-brightness', 'corner-radius',
    'border-width', 'border-color', 'shadow', 'accent-color', 'indicator-style',
    'hover-highlight',
]);
const LIVE_KEYS = new Set([
    'padding-linked', 'animation-speed', 'attention-bounce', 'magnify-active', 'number-hints',
    'click-action', 'scroll-cycles', 'show-labels', 'launch-bounce', 'magnify-spread',
]);

const SHADOW_ROOM = 26;
const HOTZONE = 2;
const HIDE_DELAY = 450;
const REVEAL_DWELL = 140;
const LABEL_DELAY = 180;
// With the pointer away, the active app's icon keeps this share of the
// hover magnification (×1.3 on hover → ×1.135 at rest).
const ACTIVE_ZOOM = 0.45;
// How long Super must be held before the 1–9 hints appear.
const HINT_DELAY_MS = 350;
const SUPER = Clutter.ModifierType.MOD4_MASK | Clutter.ModifierType.SUPER_MASK;
// Time constant of the single-icon zoom, in seconds (about 350 ms to settle).
const SETTLE_TIME = 0.12;
const OVERLAP_TYPES = new Set([
    Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.TOOLBAR, Meta.WindowType.UTILITY, Meta.WindowType.SPLASHSCREEN,
]);

// Holds a monitor-sized copy of the wallpaper but must not ask the panel for
// that much room: it only fills whatever the icons need.
const BlurHolder = GObject.registerClass(
class RicingDockBlurHolder extends St.Widget {
    vfunc_get_preferred_width() {
        return [0, 0];
    }

    vfunc_get_preferred_height() {
        return [0, 0];
    }
});

// Where something of length `len` starts on a line of length `total`: flush
// with the start or end (keeping `gap` from the screen corner) or centered.
function alignedStart(total, len, align, gap) {
    if (align === 0)
        return gap;
    if (align === 1)
        return total - gap - len;
    return Math.round((total - len) / 2);
}

// Where the row starts inside a full-width dock of length `total`: by the
// alignment, stepping aside for a Show Apps button pinned at that same end.
function rowOffset(total, len, g) {
    let x = alignedStart(total, len, g.align, 0);
    const room = g.cell + g.spacing;
    if (g.loose === 'start' && g.align === 0)
        x += room;
    else if (g.loose === 'end' && g.align === 1)
        x -= room;
    return x;
}

// Full-width strip along the screen edge that places the dock panel itself:
// BinLayout in GNOME 50 centers children whatever their alignment says.
const Strip = GObject.registerClass(
class RicingDockStrip extends St.Widget {
    setPanel(panel, g) {
        this._panel = panel;
        this._g = g;
        this.queue_relayout();
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const panel = this._panel, g = this._g;
        if (!panel || !g)
            return;
        const W = box.get_width(), H = box.get_height();
        const [, , natW, natH] = panel.get_preferred_size();
        const child = new Clutter.ActorBox();
        if (!g.vertical) {
            const w = g.full ? W : Math.min(natW, W);
            child.x1 = g.full ? 0 : alignedStart(W, w, g.align, g.margin);
            child.x2 = child.x1 + w;
            child.y2 = H - g.margin;
            child.y1 = child.y2 - natH;
        } else {
            const h = g.full ? H : Math.min(natH, H);
            child.y1 = g.full ? 0 : alignedStart(H, h, g.align, g.margin);
            child.y2 = child.y1 + h;
            child.x1 = g.position === 'left' ? g.margin : W - g.margin - natW;
            child.x2 = child.x1 + natW;
        }
        panel.allocate(child);
    }
});

// The dock body: background layers fill it, the icon row sits at its natural
// length, placed by the alignment setting when the dock spans the whole edge.
const Panel = GObject.registerClass(
class RicingDockPanel extends St.Widget {
    setBox(box, g) {
        this._box = box;
        this._g = g;
        this.queue_relayout();
    }

    // While icons push each other aside, the island's background stretches
    // by `extra` so the outer icons stay on it; `align` says which way.
    // A Show Apps button pinned to the dock's start or end, outside the row.
    setLoose(actor, side) {
        if (actor === this._loose && side === this._looseSide)
            return;
        this._loose = actor;
        this._looseSide = side;
        this.queue_relayout();
    }

    setExtra(extra, align) {
        if (extra === this._extra && align === this._extraAlign)
            return;
        this._extra = extra;
        this._extraAlign = align;
        this.queue_relayout();
    }

    // The panel is as big as its row of icons. The default measure would
    // also count the background layers, which stretch past the panel while
    // icons make room, and the panel would re-centre and step sideways.
    vfunc_get_preferred_width(forHeight) {
        return this._box ? this._box.get_preferred_width(forHeight) : [0, 0];
    }

    vfunc_get_preferred_height(forWidth) {
        return this._box ? this._box.get_preferred_height(forWidth) : [0, 0];
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const W = box.get_width(), H = box.get_height();
        const e = this._extra ?? 0, a = this._extraAlign ?? 0.5;
        const vertical = this._g?.vertical;
        const full = new Clutter.ActorBox({
            x1: vertical ? 0 : -e * a,
            y1: vertical ? -e * a : 0,
            x2: vertical ? W : W + e * (1 - a),
            y2: vertical ? H + e * (1 - a) : H,
        });
        for (const child of this.get_children()) {
            if (child === this._loose && this._g) {
                this._allocateLoose(child, W, H);
                continue;
            }
            if (child !== this._box || !this._g) {
                child.allocate(full);
                continue;
            }
            const g = this._g;
            const [, , natW, natH] = child.get_preferred_size();
            const row = new Clutter.ActorBox();
            if (!g.vertical) {
                const w = Math.min(natW, W);
                row.x1 = g.full ? rowOffset(W, w, g) : alignedStart(W, w, 0.5, 0);
                row.x2 = row.x1 + w;
                row.y1 = Math.round((H - natH) / 2);
                row.y2 = row.y1 + natH;
            } else {
                const h = Math.min(natH, H);
                row.y1 = g.full ? rowOffset(H, h, g) : alignedStart(H, h, 0.5, 0);
                row.y2 = row.y1 + h;
                row.x1 = Math.round((W - natW) / 2);
                row.x2 = row.x1 + natW;
            }
            child.allocate(row);
        }
    }

    // At the side padding from the chosen end, level with the row's icons.
    _allocateLoose(child, W, H) {
        const g = this._g;
        const len = g.vertical ? H : W;
        const along = this._looseSide === 'start' ? g.padding : len - g.padding - g.cell;
        const across = g.position === 'left' ? g.padBottom : g.padTop;
        const b = new Clutter.ActorBox();
        if (g.vertical) {
            b.x1 = across;
            b.y1 = along;
        } else {
            b.x1 = along;
            b.y1 = across;
        }
        b.x2 = b.x1 + g.cell;
        b.y2 = b.y1 + g.cell;
        child.allocate(b);
    }
});

export class Dock {
    constructor(settings, badges, onGeometryChanged) {
        this.settings = settings;
        this._onGeometryChanged = onGeometryChanged;
        this.badges = badges;
        this._items = new Map();
        this._runningOrder = [];
        this._holds = 0;
        this._zoom = 0;
        this._zoomTarget = 0;
        this._pointer = null;
        this._shown = true;
        this._revealed = false;
        this._overlap = false;
        this._frozen = false;
        this._dragging = false;
        this._windows = new Set();

        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();
        this._favorites = AppFavorites.getAppFavorites();

        this._strip = new Strip({name: 'ricingdock', clip_to_allocation: true});
        this._panel = new Panel({
            style_class: 'ricingdock-panel',
            reactive: true,
            track_hover: true,
        });
        this._panel._delegate = this;
        this._shadow = new St.Widget({x_expand: true, y_expand: true});
        this._tint = new St.Widget({style_class: 'ricingdock-tint', x_expand: true, y_expand: true});
        this._box = new St.BoxLayout({
            style_class: 'ricingdock-box',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._strip.connect('destroy', () => (this._destroyed = true));
        this._panel.add_child(this._shadow);
        this._panel.add_child(this._tint);
        this._panel.add_child(this._box);
        this._strip.add_child(this._panel);
        Main.layoutManager.addChrome(this._strip, {trackFullscreen: true});

        this._label = new St.Label({style_class: 'ricingdock-label', visible: false});
        Main.layoutManager.addTopChrome(this._label);

        this._panel.connectObject(
            'notify::hover', () => this._onPanelHover(),
            'motion-event', (actor, event) => this._onMotion(event),
            'notify::allocation', () => this._syncBlurOffset(),
            'notify::translation-x', () => this._syncBlurOffset(),
            'notify::translation-y', () => this._syncBlurOffset(),
            this);

        this.settings.connectObject('changed', (s, key) => this._onSettingChanged(key), this);
        this._favorites.connectObject('changed', () => this._queueRedisplay(), this);
        this._appSystem.connectObject(
            'installed-changed', () => this._queueRedisplay(),
            'app-state-changed', () => this._queueRedisplay(),
            this);
        this._tracker.connectObject('notify::focus-app', () => this._syncFocus(), this);
        this.badges.connectObject('changed', (b, key) => this._onBadge(key), this);
        Main.layoutManager.connectObject('monitors-changed', () => this._rebuild(), this);
        St.ThemeContext.get_for_stage(global.stage).connectObject(
            'notify::scale-factor', () => this._rebuild(), this);
        Main.overview.connectObject(
            'showing', () => this._onOverview(),
            'hidden', () => this._onOverview(),
            'item-drag-begin', () => this._onDragStart(),
            'item-drag-end', () => this._onDragStop(),
            'item-drag-cancelled', () => this._onDragStop(),
            this);
        Main.overview.dash.showAppsButton.connectObject('notify::checked',
            () => this._showApps?.sync(), this);

        global.display.connectObject(
            'window-created', (d, w) => this._trackWindow(w),
            'restacked', () => this._queueOverlapCheck(),
            'workareas-changed', () => this._queueOverlapCheck(),
            'window-demands-attention', (d, w) => this._onAttention(w),
            'window-marked-urgent', (d, w) => this._onAttention(w),
            this);
        global.workspace_manager.connectObject('active-workspace-changed',
            () => this._queueOverlapCheck(), this);
        for (const actor of global.get_window_actors())
            this._trackWindow(actor.meta_window);

        this._rebuild();
        this._syncHintWatch();
    }

    destroy() {
        const alive = !this._destroyed;
        this._destroyed = true;
        this._stopHintWatch();
        for (const id of ['_redisplayId', '_rebuildId', '_overlapId', '_hideId', '_revealId', '_labelId', '_afterDropId']) {
            if (this[id])
                GLib.source_remove(this[id]);
            this[id] = 0;
        }
        this._zoomTimeline?.stop();
        this._settleTimeline?.stop();
        this._zoomTimeline = null;
        if (this._dragMonitor)
            DND.removeDragMonitor(this._dragMonitor);
        for (const w of this._windows)
            w.disconnectObject(this);
        this._windows.clear();
        for (const obj of [this.settings, this._favorites, this._appSystem, this._tracker,
            this.badges, Main.layoutManager, St.ThemeContext.get_for_stage(global.stage),
            Main.overview, Main.overview.dash.showAppsButton, global.display,
            global.workspace_manager])
            obj.disconnectObject(this);
        if (alive) {
            this._destroyBackground();
            this._strut?.destroy();
            this._hotzone?.destroy();
            this._label.destroy();
            this._strip.destroy();
        }
        this._items.clear();
    }

    // ---------------------------------------------------------------- items API

    get geometry() {
        return this._g;
    }

    get accent() {
        return this._accent;
    }

    // An animation length in ms, adjusted by the speed setting (percent).
    ms(base) {
        return Math.max(1, Math.round(base * 100 / this.settings.get_int('animation-speed')));
    }

    // Room the overview should leave for the dock along its edge.
    get footprint() {
        return this._g.margin + this._g.panelCross + Math.round(6 * this._g.sf);
    }

    onItemHover(item) {
        if (item.hover)
            this._scheduleLabel(item);
        else if (this._labelItem === item)
            this._hideLabel();
    }

    onMenuOpened() {
        this._hideLabel();
        this._frozen = true;
        this._hold();
    }

    onMenuClosed() {
        this._frozen = false;
        this._release();
        if (!this._panel.hover) {
            this._pointerIn = false;
            this._syncRestZoom();
        }
    }

    // The dragged icon leaves a gap where it was, so the row doesn't close
    // up the moment you pick it; the gap then follows the pointer.
    onItemDragBegin(item) {
        const index = this._visibleFavorites().indexOf(item);
        item.visible = false;
        if (index >= 0)
            this._showPlaceholder(index, this._visibleFavorites(), false);
    }

    onItemDragEnd(item) {
        // The dock may have been rebuilt (or reloaded) mid-drag.
        if (item.destroyed)
            return;
        // After a drop the icon reappears only once the row is in its new
        // order, right where the gap was, instead of flashing at its old place.
        if (this._afterDrop)
            this._afterDrop.item = item;
        else
            item.visible = true;
    }

    // ---------------------------------------------------------------- building

    _computeGeometry() {
        const s = this.settings;
        const sf = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const position = s.get_string('position');
        // The height is what the user picks; the icons get whatever the two
        // paddings leave. Paddings that would squeeze the icons below 16 px
        // are scaled down together.
        const height = s.get_int('dock-height');
        let padTop = s.get_int('padding-top');
        let padBottom = s.get_int('padding-bottom');
        const room = Math.max(0, height - 16);
        if (padTop + padBottom > room) {
            const k = room / (padTop + padBottom);
            padTop = Math.floor(padTop * k);
            padBottom = Math.floor(padBottom * k);
        }
        const cellL = height - padTop - padBottom;
        const iconSize = Math.max(8, Math.round(cellL * 0.8));
        const cell = cellL * sf;
        const maxScale = s.get_boolean('magnify') ? s.get_double('magnify-scale') : 1;
        // Space at both ends of the row (and between a full-width dock's
        // edge and a Show Apps button pinned there).
        const padding = s.get_int('padding-sides') * sf;
        const dot = Math.max(4, Math.round(iconSize / 12)) * sf;
        // Running dots sit in the bottom padding, or inside the tile when
        // that padding is too thin for them.
        const edgePad = padBottom * sf;
        const dotGap = edgePad >= dot + 2 * sf
            ? Math.round((edgePad - dot) / 2) : -(dot + sf);
        // The full-width dock always sits on the screen edge.
        const full = s.get_string('mode') === 'full';
        return {
            sf,
            position,
            vertical: position !== 'bottom',
            growSign: position === 'left' ? 1 : -1,
            iconSize,
            cell,
            spacing: s.get_int('spacing') * sf,
            padding,
            padTop: padTop * sf,
            padBottom: edgePad,
            margin: full ? 0 : s.get_int('margin') * sf,
            full,
            // 0 = start (left/top), 0.5 = center, 1 = end (right/bottom)
            align: {start: 0, center: 0.5, end: 1}[s.get_string('alignment')] ?? 0.5,
            appsPos: s.get_string('show-apps-position'),
            // A full-width dock can pin Show Apps to its very start or end,
            // apart from the row; an island has no room between, so there it
            // simply goes first or last in the row.
            loose: full ? {'start-edge': 'start', 'end-edge': 'end'}[s.get_string('show-apps-position')] ?? null : null,
            maxScale,
            dot,
            dotGap,
            panelCross: height * sf,
            headroom: Math.ceil(Math.max(cell * (maxScale - 1), cell * 0.34)),
        };
    }

    _rebuild() {
        if (this._destroyed)
            return;
        this._g = this._computeGeometry();
        const g = this._g;
        this._hideLabel();
        this._zoomTimeline?.stop();
        this._settleTimeline?.stop();
        this._zoom = this._zoomTarget = 0;
        this._focus = this._focusTarget = undefined;

        this._box.destroy_all_children();
        this._panel.setLoose(null, null);
        this._showApps?.destroy();
        this._items.clear();
        this._showApps = null;
        this._separator = null;
        this._placeholder = null;

        this._box.orientation = g.vertical
            ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        // St resets actor margins from CSS on every style change, so margins
        // go through the style too (in logical pixels).
        // Top means away from the screen edge, bottom means toward it.
        const [top, bottom, end] = [g.padTop, g.padBottom, g.padding].map(v => Math.round(v / g.sf));
        const margin = {
            bottom: `${top}px ${end}px ${bottom}px ${end}px`,
            left: `${end}px ${top}px ${end}px ${bottom}px`,
            right: `${end}px ${bottom}px ${end}px ${top}px`,
        }[g.position];
        this._box.set_style(`spacing: ${Math.round(g.spacing / g.sf)}px; margin: ${margin};`);

        this._accent = parseColor(this.settings.get_string('accent-color'));
        this._setupBackground();
        this._updateStyle();
        this._redisplay();
        this._relayout();
        this._syncVisibilityMode();
        this._syncFocus();
        this._onGeometryChanged?.();
    }

    _queueRedisplay() {
        if (this._redisplayId || this._destroyed)
            return;
        this._redisplayId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
            this._redisplayId = 0;
            if (this._dragging)
                this._redisplayPending = true;
            else
                this._redisplay();
            return GLib.SOURCE_REMOVE;
        });
    }

    _redisplay() {
        if (this._destroyed)
            return;
        const s = this.settings;
        const favorites = this._favorites.getFavorites();
        const favIds = new Set(favorites.map(a => a.get_id()));

        let extras = [];
        if (s.get_boolean('show-running')) {
            const running = this._appSystem.get_running().filter(a => !favIds.has(a.get_id()));
            const byId = new Map(running.map(a => [a.get_id(), a]));
            // Keep the order apps appeared in, so icons don't jump around on focus.
            this._runningOrder = this._runningOrder.filter(id => byId.has(id));
            for (const id of byId.keys()) {
                if (!this._runningOrder.includes(id))
                    this._runningOrder.push(id);
            }
            extras = this._runningOrder.map(id => byId.get(id));
        }

        const wanted = [];
        const g = this._g;
        const showApps = s.get_boolean('show-apps-button');
        const inRow = showApps && !g.loose;
        const atStart = g.appsPos === 'start' || g.appsPos === 'start-edge';
        // Out of the row (pinned to an edge) or gone: take it out of the box
        // before the reconcile below would destroy it.
        if (this._showApps && this._showApps.get_parent() === this._box && !inRow)
            this._box.remove_child(this._showApps);
        if (this._showApps && this._showApps.get_parent() === this._panel && !(showApps && g.loose))
            this._panel.remove_child(this._showApps);
        if (inRow && atStart)
            wanted.push(this._getShowApps());
        for (const app of favorites)
            wanted.push(this._getItem(app));
        if (extras.length > 0) {
            if (favorites.length > 0)
                wanted.push(this._getSeparator());
            for (const app of extras)
                wanted.push(this._getItem(app));
        }
        if (inRow && !atStart)
            wanted.push(this._getShowApps());
        if (showApps && g.loose) {
            const button = this._getShowApps();
            if (button.get_parent() !== this._panel)
                this._panel.add_child(button);
            this._panel.setLoose(button, g.loose);
        } else {
            this._panel.setLoose(null, null);
            if (!showApps && this._showApps && !this._showApps.get_parent())
                this._showApps.destroy();
        }

        const keep = new Set(wanted);
        for (const child of this._box.get_children()) {
            if (keep.has(child))
                continue;
            if (child === this._separator)
                this._separator = null;
            if (child === this._placeholder)
                this._placeholder = null;
            if (child.app)
                this._items.delete(child.app.get_id());
            child.destroy();
        }
        wanted.forEach((actor, i) => {
            if (actor.get_parent() !== this._box) {
                this._box.insert_child_at_index(actor, i);
                if (this._built) {
                    actor.opacity = 0;
                    actor.ease({opacity: 255, duration: this.ms(200), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
                }
            } else {
                this._box.set_child_at_index(actor, i);
            }
        });
        this._built = true;
        this._finishDrop();
        this._applyZoom();
        this._syncFocus();
        this._updateRestRect();
    }

    _getItem(app) {
        const id = app.get_id();
        let item = this._items.get(id);
        if (!item) {
            item = new AppItem(this, app);
            this._items.set(id, item);
            item.connect('destroy', () => {
                if (this._items.get(id) === item)
                    this._items.delete(id);
            });
        }
        return item;
    }

    _getShowApps() {
        if (!this._showApps) {
            const button = new ShowAppsItem(this);
            button.connect('destroy', () => {
                if (this._showApps === button)
                    this._showApps = null;
            });
            // Pinned to an edge it is outside the row's zoom, so it grows on
            // its own hover.
            button.connect('notify::hover', () => {
                if (button.get_parent() === this._panel)
                    this._zoomLoose(button, button.hover);
            });
            button.sync();
            this._showApps = button;
        }
        return this._showApps;
    }

    _getSeparator() {
        if (!this._separator) {
            const sep = new Separator(this._g);
            sep.connect('destroy', () => {
                if (this._separator === sep)
                    this._separator = null;
            });
            this._separator = sep;
        }
        return this._separator;
    }

    _onSettingChanged(key) {
        if (LIVE_KEYS.has(key)) {
            if (key === 'show-labels')
                this._hideLabel();
            if (key === 'magnify-active')
                this._syncRestZoom();
            if (key === 'number-hints')
                this._syncHintWatch();
            return;
        }
        if (key === 'visibility') {
            this._syncVisibilityMode();
            return;
        }
        if (key === 'show-badges') {
            this._items.forEach(item => item.updateBadge());
            return;
        }
        if (key === 'hide-overview-dash')
            return;
        if (key === 'blur') {
            this._setupBackground();
            this._updateStyle();
            return;
        }
        if (STYLE_KEYS.has(key)) {
            this._accent = parseColor(this.settings.get_string('accent-color'));
            this._updateStyle();
            return;
        }
        this._queueRebuild();
    }

    _queueRebuild() {
        if (this._rebuildId || this._destroyed)
            return;
        this._rebuildId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
            this._rebuildId = 0;
            this._rebuild();
            return GLib.SOURCE_REMOVE;
        });
    }

    // ---------------------------------------------------------------- geometry

    _relayout() {
        const g = this._g;
        const mon = Main.layoutManager.primaryMonitor;
        if (!mon)
            return;
        this._monitor = mon;
        const cross = g.margin + g.panelCross + g.headroom + SHADOW_ROOM * g.sf;
        const panel = this._panel;
        this._strip.setPanel(panel, g);
        panel.setBox(this._box, g);

        if (!g.vertical) {
            this._strip.set_position(mon.x, mon.y + mon.height - cross);
            this._strip.set_size(mon.width, cross);
        } else {
            // Leave the top bar alone.
            const panelBox = Main.layoutManager.panelBox;
            const top = panelBox.visible && panelBox.y <= mon.y ? panelBox.height : 0;
            const x = g.position === 'left' ? mon.x : mon.x + mon.width - cross;
            this._strip.set_position(x, mon.y + top);
            this._strip.set_size(cross, mon.height - top);
        }
        panel.translation_x = panel.translation_y = 0;
        this._shown = true;
        this._updateRestRect();
        this._updateStrut();
        this._syncBlurOffset();
    }

    // The dock's footprint at rest, in stage coordinates. Used for hiding
    // and for the reveal zone; magnification never changes it.
    _updateRestRect() {
        const g = this._g;
        const mon = this._monitor;
        if (!g || !mon)
            return;
        const children = this._box.get_children().filter(c => c.visible);
        let length = children.reduce((sum, c) => sum + (c.restMain ?? 0), 0);
        length += Math.max(0, children.length - 1) * g.spacing + 2 * g.padding;
        this._restLength = length;

        const sx = this._strip.x, sy = this._strip.y;
        const [sw, sh] = [this._strip.width, this._strip.height];
        // Along the dock axis: where the panel and the first icon sit at rest.
        const lineStart = g.vertical ? sy : sx;
        const lineLen = g.vertical ? sh : sw;
        const panelStart = lineStart + (g.full ? 0 : alignedStart(lineLen, length, g.align, g.margin));
        const panelLen = g.full ? lineLen : length;
        const rowStart = g.full ? lineStart + rowOffset(lineLen, length, g) : panelStart;
        this._restOrigin = rowStart + g.padding;

        let rect;
        if (!g.vertical) {
            rect = {x: panelStart, y: sy + sh - g.margin - g.panelCross, w: panelLen, h: g.panelCross};
        } else {
            const x = g.position === 'left' ? sx + g.margin : sx + sw - g.margin - g.panelCross;
            rect = {x, y: panelStart, w: g.panelCross, h: panelLen};
        }
        this._restRect = rect;
        this._updateHotzone();
        this._queueOverlapCheck();
    }

    _updateStrut() {
        const g = this._g;
        const mon = this._monitor;
        if (!this._strut || !mon)
            return;
        const depth = g.panelCross + (g.margin > 0 ? 2 * g.margin : 0);
        if (!g.vertical) {
            this._strut.set_position(mon.x, mon.y + mon.height - depth);
            this._strut.set_size(mon.width, depth);
        } else {
            const x = g.position === 'left' ? mon.x : mon.x + mon.width - depth;
            this._strut.set_position(x, mon.y);
            this._strut.set_size(depth, mon.height);
        }
    }

    _updateHotzone() {
        const g = this._g;
        const mon = this._monitor;
        const r = this._restRect;
        if (!this._hotzone || !mon || !r)
            return;
        const t = HOTZONE * g.sf;
        if (!g.vertical) {
            this._hotzone.set_position(r.x, mon.y + mon.height - t);
            this._hotzone.set_size(r.w, t);
        } else {
            const x = g.position === 'left' ? mon.x : mon.x + mon.width - t;
            this._hotzone.set_position(x, r.y);
            this._hotzone.set_size(t, r.h);
        }
    }

    // ---------------------------------------------------------------- look

    _cornerFlags() {
        // [top-left, top-right, bottom-right, bottom-left]
        const g = this._g;
        // A full-width dock is a plain bar: square at every corner.
        if (g.full)
            return [0, 0, 0, 0];
        if (g.margin > 0)
            return [1, 1, 1, 1];
        if (g.position === 'bottom')
            return [1, 1, 0, 0];
        if (g.position === 'left')
            return [0, 1, 1, 0];
        return [1, 0, 0, 1];
    }

    _updateStyle() {
        const s = this.settings;
        const g = this._g;
        const bg = parseColor(s.get_string('background-color'));
        const border = parseColor(s.get_string('border-color'));
        const bw = s.get_int('border-width');
        const r = Math.min(s.get_int('corner-radius'), Math.floor(g.panelCross / g.sf / 2));
        const radii = this._cornerFlags().map(f => `${f * r}px`).join(' ');

        let tint = `background-color: ${css(bg)}; border-radius: ${radii};`;
        if (bw > 0)
            tint += ` border: ${bw}px solid ${css(border)};`;
        this._tint.set_style(tint);
        this._shadow.set_style(s.get_boolean('shadow')
            ? `border-radius: ${radii}; box-shadow: 0 ${Math.round(g.iconSize / 12)}px ${Math.round(g.iconSize / 2.4)}px rgba(0,0,0,0.38);`
            : '');

        if (this._blurEffect) {
            this._blurEffect.radius = s.get_int('blur-radius') * g.sf;
            this._blurEffect.brightness = s.get_double('blur-brightness');
        }
        this._radiusPx = r * g.sf;
        this._syncBlurShape();

        this._label.set_style(`border-color: ${css(this._accent, 0.45)};`);
        for (const child of this._box.get_children())
            child.restyle?.();
    }

    // Blurred wallpaper under the dock. Real background blur can't be clipped
    // to rounded corners in GNOME 50, so the dock blurs its own copy of the
    // wallpaper (cached, costs nothing per frame) and masks it with a shader.
    _setupBackground() {
        this._destroyBackground();
        if (!this.settings.get_boolean('blur'))
            return;
        this._blurHolder = new BlurHolder({clip_to_allocation: true, x_expand: true, y_expand: true});
        this._blurOffset = new St.Widget();
        this._blurGroup = new St.Widget();
        this._blurOffset.add_child(this._blurGroup);
        this._blurHolder.add_child(this._blurOffset);
        this._panel.insert_child_above(this._blurHolder, this._shadow);

        this._bgManager = new Background.BackgroundManager({
            container: this._blurGroup,
            monitorIndex: Main.layoutManager.primaryIndex,
            controlPosition: false,
        });
        this._blurEffect = new Shell.BlurEffect({
            mode: Shell.BlurMode.ACTOR,
            radius: this.settings.get_int('blur-radius') * this._g.sf,
            brightness: this.settings.get_double('blur-brightness'),
        });
        this._blurGroup.add_effect(this._blurEffect);
        this._cornerEffect = new RoundedCornersEffect();
        this._blurHolder.add_effect(this._cornerEffect);
        this._blurHolder.connectObject('notify::allocation', () => {
            this._syncBlurShape();
            this._syncBlurOffset();
        }, this);
        this._syncBlurOffset();
    }

    _destroyBackground() {
        this._bgManager?.destroy();
        this._bgManager = null;
        this._blurHolder?.destroy();
        this._blurHolder = this._blurOffset = this._blurGroup = null;
        this._blurEffect = this._cornerEffect = null;
    }

    _syncBlurShape() {
        if (!this._cornerEffect || !this._blurHolder.has_allocation())
            return;
        const [w, h] = this._blurHolder.get_size();
        this._cornerEffect.setShape(w, h, this._radiusPx ?? 0, this._cornerFlags());
    }

    _syncBlurOffset() {
        if (!this._blurOffset || !this._monitor)
            return;
        const box = this._panel.get_allocation_box();
        const hold = this._blurHolder.get_allocation_box();
        const px = this._strip.x + box.x1 + hold.x1 + this._panel.translation_x;
        const py = this._strip.y + box.y1 + hold.y1 + this._panel.translation_y;
        this._blurOffset.translation_x = this._monitor.x - px;
        this._blurOffset.translation_y = this._monitor.y - py;
    }

    // ---------------------------------------------------------------- magnification

    _onMotion(event) {
        const [x, y] = event.get_coords();
        this._pointerStage = [x, y];
        this._pointer = (this._g.vertical ? y : x) - this._restOrigin;
        if (this._frozen || this._dragging)
            return Clutter.EVENT_PROPAGATE;
        this._pointerIn = true;
        // Single mode picks the zoom level itself (the active icon stays small).
        if (this.settings.get_string('magnify-style') === 'single')
            this._applyZoom();
        else if (this._zoomTarget !== 1)
            this._animateZoom(1);
        else if (!this._zoomTimeline)
            this._applyZoom();
        return Clutter.EVENT_PROPAGATE;
    }

    _animateZoom(target) {
        if (this._g.maxScale <= 1)
            target = 0;
        if (this._zoomTarget === target && (this._zoomTimeline || this._zoom === target))
            return;
        this._zoomTarget = target;
        this._zoomTimeline?.stop();
        const from = this._zoom;
        const tl = new Clutter.Timeline({
            actor: this._panel,
            duration: this.ms(target > from ? 280 : 360),
            progress_mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        tl.connect('new-frame', () => {
            this._zoom = from + (target - from) * tl.get_progress();
            this._applyZoom();
        });
        tl.connect('stopped', () => {
            if (this._zoomTimeline !== tl)
                return;
            this._zoomTimeline = null;
            this._zoom = target;
            this._applyZoom();
        });
        this._zoomTimeline = tl;
        tl.start();
    }

    _applyZoom() {
        const g = this._g;
        const children = this._box.get_children().filter(c => c.visible);
        if (this.settings.get_string('magnify-style') === 'single') {
            this._applySingleZoom(children);
            return;
        }
        const active = g.maxScale > 1 && this._zoom > 0 && this._pointer !== null;
        const scales = new Map();
        if (active) {
            const spread = this.settings.get_double('magnify-spread') * (g.cell + g.spacing);
            // Positions at rest, measured from the first icon, so the effect
            // doesn't feed back on itself as icons grow.
            let pos = 0;
            for (const c of children) {
                const center = pos + (c.restMain ?? 0) / 2;
                if (c.setScale) {
                    const d = Math.abs(this._pointer - center) / spread;
                    const f = d < 1 ? (Math.cos(Math.PI * d) + 1) / 2 : 0;
                    scales.set(c, 1 + (g.maxScale - 1) * f * this._zoom);
                }
                pos += (c.restMain ?? 0) + g.spacing;
            }
        }
        this._setScales(children, scales);
        this._placeLabel();
    }

    // Applies the zoom levels. Every icon keeps its resting slot, so the row
    // is never laid out again; when neighbours make room they are slid aside
    // with a translation, which (unlike a layout) is not rounded to whole
    // pixels and so moves smoothly instead of stepping.
    _setScales(children, scales) {
        const g = this._g;
        const push = this.settings.get_boolean('magnify-push');
        let extra = 0;
        const shifts = [];
        // Only push as far as needed: the picture may first grow into its own
        // margins (tile padding on both sides of the gap), and neighbours
        // move only by what doesn't fit there.
        const iconPx = g.iconSize * g.sf;
        const room = 2 * (g.cell - iconPx);
        for (const c of children) {
            const s = c.setScale ? scales.get(c) ?? 1 : 1;
            const grow = c.setScale ? Math.max(0, iconPx * (s - 1) - room) : 0;
            // An icon zooms about its own centre: it moves by everything that
            // grew before it plus half of its own growth.
            shifts.push(extra + grow / 2);
            extra += grow;
            c.setScale?.(s, g.cell);
        }
        // The row grows around its anchor: from the start, the centre or the end.
        const anchor = extra * g.align;
        children.forEach((c, i) => {
            const t = push ? shifts[i] - anchor : 0;
            if (g.vertical)
                c.translation_y = t;
            else
                c.translation_x = t;
        });
        this._panel.setExtra(push && !g.full ? extra : 0, g.align);
    }

    // Only the icon under the pointer grows. A single focus point (in icon
    // indices) glides toward the hovered icon, and the zoom is shared between
    // the two icons either side of it, adding up to one full zoom. So while
    // the focus travels, one icon shrinks exactly as much as the next grows:
    // the row keeps its length and its neighbours don't sway back and forth.
    // Which icon is hovered comes from the resting layout, so the growth
    // can't move the pointer onto a neighbour.
    _applySingleZoom(children) {
        const g = this._g;
        const sticky = this._onFocusedTile(children);
        // Neighbours lie on top of the magnified icon where it overhangs
        // their places; while the pointer is on it they must not take the click.
        const focused = sticky ? children.filter(c => c.setScale)[this._focusTarget] : null;
        for (const c of children)
            c.setClickable?.(!focused || c === focused);
        // Over the dock but not over an icon of the row (an edge-pinned Show
        // Apps button, or the empty part of a full-width dock): nothing is
        // hovered, so the hover zoom fades out where it was.
        let overIcon = sticky;
        if (this._pointerIn && this._pointer !== null && !sticky) {
            let pos = 0, index = 0;
            for (const c of children) {
                const len = c.restMain ?? 0;
                if (c.setScale) {
                    if (this._pointer >= pos - g.spacing / 2 && this._pointer < pos + len + g.spacing / 2) {
                        this._focusTarget = index;
                        overIcon = true;
                    }
                    index++;
                }
                pos += len + g.spacing;
            }
        }
        this._focusTarget ??= 0;
        if (this._pointerIn) {
            const level = overIcon ? 1 : 0;
            if (this._zoomTarget !== level)
                this._animateZoom(level);
        }
        // Coming in from outside: start right at the hovered icon.
        if (this._focus === undefined || this._zoom < 0.001)
            this._focus = this._focusTarget;
        this._renderSingle(children);
        this._settleSingle();
    }

    // True while the pointer is over the magnified icon as drawn. Its edges
    // reach over the neighbours' resting places; without this, aiming at an
    // edge moved the focus away and the icon slid out from under the click.
    _onFocusedTile(children) {
        if (!this._pointerIn || this._focusTarget === undefined || !this._pointerStage || this._zoom < 0.5)
            return false;
        const focused = children.filter(c => c.setScale)[this._focusTarget];
        if (!focused)
            return false;
        const [x, y] = this._pointerStage;
        const [tx, ty] = focused.tile.get_transformed_position();
        const [tw, th] = focused.tile.get_transformed_size();
        return x >= tx && x < tx + tw && y >= ty && y < ty + th;
    }

    // The active app's icon has a size of its own, kept whatever the pointer
    // does: hover zoom never touches it, so moving onto it from a neighbour
    // only lets the neighbour shrink. `activeWeight` eases it in and out when
    // the active app changes.
    _renderSingle(children) {
        const g = this._g;
        const amount = g.maxScale > 1 ? g.maxScale - 1 : 0;
        const active = this._activeItem();
        // An icon that just became active (clicked while magnified) lets its
        // hover zoom run down smoothly instead of dropping it at once.
        if (active !== this._lastActive) {
            if (this._lastActive)
                this._lastActive.post = null;
            if (active) {
                const was = active.lastHover ?? 0;
                // Already at least at its post size: take the post at once,
                // then glide down onto it (ease in and out) — no dip below.
                active.activeWeight = Math.max(active.activeWeight ?? 0, Math.min(1, was / ACTIVE_ZOOM));
                active.fadeHover = was;
                active.post = was > ACTIVE_ZOOM
                    ? {from: was, start: GLib.get_monotonic_time(), length: this.ms(420) * 1000} : null;
            }
            this._lastActive = active;
        }
        const scales = new Map();
        let index = 0;
        for (const c of children) {
            if (!c.setScale)
                continue;
            let hover;
            if (c === active) {
                hover = c.fadeHover ?? 0;
            } else {
                hover = this._zoom * Math.max(0, 1 - Math.abs(index - this._focus));
                c.lastHover = hover;
            }
            const rest = ACTIVE_ZOOM * (c.activeWeight ?? 0);
            scales.set(c, 1 + amount * Math.max(hover, rest));
            index++;
        }
        this._setScales(children, scales);
        this._placeLabel();
    }

    _activeItem() {
        const focus = this._tracker.focus_app;
        if (!focus || !this.settings.get_boolean('magnify-active'))
            return null;
        return this._items.get(focus.get_id()) ?? null;
    }

    _singleSettled() {
        if (this._focus !== this._focusTarget)
            return false;
        const active = this._activeItem();
        if (active?.post)
            return false;
        return [...this._items.values()].every(c => (c.activeWeight ?? 0) === (c === active ? 1 : 0));
    }

    // Moves the focus toward the hovered icon and the active size to the
    // active app, easing out; stops once both have arrived.
    _settleSingle() {
        if (this._settleTimeline || this._singleSettled())
            return;
        const tl = new Clutter.Timeline({actor: this._panel, duration: 1000, repeat_count: -1});
        let last = GLib.get_monotonic_time();
        tl.connect('new-frame', () => {
            const now = GLib.get_monotonic_time();
            const k = 1 - Math.exp(-(now - last) / 1e3 / this.ms(SETTLE_TIME * 1000));
            last = now;
            this._focus += (this._focusTarget - this._focus) * k;
            if (Math.abs(this._focusTarget - this._focus) < 0.003)
                this._focus = this._focusTarget;
            const active = this._activeItem();
            for (const c of this._items.values()) {
                const target = c === active ? 1 : 0;
                const w = c.activeWeight ?? 0;
                c.activeWeight = Math.abs(target - w) < 0.01 ? target : w + (target - w) * k;
            }
            if (active?.post) {
                const {from, start, length} = active.post;
                const p = Math.min(1, (now - start) / length);
                const eased = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
                active.fadeHover = from + (ACTIVE_ZOOM - from) * eased;
                if (p >= 1) {
                    active.post = null;
                    active.fadeHover = 0;
                }
            } else if (active) {
                active.fadeHover = 0;
            }
            this._renderSingle(this._box.get_children().filter(c => c.visible));
            if (this._singleSettled())
                tl.stop();
        });
        tl.connect('stopped', () => {
            if (this._settleTimeline === tl)
                this._settleTimeline = null;
        });
        this._settleTimeline = tl;
        tl.start();
    }

    // Zoom for the edge-pinned Show Apps button, which sits outside the row.
    _zoomLoose(button, on) {
        const g = this._g;
        if (g.maxScale <= 1 || button.destroyed)
            return;
        button.looseTimeline?.stop();
        const from = button.currentScale, to = on ? g.maxScale : 1;
        const tl = new Clutter.Timeline({
            actor: button,
            duration: this.ms(on ? 280 : 360),
            progress_mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        tl.connect('new-frame', () => button.setScale(from + (to - from) * tl.get_progress(), g.cell));
        tl.connect('completed', () => button.setScale(to, g.cell));
        button.looseTimeline = tl;
        tl.start();
    }

    _onPanelHover() {
        if (this._panel.hover) {
            if (this._hideId) {
                GLib.source_remove(this._hideId);
                this._hideId = 0;
            }
        } else {
            this._pointerIn = false;
            if (!this._frozen)
                this._syncRestZoom();
            this._scheduleHide();
        }
        this._updateVisibility();
    }

    // ---------------------------------------------------------------- labels

    _scheduleLabel(item) {
        if (!this.settings.get_boolean('show-labels') || !item.labelText || this._frozen || this._dragging)
            return;
        this._labelItem = item;
        if (this._labelId)
            GLib.source_remove(this._labelId);
        const delay = this._label.visible ? 0 : LABEL_DELAY;
        this._labelId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._labelId = 0;
            if (this._labelItem !== item || !item.hover)
                return GLib.SOURCE_REMOVE;
            this._label.text = item.labelText;
            if (!this._label.visible) {
                this._label.opacity = 0;
                this._label.show();
                this._label.ease({opacity: 255, duration: this.ms(120), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            }
            this._placeLabel();
            return GLib.SOURCE_REMOVE;
        });
    }

    _hideLabel() {
        if (this._labelId) {
            GLib.source_remove(this._labelId);
            this._labelId = 0;
        }
        this._labelItem = null;
        this._label?.hide();
    }

    _placeLabel() {
        const item = this._labelItem;
        if (!item || !this._label.visible)
            return;
        const g = this._g;
        const [x, y] = item.tile.get_transformed_position();
        const [w, h] = item.tile.get_transformed_size();
        const [lw, lh] = this._label.get_size();
        const gap = 10 * g.sf;
        const mon = this._monitor;
        let lx, ly;
        if (!g.vertical) {
            lx = x + w / 2 - lw / 2;
            ly = y - lh - gap;
        } else {
            ly = y + h / 2 - lh / 2;
            lx = g.position === 'left' ? x + w + gap : x - lw - gap;
        }
        lx = Math.clamp(lx, mon.x, mon.x + mon.width - lw);
        ly = Math.clamp(ly, mon.y, mon.y + mon.height - lh);
        this._label.set_position(Math.round(lx), Math.round(ly));
    }

    // ---------------------------------------------------------------- visibility

    _syncVisibilityMode() {
        const mode = this.settings.get_string('visibility');
        if (mode === 'fixed' && !this._strut) {
            this._strut = new St.Widget({name: 'ricingdock-strut'});
            Main.layoutManager.addChrome(this._strut, {affectsStruts: true});
            // Below the dock: drag and drop picks non-reactive actors too, and
            // on top this empty strut would swallow drops meant for the dock.
            Main.layoutManager.uiGroup.set_child_below_sibling(this._strut, this._strip);
            this._updateStrut();
        } else if (mode !== 'fixed' && this._strut) {
            this._strut.destroy();
            this._strut = null;
        }
        if (mode !== 'fixed' && !this._hotzone) {
            this._hotzone = new St.Widget({name: 'ricingdock-hotzone', reactive: true, track_hover: true});
            this._hotzone.connectObject('notify::hover', () => this._onHotzone(), this);
            Main.layoutManager.addChrome(this._hotzone, {trackFullscreen: true});
            Main.layoutManager.uiGroup.set_child_below_sibling(this._hotzone, this._strip);
            this._updateHotzone();
        } else if (mode === 'fixed' && this._hotzone) {
            this._hotzone.destroy();
            this._hotzone = null;
        }
        this._revealed = false;
        this._checkOverlap();
        this._updateVisibility();
    }

    _onHotzone() {
        if (this._revealId) {
            GLib.source_remove(this._revealId);
            this._revealId = 0;
        }
        if (this._hotzone.hover && !this._shown) {
            // A short dwell, so a quick flick to the edge to reach a window's
            // bottom row doesn't pop the dock.
            this._revealId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REVEAL_DWELL, () => {
                this._revealId = 0;
                if (this._hotzone?.hover) {
                    this._revealed = true;
                    this._updateVisibility();
                }
                return GLib.SOURCE_REMOVE;
            });
        } else if (!this._hotzone.hover) {
            this._scheduleHide();
        }
    }

    _scheduleHide() {
        if (this._hideId)
            GLib.source_remove(this._hideId);
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY, () => {
            this._hideId = 0;
            if (!this._panel.hover && !this._hotzone?.hover) {
                this._revealed = false;
                this._updateVisibility();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _hold() {
        this._holds++;
        this._updateVisibility();
    }

    _release() {
        this._holds = Math.max(0, this._holds - 1);
        this._scheduleHide();
    }

    _onOverview() {
        this._showApps?.sync();
        this._updateVisibility();
    }

    _wantShown() {
        const mode = this.settings.get_string('visibility');
        if (mode === 'fixed' || Main.overview.visible || this._holds > 0)
            return true;
        if (this._panel.hover || this._revealed)
            return true;
        if (mode === 'autohide')
            return false;
        return !this._overlap;
    }

    _updateVisibility() {
        if (this._destroyed)
            return;
        const want = this._wantShown();
        if (want === this._shown)
            return;
        this._shown = want;
        const g = this._g;
        const away = g.margin + g.panelCross + SHADOW_ROOM * g.sf;
        let tx = 0, ty = 0;
        if (!want) {
            this._hideLabel();
            if (!g.vertical)
                ty = away;
            else
                tx = g.position === 'left' ? -away : away;
        }
        this._panel.ease({
            translation_x: tx,
            translation_y: ty,
            duration: this.ms(want ? 260 : 220),
            mode: want ? Clutter.AnimationMode.EASE_OUT_CUBIC : Clutter.AnimationMode.EASE_IN_QUAD,
        });
    }

    // ---------------------------------------------------------------- intellihide

    _trackWindow(w) {
        if (!w || this._windows.has(w))
            return;
        this._windows.add(w);
        w.connectObject(
            'position-changed', () => this._queueOverlapCheck(),
            'size-changed', () => this._queueOverlapCheck(),
            'notify::minimized', () => this._queueOverlapCheck(),
            'workspace-changed', () => this._queueOverlapCheck(),
            'unmanaged', () => {
                w.disconnectObject(this);
                this._windows.delete(w);
                this._queueOverlapCheck();
            },
            this);
        this._queueOverlapCheck();
    }

    _queueOverlapCheck() {
        if (this._overlapId || this._destroyed ||
            this.settings.get_string('visibility') !== 'intellihide')
            return;
        this._overlapId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            this._overlapId = 0;
            this._checkOverlap();
            this._updateVisibility();
            return GLib.SOURCE_REMOVE;
        });
    }

    _checkOverlap() {
        if (this._destroyed)
            return;
        const r = this._restRect;
        this._overlap = false;
        if (!r || this.settings.get_string('visibility') !== 'intellihide')
            return;
        const ws = global.workspace_manager.get_active_workspace();
        for (const actor of global.get_window_actors()) {
            const w = actor.meta_window;
            if (!w || w.minimized || !w.showing_on_its_workspace() || w.is_skip_taskbar())
                continue;
            if (!OVERLAP_TYPES.has(w.get_window_type()) || !w.located_on_workspace(ws))
                continue;
            const f = w.get_frame_rect();
            if (f.x < r.x + r.w && f.x + f.width > r.x && f.y < r.y + r.h && f.y + f.height > r.y) {
                this._overlap = true;
                return;
            }
        }
    }

    // ---------------------------------------------------------------- number hints

    // Super held for a moment shows the numbers. The keymap announces
    // modifier changes, so nothing runs until a modifier goes up or down,
    // and only "is Super down" is read, never which keys are typed.
    _syncHintWatch() {
        this._stopHintWatch();
        if (!this.settings.get_boolean('number-hints')) {
            this._showHints(false);
            return;
        }
        this._keymap = Clutter.get_default_backend().get_default_seat().get_keymap();
        this._keymap.connectObject('state-changed', () => this._checkSuper(), this);
    }

    _stopHintWatch() {
        this._keymap?.disconnectObject(this);
        this._keymap = null;
        if (this._hintDelayId)
            GLib.source_remove(this._hintDelayId);
        this._hintDelayId = 0;
    }

    _superDown() {
        const [, , mods] = global.get_pointer();
        return (mods & SUPER) !== 0;
    }

    // A short hold is needed before the numbers show, so quick Super+key
    // shortcuts don't make them flash.
    _checkSuper() {
        if (!this._superDown()) {
            if (this._hintDelayId) {
                GLib.source_remove(this._hintDelayId);
                this._hintDelayId = 0;
            }
            if (this._hintsShown)
                this._showHints(false);
            return;
        }
        if (this._hintsShown || this._hintDelayId)
            return;
        this._hintDelayId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HINT_DELAY_MS, () => {
            this._hintDelayId = 0;
            if (this._superDown())
                this._showHints(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    // Numbers follow GNOME's own Super+1…9: the pinned apps, in order.
    _showHints(on) {
        this._hintsShown = on;
        const favorites = this._favorites.getFavorites();
        for (const item of this._items.values()) {
            const n = favorites.indexOf(item.app) + 1;
            // A small wave from the first number to the last.
            item.setHint(on && n >= 1 && n <= 9 ? n : null, (n - 1) * 25);
        }
    }

    // ---------------------------------------------------------------- state

    _syncFocus() {
        const focus = this._tracker.focus_app;
        for (const item of this._items.values())
            item.setFocused(item.app === focus);
        // Clicked an icon under the pointer: it is now the active one and
        // settles to the active size right there.
        if (this._pointerIn && !this._frozen && !this._dragging)
            this._applyZoom();
        this._syncRestZoom();
    }

    // Index (among icons) of the app in focus, if its icon is kept magnified.
    _activeIndex(children) {
        const focus = this._tracker.focus_app;
        if (!focus || !this.settings.get_boolean('magnify-active'))
            return -1;
        return children.filter(c => c.setScale).findIndex(c => c.app === focus);
    }

    // With the pointer away, the app in focus keeps its icon magnified (if
    // enabled and it is in the dock); otherwise the row settles back to rest.
    _syncRestZoom() {
        const g = this._g;
        if (!g || this._pointerIn || this._frozen || this._dragging || this._destroyed)
            return;
        const children = this._box.get_children().filter(c => c.visible);
        const icons = children.filter(c => c.setScale);
        const index = this._activeIndex(children);
        if (this.settings.get_string('magnify-style') === 'single') {
            this._animateZoom(0);
            this._settleSingle();
            return;
        }
        if (index < 0 || g.maxScale <= 1) {
            this._animateZoom(0);
            return;
        }
        // Wave: park the virtual pointer on that icon's resting centre.
        let pos = 0;
        for (const c of children) {
            if (c === icons[index]) {
                this._pointer = pos + (c.restMain ?? 0) / 2;
                break;
            }
            pos += (c.restMain ?? 0) + g.spacing;
        }
        this._animateZoom(ACTIVE_ZOOM);
        if (!this._zoomTimeline)
            this._applyZoom();
    }

    _onAttention(window) {
        const app = this._tracker.get_window_app(window);
        if (!app || app === this._tracker.focus_app)
            return;
        this._items.get(app.get_id())?.setUrgent(true);
    }

    _onBadge(key) {
        for (const [id, item] of this._items) {
            if (LauncherEntries.keyFor(id) === key)
                item.updateBadge();
        }
    }

    // ---------------------------------------------------------------- drag and drop

    _onDragStart() {
        this._dragging = true;
        this._hideLabel();
        this._animateZoom(0);
        this._hold();
        this._dragMonitor = {
            dragMotion: e => {
                if (!this._panel.contains(e.targetActor))
                    this._clearPlaceholder();
                return DND.DragMotionResult.CONTINUE;
            },
        };
        DND.addDragMonitor(this._dragMonitor);
    }

    _onDragStop() {
        this._dragging = false;
        if (this._dragMonitor)
            DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = null;
        if (this._dropAccepted) {
            // Keep the gap until the favorites change reorders the row.
            this._dropAccepted = false;
            this._afterDrop = {item: null};
            this._afterDropId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                this._afterDropId = 0;
                this._finishDrop();
                return GLib.SOURCE_REMOVE;
            });
        } else {
            this._clearPlaceholder();
        }
        this._showApps?.setForcedHover(false);
        this._release();
        this._syncRestZoom();
        if (this._redisplayPending) {
            this._redisplayPending = false;
            this._redisplay();
        } else {
            this._updateRestRect();
        }
    }

    _visibleFavorites() {
        const favIds = new Set(this._favorites.getFavorites().map(a => a.get_id()));
        return this._box.get_children().filter(c => c.visible && c.app && favIds.has(c.app.get_id()));
    }

    handleDragOver(source, actor, x, y) {
        const app = source?.app;
        if (!app || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;
        const [stageX, stageY] = global.get_pointer();
        const [ok, bx, by] = this._box.transform_stage_point(stageX, stageY);
        const pos = ok ? (this._g.vertical ? by : bx) : 0;
        const favs = this._visibleFavorites();
        let index = 0;
        for (const f of favs) {
            const box = f.get_allocation_box();
            const center = this._g.vertical ? (box.y1 + box.y2) / 2 : (box.x1 + box.x2) / 2;
            if (pos > center)
                index++;
        }
        this._showPlaceholder(index, favs);
        return this._favorites.isFavorite(app.get_id())
            ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.COPY_DROP;
    }

    acceptDrop(source) {
        const app = source?.app;
        if (!app || app.is_window_backed() || this._dropPos === undefined)
            return false;
        const id = app.get_id();
        const pos = this._dropPos;
        const isFavorite = this._favorites.isFavorite(id);
        this._dropAccepted = true;
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (isFavorite)
                this._favorites.moveFavoriteToPos(id, pos);
            else
                this._favorites.addFavoriteAtPos(id, pos);
            return GLib.SOURCE_REMOVE;
        });
        return true;
    }

    _finishDrop() {
        if (!this._afterDrop)
            return;
        if (this._afterDropId) {
            GLib.source_remove(this._afterDropId);
            this._afterDropId = 0;
        }
        const {item} = this._afterDrop;
        this._afterDrop = null;
        this._placeholder?.destroy();
        this._placeholder = null;
        this._dropPos = undefined;
        if (item && !item.destroyed)
            item.visible = true;
        this._updateRestRect();
    }

    _showPlaceholder(index, favs, animate = true) {
        if (this._dropPos === index && this._placeholder)
            return;
        this._dropPos = index;
        // The old gap closes while the new one opens.
        const old = this._placeholder;
        this._placeholder = new Placeholder(this._g, this);
        const children = this._box.get_children();
        let at;
        if (index < favs.length)
            at = children.indexOf(favs[index]);
        else if (favs.length > 0)
            at = children.indexOf(favs[favs.length - 1]) + 1;
        else
            at = this._showApps && this._box.get_first_child() === this._showApps ? 1 : 0;
        this._box.insert_child_at_index(this._placeholder, at);
        if (animate) {
            this._placeholder.animateIn();
            old?.animateOut();
        } else {
            old?.destroy();
        }
    }

    _clearPlaceholder() {
        this._placeholder?.animateOut();
        this._placeholder = null;
        this._dropPos = undefined;
    }
}

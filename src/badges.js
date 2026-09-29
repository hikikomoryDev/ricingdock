// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 hikikomoriDev

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

// Apps report unread counters and progress over the Unity LauncherEntry
// D-Bus API (Telegram, Thunderbird, Chromium downloads, ...). Owning
// com.canonical.Unity tells them a launcher is listening.
export class LauncherEntries extends Signals.EventEmitter {
    constructor() {
        super();
        this._entries = new Map();
        const bus = Gio.DBus.session;
        this._updateId = bus.signal_subscribe(null,
            'com.canonical.Unity.LauncherEntry', 'Update', null, null,
            Gio.DBusSignalFlags.NONE,
            (conn, sender, path, iface, signal, params) => {
                // Any process of this user can emit this; take only the
                // documented shape.
                if (params.get_type_string() !== '(sa{sv})')
                    return;
                const [uri, props] = params.deep_unpack();
                this._onUpdate(sender, uri, props);
            });
        this._ownerId = bus.signal_subscribe('org.freedesktop.DBus',
            'org.freedesktop.DBus', 'NameOwnerChanged', '/org/freedesktop/DBus', null,
            Gio.DBusSignalFlags.NONE,
            (conn, sender, path, iface, signal, params) => {
                const [name, , after] = params.deep_unpack();
                if (!after)
                    this._dropSender(name);
            });
        this._nameId = Gio.bus_own_name_on_connection(bus, 'com.canonical.Unity',
            Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT | Gio.BusNameOwnerFlags.REPLACE,
            null, null);
    }

    destroy() {
        const bus = Gio.DBus.session;
        bus.signal_unsubscribe(this._updateId);
        bus.signal_unsubscribe(this._ownerId);
        Gio.bus_unown_name(this._nameId);
        this._entries.clear();
    }

    static keyFor(appId) {
        return appId.replace(/\.desktop$/, '');
    }

    get(appId) {
        return this._entries.get(LauncherEntries.keyFor(appId)) ?? null;
    }

    _onUpdate(sender, uri, props) {
        const key = LauncherEntries.keyFor(uri.replace(/^application:\/\//, ''));
        // Only installed apps: junk ids would otherwise pile up in memory.
        if (!this._entries.has(key) && !Shell.AppSystem.get_default().lookup_app(`${key}.desktop`))
            return;
        const entry = this._entries.get(key) ?? {
            sender, count: 0, countVisible: false, progress: 0, progressVisible: false, urgent: false,
        };
        entry.sender = sender;
        const value = name => props[name]?.deep_unpack?.() ?? props[name];
        if ('count' in props)
            entry.count = Math.max(0, Math.min(Number(value('count')) || 0, 1e6));
        if ('count-visible' in props)
            entry.countVisible = Boolean(value('count-visible'));
        if ('progress' in props)
            entry.progress = Number(value('progress')) || 0;
        if ('progress-visible' in props)
            entry.progressVisible = Boolean(value('progress-visible'));
        if ('urgent' in props)
            entry.urgent = Boolean(value('urgent'));
        this._entries.set(key, entry);
        this.emit('changed', key);
    }

    _dropSender(name) {
        for (const [key, entry] of this._entries) {
            if (entry.sender === name) {
                this._entries.delete(key);
                this.emit('changed', key);
            }
        }
    }
}

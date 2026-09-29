# GNOME Shell 49 (Fedora 43) for the headless test bench.
FROM registry.fedoraproject.org/fedora:43
RUN dnf -y install --setopt=install_weak_deps=False \
        gnome-shell gnome-extensions-app dbus-daemon dbus-tools glib2 \
        mesa-dri-drivers mesa-libEGL python3 abattis-cantarell-vf-fonts adwaita-icon-theme \
        gnome-text-editor gnome-calculator nautilus gnome-clocks gnome-characters \
        gnome-font-viewer baobab gnome-logs gnome-system-monitor yelp \
    && dnf clean all
# No logind in a container: without this the shell tries to reach it and aborts.
RUN rm -rf /run/systemd/seats

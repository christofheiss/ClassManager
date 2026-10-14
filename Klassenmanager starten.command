#!/usr/bin/env bash
# Startet den Klassenmanager auf dem Mac und öffnet ihn im Browser.
# Einfach im Finder doppelklicken. Beim allerersten Mal: Rechtsklick > Öffnen > Öffnen.
#
# Wichtig: Immer derselbe Port (8000). Der Browser speichert die Daten pro Adresse;
# mit einem anderen Port wären die bisherigen Klassen scheinbar "weg".

PORT=8000
URL="http://localhost:$PORT/"
cd "$(dirname "$0")" || exit 1
printf '\033]0;Klassenmanager\007'   # Fenstertitel

server_running() {
    curl -s -o /dev/null --noproxy "*" --max-time 2 "$URL"
}

pause_and_exit() {
    echo ""
    read -r -p "  Enter drücken zum Schliessen." _
    exit 1
}

echo ""
echo "  Klassenmanager"
echo "  =============="

# Läuft schon (z.B. zweiter Doppelklick)? Dann nur den Browser öffnen.
if server_running; then
    echo "  Läuft bereits. Öffne $URL"
    open "$URL"
    sleep 1
    exit 0
fi

# Server starten: zuerst Python 3, sonst das vorinstallierte Ruby. /usr/bin/python3 ist auf dem
# Mac nur ein Platzhalter, der ohne die "Command Line Tools" ein Installationsfenster öffnet.
start_server() {
    "$@" >/dev/null 2>&1 &
    SERVER_PID=$!
    for _ in $(seq 1 30); do
        server_running && return 0
        kill -0 $SERVER_PID 2>/dev/null || return 1   # Server ist sofort abgestürzt
        sleep 0.2
    done
    kill $SERVER_PID 2>/dev/null
    return 1
}

SERVER_PID=""
trap '[ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null; echo ""; echo "  Klassenmanager beendet."' EXIT
trap 'exit 0' INT TERM HUP

STARTED=""
if command -v python3 >/dev/null 2>&1 &&
   { [ "$(command -v python3)" != "/usr/bin/python3" ] || xcode-select -p >/dev/null 2>&1; }; then
    start_server python3 -m http.server "$PORT" --bind 127.0.0.1 && STARTED=1
fi
if [ -z "$STARTED" ] && command -v ruby >/dev/null 2>&1; then
    start_server ruby -run -e httpd . -p "$PORT" -b 127.0.0.1 && STARTED=1
fi
if [ -z "$STARTED" ]; then
    SERVER_PID=""
    echo ""
    echo "  Der Klassenmanager konnte nicht gestartet werden."
    echo "  1. Ist Port $PORT schon von einem anderen Programm belegt? Dieses schliessen."
    echo "  2. Sonst einmalig im Terminal ausführen:  xcode-select --install"
    echo "     (installiert Python 3), danach diese Datei erneut doppelklicken."
    pause_and_exit
fi

open "$URL"
echo ""
echo "  Läuft unter $URL"
echo "  Dieses Fenster offen lassen, solange du die App nutzt."
echo "  Beenden: Fenster schliessen oder Ctrl+C."
echo ""
wait $SERVER_PID

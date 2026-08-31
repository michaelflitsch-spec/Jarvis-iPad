"""Anwendungen starten und auf dem Bildschirm anordnen.

macOS wird per AppleScript exakt positioniert. Windows ueber die Win32-API
(pywin32, optional). Unter Linux via wmctrl, falls installiert.
Ohne diese Helfer werden die Apps trotzdem gestartet - nur nicht angeordnet.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import time
import webbrowser
from dataclasses import dataclass

SYSTEM = platform.system()

# Anteile des Bildschirms: (x, y, breite, hoehe) jeweils 0..1
LAYOUTS = {
    "left":         (0.00, 0.00, 0.50, 1.00),
    "right":        (0.50, 0.00, 0.50, 1.00),
    "top-left":     (0.00, 0.00, 0.50, 0.50),
    "top-right":    (0.50, 0.00, 0.50, 0.50),
    "bottom-left":  (0.00, 0.50, 0.50, 0.50),
    "bottom-right": (0.50, 0.50, 0.50, 0.50),
    "fullscreen":   (0.00, 0.00, 1.00, 1.00),
    "center":       (0.15, 0.10, 0.70, 0.80),
}


@dataclass
class LaunchResult:
    name: str
    launched: bool
    positioned: bool
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "launched": self.launched,
            "positioned": self.positioned,
            "message": self.message,
        }


def screen_size() -> tuple[int, int]:
    try:
        if SYSTEM == "Darwin":
            out = subprocess.run(
                ["osascript", "-e", 'tell application "Finder" to get bounds of window of desktop'],
                capture_output=True, text=True, timeout=6,
            ).stdout.strip()
            parts = [int(p.strip()) for p in out.split(",")]
            if len(parts) == 4:
                return parts[2], parts[3]
        elif SYSTEM == "Windows":
            import ctypes
            user32 = ctypes.windll.user32
            user32.SetProcessDPIAware()
            return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
        elif shutil.which("xrandr"):
            out = subprocess.run(["xrandr"], capture_output=True, text=True, timeout=6).stdout
            for line in out.splitlines():
                if " connected" in line and "x" in line:
                    for token in line.split():
                        if "x" in token and "+" in token:
                            width, rest = token.split("x", 1)
                            height = rest.split("+", 1)[0]
                            return int(width), int(height)
    except Exception:
        pass
    return 1920, 1080


def _rect(position: str) -> tuple[int, int, int, int]:
    fx, fy, fw, fh = LAYOUTS.get(position, LAYOUTS["center"])
    width, height = screen_size()
    return int(fx * width), int(fy * height), int(fw * width), int(fh * height)


# ----------------------------- Starten -----------------------------

def launch(app: dict, project_dir: str = "") -> LaunchResult:
    name = app.get("name", "App")
    if not app.get("enabled", True):
        return LaunchResult(name, False, False, "in config.json deaktiviert")

    url = app.get("open_url")
    if url and name.lower() in {"jarvis", "chrome", "browser"}:
        return _launch_browser(app, url)

    binary = app.get({"Darwin": "macos", "Windows": "windows"}.get(SYSTEM, "linux"))
    if not binary:
        return LaunchResult(name, False, False, f"kein Eintrag fuer {SYSTEM} in config.json")

    args: list[str] = []
    if app.get("open_project") and project_dir:
        args.append(project_dir)

    try:
        if SYSTEM == "Darwin":
            command = ["open", "-a", binary]
            if args:
                command += args
            subprocess.run(command, check=True, capture_output=True, timeout=25)
        elif SYSTEM == "Windows":
            subprocess.Popen(["cmd", "/c", "start", "", binary, *args], shell=False)
        else:
            if not shutil.which(binary):
                return LaunchResult(name, False, False, f"'{binary}' nicht im PATH")
            subprocess.Popen([binary, *args],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or b"").decode("utf-8", "replace").strip()[:160]
        return LaunchResult(name, False, False, detail or "Start fehlgeschlagen")
    except (OSError, subprocess.SubprocessError) as exc:
        return LaunchResult(name, False, False, str(exc)[:160])

    return LaunchResult(name, True, False)


def _launch_browser(app: dict, url: str) -> LaunchResult:
    name = app.get("name", "Browser")
    binary = app.get({"Darwin": "macos", "Windows": "windows"}.get(SYSTEM, "linux"))
    try:
        if SYSTEM == "Darwin":
            subprocess.run(["open", "-a", binary, url], check=True, capture_output=True, timeout=25)
        elif SYSTEM == "Windows":
            subprocess.Popen(["cmd", "/c", "start", "", binary, url], shell=False)
        elif shutil.which(binary):
            subprocess.Popen([binary, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            webbrowser.open(url)
        return LaunchResult(name, True, False)
    except Exception:
        try:
            webbrowser.open(url)
            return LaunchResult(name, True, False, "ueber Standardbrowser geoeffnet")
        except Exception as exc:
            return LaunchResult(name, False, False, str(exc)[:160])


# --------------------------- Anordnen ---------------------------

def arrange(app: dict) -> bool:
    position = app.get("position")
    if not position or position not in LAYOUTS:
        return False
    binary = app.get({"Darwin": "macos", "Windows": "windows"}.get(SYSTEM, "linux"))
    if not binary:
        return False
    x, y, width, height = _rect(position)

    if SYSTEM == "Darwin":
        return _arrange_macos(binary, x, y, width, height, position,
                              app.get("process_name", ""))
    if SYSTEM == "Windows":
        return _arrange_windows(binary, x, y, width, height)
    return _arrange_linux(binary, x, y, width, height)


def _arrange_macos(app_name: str, x: int, y: int, w: int, h: int,
                   position: str, process_name: str = "") -> bool:
    """Fenster einer App positionieren.

    Der Prozessname in System Events ist nicht der App-Name: "Visual Studio
    Code" laeuft als Prozess "Code". Statt das zu raten, aktivieren wir die App
    ueber ihren Namen (das versteht AppleScript zuverlaessig) und greifen dann
    auf den Prozess zu, der gerade im Vordergrund ist. `process_name` in der
    config.json ueberschreibt das, falls eine App aus der Reihe tanzt.
    """
    if position == "fullscreen":
        x, y = 0, 0

    # Korrekt geschachtelt: "tell A to tell B" waere eine Einzeiler-Form und
    # vertraegt sich nicht mit einem Block plus "end tell".
    target = (f'process "{process_name}"' if process_name
              else "(first application process whose frontmost is true)")

    script = f'''
    tell application "{app_name}" to activate
    delay 0.4
    try
      tell application "System Events"
        tell {target}
          set position of front window to {{{x}, {y}}}
          set size of front window to {{{w}, {h}}}
        end tell
      end tell
    on error errText number errNum
      return "FEHLER " & errNum & ": " & errText
    end try
    return "OK"'''
    try:
        result = subprocess.run(["osascript", "-e", script],
                                capture_output=True, text=True, timeout=15)
        return result.returncode == 0 and "OK" in (result.stdout or "")
    except (OSError, subprocess.SubprocessError):
        return False


def _arrange_windows(binary: str, x: int, y: int, w: int, h: int) -> bool:
    try:
        import win32con  # type: ignore
        import win32gui  # type: ignore
    except ImportError:
        return False

    needle = binary.lower().replace(".exe", "")
    matches: list[int] = []

    def callback(handle, _):
        if win32gui.IsWindowVisible(handle):
            title = (win32gui.GetWindowText(handle) or "").lower()
            if needle in title and title:
                matches.append(handle)
        return True

    try:
        win32gui.EnumWindows(callback, None)
        if not matches:
            return False
        handle = matches[0]
        win32gui.ShowWindow(handle, win32con.SW_RESTORE)
        win32gui.MoveWindow(handle, x, y, w, h, True)
        return True
    except Exception:
        return False


def _arrange_linux(binary: str, x: int, y: int, w: int, h: int) -> bool:
    if not shutil.which("wmctrl"):
        return False
    try:
        subprocess.run(
            ["wmctrl", "-x", "-r", binary, "-e", f"0,{x},{y},{w},{h}"],
            check=False, capture_output=True, timeout=8,
        )
        result = subprocess.run(
            ["wmctrl", "-r", binary, "-e", f"0,{x},{y},{w},{h}"],
            check=False, capture_output=True, timeout=8,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def launch_all(apps: list[dict], project_dir: str = "",
               settle_seconds: float = 3.0) -> list[dict]:
    """Alle Apps starten, kurz warten, dann anordnen."""
    results: list[LaunchResult] = [launch(app, project_dir) for app in apps]

    if any(r.launched for r in results):
        time.sleep(settle_seconds)  # Fenster brauchen einen Moment

    for app, result in zip(apps, results):
        if result.launched and app.get("position"):
            result.positioned = arrange(app)
            if not result.positioned and not result.message:
                result.message = _arrange_hint()
    return [r.to_dict() for r in results]


def _arrange_hint() -> str:
    if SYSTEM == "Darwin":
        return ("Fenster nicht positioniert. Systemeinstellungen > Datenschutz > "
                "Bedienungshilfen: Terminal erlauben.")
    if SYSTEM == "Windows":
        return "Fenster nicht positioniert. Optional: pip install pywin32"
    return "Fenster nicht positioniert. Optional: sudo apt install wmctrl"


def open_dashboard(url: str) -> bool:
    try:
        webbrowser.open(url)
        return True
    except Exception:
        return False


def play_spotify(uri: str) -> bool:
    """Spotify-URI oder -Link oeffnen (startet Wiedergabe in der Spotify-App)."""
    if not uri:
        return False
    try:
        if SYSTEM == "Darwin":
            subprocess.run(["open", uri], check=False, capture_output=True, timeout=12)
        elif SYSTEM == "Windows":
            subprocess.Popen(["cmd", "/c", "start", "", uri], shell=False)
        elif shutil.which("xdg-open"):
            subprocess.Popen(["xdg-open", uri],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            return False
        return True
    except Exception:
        return False

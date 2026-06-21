from __future__ import annotations

import argparse
import http.server
import json
import mimetypes
import os
import posixpath
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"
LOG_DIR = ROOT / "logs"
PID_PATH = ROOT / ".chamberreserve-ui.pid"
API_PID_PATH = ROOT / ".chamberreserve-api.pid"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = "5178"
DEFAULT_API_PORT = "8798"
APP_NAME = "ChamberReserve"
LAUNCHER_NAME = "chamberreserve-main.py"
HEALTH_PATH = "/__chamberreserve_launcher_health"
API_HEALTH_PATH = "/api/health"


def npm_command() -> str:
    command = shutil.which("npm.cmd") or shutil.which("npm")
    if not command:
        raise RuntimeError("npm was not found on PATH. Install Node.js, then run this launcher again.")
    return command


def node_command() -> str:
    command = shutil.which("node.exe") or shutil.which("node")
    if not command:
        raise RuntimeError("node was not found on PATH. Install Node.js, then run this launcher again.")
    return command


def powershell_command() -> str:
    return shutil.which("powershell.exe") or "powershell.exe"


def process_creationflags() -> int:
    if os.name != "nt":
        return 0
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)


def app_url(host: str, port: str) -> str:
    display_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    return f"http://{display_host}:{port}/"


def health_url(host: str, port: str) -> str:
    return urllib.parse.urljoin(app_url(host, port), HEALTH_PATH)


def api_url(host: str, port: str) -> str:
    display_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    return f"http://{display_host}:{port}/api/"


def api_health_url(host: str, port: str) -> str:
    return urllib.parse.urljoin(api_url(host, port), "health")


def read_http(url: str, timeout: float = 1.0) -> tuple[int, str] | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")
    except (OSError, TimeoutError, urllib.error.URLError):
        return None


def launcher_ui_ok(host: str, port: str) -> bool:
    response = read_http(health_url(host, port))
    if response is None or not 200 <= response[0] < 300:
        return False
    try:
        body = json.loads(response[1])
    except json.JSONDecodeError:
        return False
    return (
        isinstance(body, dict)
        and body.get("launcher") == LAUNCHER_NAME
        and body.get("app") == APP_NAME
        and str(body.get("port")) == str(port)
    )


def api_ok(host: str, port: str) -> bool:
    response = read_http(api_health_url(host, port))
    if response is None or not 200 <= response[0] < 300:
        return False
    try:
        body = json.loads(response[1])
    except json.JSONDecodeError:
        return False
    return (
        isinstance(body, dict)
        and body.get("ok") is True
        and body.get("app") == APP_NAME
        and body.get("mode") == "phase2-api"
    )


def wait_for_ui(host: str, port: str, timeout_seconds: float) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if launcher_ui_ok(host, port):
            return True
        time.sleep(0.25)
    return False


def wait_for_api(host: str, port: str, timeout_seconds: float) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if api_ok(host, port):
            return True
        time.sleep(0.25)
    return False


def ensure_dist_ready() -> None:
    if not (DIST_DIR / "index.html").is_file():
        raise RuntimeError("dist/index.html was not found. Run npm run build first.")


def read_pid(path: Path = PID_PATH) -> int | None:
    try:
        value = int(path.read_text(encoding="ascii").strip())
        return value if value > 0 else None
    except (OSError, ValueError):
        return None


def process_running(pid: int) -> bool:
    if os.name == "nt":
        try:
            result = subprocess.run(
                [
                    powershell_command(),
                    "-NoProfile",
                    "-Command",
                    f"if (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ exit 0 }} else {{ exit 1 }}",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                check=False,
            )
            return result.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            return False

    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def terminate_pid(pid: int, timeout_seconds: float = 8.0) -> None:
    if not process_running(pid):
        return
    if os.name == "nt":
        try:
            subprocess.run(
                [
                    powershell_command(),
                    "-NoProfile",
                    "-Command",
                    f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=timeout_seconds,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            pass
    else:
        try:
            os.kill(pid, 15)
        except OSError:
            return

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if not process_running(pid):
            return
        time.sleep(0.2)


def safe_dist_file(path: str) -> Path:
    parsed = urllib.parse.urlsplit(path)
    normalized = posixpath.normpath(urllib.parse.unquote(parsed.path).lstrip("/"))
    candidate = (DIST_DIR / normalized).resolve()
    dist_root = DIST_DIR.resolve()
    try:
        candidate.relative_to(dist_root)
    except ValueError:
        return DIST_DIR / "index.html"
    if candidate.is_file():
        return candidate
    return DIST_DIR / "index.html"


def send_json(handler: http.server.BaseHTTPRequestHandler, status: int, payload: object) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def proxy_api(handler: http.server.BaseHTTPRequestHandler, api_host: str, api_port: str) -> None:
    target = urllib.parse.urljoin(api_url(api_host, api_port), handler.path.removeprefix("/api/"))
    length = int(handler.headers.get("Content-Length") or "0")
    body = handler.rfile.read(length) if length > 0 else None
    headers = {}
    for name in ("Content-Type", "Accept"):
        if handler.headers.get(name):
            headers[name] = handler.headers[name]
    request = urllib.request.Request(target, data=body, headers=headers, method=handler.command)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            data = response.read()
            handler.send_response(response.status)
            for name, value in response.headers.items():
                lower_name = name.lower()
                if lower_name in {"connection", "transfer-encoding", "content-encoding"}:
                    continue
                handler.send_header(name, value)
            handler.end_headers()
            handler.wfile.write(data)
    except urllib.error.HTTPError as error:
        data = error.read()
        handler.send_response(error.code)
        for name, value in error.headers.items():
            lower_name = name.lower()
            if lower_name in {"connection", "transfer-encoding", "content-encoding"}:
                continue
            handler.send_header(name, value)
        handler.end_headers()
        handler.wfile.write(data)
    except (OSError, TimeoutError, urllib.error.URLError):
        send_json(handler, 502, {"ok": False, "error": "api_unavailable"})


def run_ui_server(host: str, port: str, api_host: str, api_port: str) -> None:
    ensure_dist_ready()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            request_path = urllib.parse.urlsplit(self.path).path
            if request_path.startswith("/api/"):
                proxy_api(self, api_host, api_port)
                return
            if request_path == HEALTH_PATH:
                send_json(
                    self,
                    200,
                    {
                        "ok": True,
                        "launcher": LAUNCHER_NAME,
                        "app": APP_NAME,
                        "mode": "phase2-static-ui-api",
                        "host": host,
                        "port": str(port),
                        "apiHost": api_host,
                        "apiPort": str(api_port),
                        "apiHealthy": api_ok(api_host, api_port),
                    },
                )
                return

            file_path = safe_dist_file(self.path)
            try:
                data = file_path.read_bytes()
            except OSError:
                self.send_error(404)
                return

            content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store" if file_path.name == "index.html" else "public, max-age=3600")
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self) -> None:
            proxy_api(self, api_host, api_port)

        def do_PATCH(self) -> None:
            proxy_api(self, api_host, api_port)

        def do_DELETE(self) -> None:
            proxy_api(self, api_host, api_port)

        def do_OPTIONS(self) -> None:
            proxy_api(self, api_host, api_port)

        def log_message(self, format: str, *args) -> None:
            return

    server = http.server.ThreadingHTTPServer((host, int(port)), Handler)
    server.serve_forever()


def start_api(host: str, port: str, db_path: str, wait_seconds: float) -> int:
    if api_ok(host, port):
        pid = read_pid(API_PID_PATH)
        if pid and process_running(pid):
            return pid
        return 0

    pid = read_pid(API_PID_PATH)
    if pid and process_running(pid):
        terminate_pid(pid)
    try:
        API_PID_PATH.unlink()
    except FileNotFoundError:
        pass

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stdout = open(LOG_DIR / "chamberreserve-api.out.log", "ab")
    stderr = open(LOG_DIR / "chamberreserve-api.err.log", "ab")
    env = os.environ.copy()
    env["CHAMBERRESERVE_API_HOST"] = host
    env["CHAMBERRESERVE_API_PORT"] = str(port)
    env["CHAMBERRESERVE_DB_PATH"] = db_path

    process = subprocess.Popen(
        [node_command(), "--experimental-strip-types", str(ROOT / "server" / "index.ts")],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=stdout,
        stderr=stderr,
        env=env,
        creationflags=process_creationflags(),
    )
    API_PID_PATH.write_text(str(process.pid), encoding="ascii")

    if not wait_for_api(host, port, wait_seconds):
        if process_running(process.pid):
            terminate_pid(process.pid)
        try:
            API_PID_PATH.unlink()
        except FileNotFoundError:
            pass
        raise RuntimeError(
            f"Started API pid {process.pid}, but {api_health_url(host, port)} did not become healthy. "
            "Check logs/chamberreserve-api.err.log."
        )
    return process.pid


def start_ui(host: str, port: str, api_host: str, api_port: str, wait_seconds: float) -> int:
    ensure_dist_ready()
    if launcher_ui_ok(host, port):
        pid = read_pid(PID_PATH)
        if pid and process_running(pid):
            return pid
        return 0

    pid = read_pid(PID_PATH)
    if pid and process_running(pid):
        terminate_pid(pid)
    try:
        PID_PATH.unlink()
    except FileNotFoundError:
        pass

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stdout = open(LOG_DIR / "chamberreserve-ui.out.log", "ab")
    stderr = open(LOG_DIR / "chamberreserve-ui.err.log", "ab")
    (LOG_DIR / "chamberreserve-launcher.log").write_text(
        f"[main.py] starting static UI at {time.strftime('%Y-%m-%d %H:%M:%S')}\n",
        encoding="utf-8",
    )

    process = subprocess.Popen(
        [
            sys.executable,
            str(ROOT / "main.py"),
            "--ui-server",
            "--host",
            host,
            "--port",
            str(port),
            "--api-host",
            api_host,
            "--api-port",
            str(api_port),
        ],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=stdout,
        stderr=stderr,
        creationflags=process_creationflags(),
    )
    PID_PATH.write_text(str(process.pid), encoding="ascii")

    if not wait_for_ui(host, port, wait_seconds):
        if process_running(process.pid):
            terminate_pid(process.pid)
        try:
            PID_PATH.unlink()
        except FileNotFoundError:
            pass
        raise RuntimeError(
            f"Started UI pid {process.pid}, but {app_url(host, port)} did not become healthy. "
            "Check logs/chamberreserve-ui.err.log."
        )
    return process.pid


def stop_ui() -> None:
    pid = read_pid(PID_PATH)
    if pid:
        terminate_pid(pid)
    try:
        PID_PATH.unlink()
    except FileNotFoundError:
        pass


def stop_api() -> None:
    pid = read_pid(API_PID_PATH)
    if pid:
        terminate_pid(pid)
    try:
        API_PID_PATH.unlink()
    except FileNotFoundError:
        pass


def print_status(host: str, port: str, api_host: str, api_port: str) -> int:
    ui_pid = read_pid(PID_PATH)
    api_pid = read_pid(API_PID_PATH)
    ui_running = bool(ui_pid and process_running(ui_pid))
    api_running = bool(api_pid and process_running(api_pid))
    ui_healthy = launcher_ui_ok(host, port)
    api_healthy = api_ok(api_host, api_port)
    if ui_healthy and api_healthy:
        print(
            f"RUNNING {app_url(host, port)} "
            f"ui_pid={ui_pid if ui_running else 'external'} "
            f"api={api_url(api_host, api_port)} "
            f"api_pid={api_pid if api_running else 'external'}"
        )
        return 0
    if ui_running or api_running:
        print(
            f"STALE ui_pid={ui_pid if ui_running else 'stopped'} "
            f"ui_healthy={ui_healthy} "
            f"api_pid={api_pid if api_running else 'stopped'} "
            f"api_healthy={api_healthy}"
        )
        return 1
    if ui_pid:
        try:
            PID_PATH.unlink()
        except FileNotFoundError:
            pass
    if api_pid:
        try:
            API_PID_PATH.unlink()
        except FileNotFoundError:
            pass
    print(f"STOPPED {app_url(host, port)} api={api_url(api_host, api_port)}")
    return 1


def run_check(host: str, port: str, api_host: str, api_port: str) -> None:
    if not (ROOT / "package.json").is_file():
        raise RuntimeError("package.json was not found.")
    if not (ROOT / "src" / "main.tsx").is_file():
        raise RuntimeError("src/main.tsx was not found.")
    if not (ROOT / "server" / "index.ts").is_file():
        raise RuntimeError("server/index.ts was not found.")
    if not (ROOT / "node_modules" / "vite" / "bin" / "vite.js").is_file():
        raise RuntimeError("Vite was not found in node_modules. Run npm install first.")
    npm_command()
    node_command()
    dist_state = "ready" if (DIST_DIR / "index.html").is_file() else "missing"
    print(f"CHECK PASS {APP_NAME}")
    print(f"URL {app_url(host, port)}")
    print(f"API {api_url(api_host, api_port)}")
    print("MODE phase2-static-ui-api")
    print(f"DIST {dist_state}")


def open_browser(url: str) -> None:
    webbrowser.open(url, new=2, autoraise=True)


def print_ready(host: str, port: str, ui_pid: int, api_host: str, api_port: str, api_pid: int) -> None:
    print(f"{APP_NAME} UI is running.")
    print(f"URL: {app_url(host, port)}")
    print(f"UI PID: {ui_pid if ui_pid else 'external'}")
    print(f"API: {api_url(api_host, api_port)}")
    print(f"API PID: {api_pid if api_pid else 'external'}")
    print("Stop: python main.py --stop")


def main() -> int:
    parser = argparse.ArgumentParser(description="Start the ChamberReserve Phase 2 browser UI and local API.")
    parser.add_argument("--host", default=os.environ.get("CHAMBERRESERVE_UI_HOST", DEFAULT_HOST))
    parser.add_argument("--port", default=os.environ.get("CHAMBERRESERVE_UI_PORT", DEFAULT_PORT))
    parser.add_argument("--api-host", default=os.environ.get("CHAMBERRESERVE_API_HOST", DEFAULT_HOST))
    parser.add_argument("--api-port", default=os.environ.get("CHAMBERRESERVE_API_PORT", DEFAULT_API_PORT))
    parser.add_argument("--db-path", default=os.environ.get("CHAMBERRESERVE_DB_PATH", str(ROOT / "data" / "chamberreserve.sqlite")))
    parser.add_argument("--check", action="store_true", help="Validate launcher prerequisites without starting the UI.")
    parser.add_argument("--status", action="store_true", help="Print the managed UI status.")
    parser.add_argument("--stop", action="store_true", help="Stop the managed UI and API processes.")
    parser.add_argument("--no-open", action="store_true", help="Start without opening the browser.")
    parser.add_argument("--wait-seconds", type=float, default=20.0, help="Seconds to wait for the UI to become healthy.")
    parser.add_argument("--ui-server", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    try:
        if args.ui_server:
            run_ui_server(args.host, str(args.port), args.api_host, str(args.api_port))
        elif args.check:
            run_check(args.host, str(args.port), args.api_host, str(args.api_port))
        elif args.status:
            return print_status(args.host, str(args.port), args.api_host, str(args.api_port))
        elif args.stop:
            stop_ui()
            stop_api()
            print(f"{APP_NAME} UI and API stopped.")
        else:
            api_pid = start_api(args.api_host, str(args.api_port), args.db_path, args.wait_seconds)
            try:
                ui_pid = start_ui(args.host, str(args.port), args.api_host, str(args.api_port), args.wait_seconds)
            except Exception:
                stop_api()
                raise
            if not args.no_open:
                open_browser(app_url(args.host, str(args.port)))
            print_ready(args.host, str(args.port), ui_pid, args.api_host, str(args.api_port), api_pid)
        return 0
    except Exception as error:
        print(f"{APP_NAME} launch failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

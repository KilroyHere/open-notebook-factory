#!/usr/bin/env python3
"""Start and supervise the Open Notebook development stack."""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import IO, Mapping, Optional, Protocol
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
API_LOG = Path(tempfile.gettempdir()) / "open-notebook-api.log"
WORKER_LOG = Path(tempfile.gettempdir()) / "open-notebook-worker.log"
PID_FILE = Path(tempfile.gettempdir()) / "open-notebook-start-all.pid"
STARTUP_TIMEOUT_SECONDS = 60


class StartupError(RuntimeError):
    """A development service could not start or remain healthy."""


class ProcessLike(Protocol):
    returncode: Optional[int]

    def poll(self) -> Optional[int]: ...


def load_environment(
    env_file: Path = ENV_FILE,
    parent_environment: Optional[Mapping[str, str]] = None,
) -> dict[str, str]:
    """Load `.env`, deliberately overriding stale exported shell values."""
    if not env_file.is_file():
        raise StartupError(
            f"{env_file} does not exist. Run `cp .env.example .env` and "
            "configure it before starting the stack."
        )

    environment = dict(parent_environment or os.environ)
    for key, value in dotenv_values(env_file).items():
        if value is not None:
            environment[key] = value

    database_url = environment.get("SURREAL_URL", "")
    if not database_url:
        raise StartupError("SURREAL_URL is missing from .env")
    parsed_url = urlparse(database_url)
    if parsed_url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise StartupError(
            "Source development runs the API and worker on the host, so "
            "SURREAL_URL must use localhost. Set "
            "SURREAL_URL=ws://localhost:8000/rpc in .env."
        )
    if not environment.get("OPEN_NOTEBOOK_ENCRYPTION_KEY"):
        raise StartupError("OPEN_NOTEBOOK_ENCRYPTION_KEY is missing from .env")
    return environment


def port_is_open(host: str, port: int, timeout: float = 0.25) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def log_tail(path: Optional[Path], line_count: int = 30) -> str:
    if not path or not path.is_file():
        return ""
    return "\n".join(path.read_text(errors="replace").splitlines()[-line_count:])


def wait_for_port(
    host: str,
    port: int,
    label: str,
    process: Optional[ProcessLike] = None,
    log_path: Optional[Path] = None,
    timeout: int = STARTUP_TIMEOUT_SECONDS,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if port_is_open(host, port):
            return
        if process is not None and process.poll() is not None:
            details = log_tail(log_path)
            suffix = f"\n\n{details}" if details else ""
            raise StartupError(
                f"{label} exited with status {process.returncode}.{suffix}"
            )
        time.sleep(0.25)
    details = log_tail(log_path)
    suffix = f"\n\n{details}" if details else ""
    raise StartupError(f"Timed out waiting for {label} on {host}:{port}.{suffix}")


def wait_for_http(
    url: str,
    label: str,
    process: ProcessLike,
    log_path: Path,
    timeout: int = STARTUP_TIMEOUT_SECONDS,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise StartupError(
                f"{label} exited with status {process.returncode}.\n\n"
                f"{log_tail(log_path)}"
            )
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, URLError):
            pass
        time.sleep(0.25)
    raise StartupError(
        f"Timed out waiting for {label} at {url}.\n\n{log_tail(log_path)}"
    )


def stop_process(process: Optional[subprocess.Popen]) -> None:
    if process is None or process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=8)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def start_logged_process(
    command: list[str],
    log_path: Path,
    environment: Mapping[str, str],
    cwd: Path = ROOT,
) -> tuple[subprocess.Popen, IO[str]]:
    log_handle = log_path.open("w")
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=dict(environment),
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    return process, log_handle


def ensure_port_available(port: int, service: str) -> None:
    if port_is_open("127.0.0.1", port):
        raise StartupError(
            f"Port {port} is already in use, so {service} cannot start. "
            "Run `make stop-all`, or inspect it with "
            f"`lsof -nP -iTCP:{port} -sTCP:LISTEN`."
        )


def main() -> int:
    processes: dict[str, subprocess.Popen] = {}
    log_handles: list[IO[str]] = []
    database_started = False
    environment: dict[str, str] = {}

    def cleanup() -> None:
        for name in ("frontend", "worker", "api"):
            stop_process(processes.get(name))
        for handle in log_handles:
            handle.close()
        if database_started:
            subprocess.run(
                ["docker", "compose", "down"],
                cwd=ROOT,
                env=environment or None,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        PID_FILE.unlink(missing_ok=True)

    def handle_signal(_signum, _frame) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    try:
        environment = load_environment()
        environment["PYTHONUNBUFFERED"] = "1"
        api_port = int(environment.get("API_PORT", "5055"))
        frontend_port = int(environment.get("PORT", "3000"))
        database_port = urlparse(environment["SURREAL_URL"]).port or 8000

        ensure_port_available(api_port, "the API")
        ensure_port_available(frontend_port, "the frontend")
        PID_FILE.write_text(str(os.getpid()))

        print("Starting SurrealDB...")
        subprocess.run(
            ["docker", "compose", "up", "-d", "surrealdb"],
            cwd=ROOT,
            env=environment,
            check=True,
        )
        database_started = True
        wait_for_port("127.0.0.1", database_port, "SurrealDB")
        print(f"SurrealDB is ready on port {database_port}.")

        print("Starting API...")
        api, api_log = start_logged_process(
            ["uv", "run", "run_api.py"], API_LOG, environment
        )
        processes["api"] = api
        log_handles.append(api_log)
        wait_for_http(
            f"http://127.0.0.1:{api_port}/health",
            "API",
            api,
            API_LOG,
        )
        print(f"API is healthy on http://127.0.0.1:{api_port}.")

        print("Starting background worker...")
        worker, worker_log = start_logged_process(
            [
                "uv",
                "run",
                "surreal-commands-worker",
                "--import-modules",
                "commands",
                "--max-tasks",
                environment.get("OPEN_NOTEBOOK_WORKER_MAX_TASKS", "5"),
            ],
            WORKER_LOG,
            environment,
        )
        processes["worker"] = worker
        log_handles.append(worker_log)
        # The worker has no health endpoint. Database failures happen during
        # its initial connection, so require it to survive that startup window.
        for _ in range(20):
            if worker.poll() is not None:
                raise StartupError(
                    f"Worker exited with status {worker.returncode}.\n\n"
                    f"{log_tail(WORKER_LOG)}"
                )
            time.sleep(0.25)
        print(f"Worker is running. Log: {WORKER_LOG}")

        print("Starting frontend...")
        frontend = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=ROOT / "frontend",
            env=environment,
            start_new_session=True,
        )
        processes["frontend"] = frontend
        wait_for_port(
            "127.0.0.1",
            frontend_port,
            "frontend",
            process=frontend,
        )

        print("\nAll services are ready:")
        print(f"  Frontend: http://localhost:{frontend_port}")
        print(f"  API:      http://localhost:{api_port}")
        print(f"  API docs: http://localhost:{api_port}/docs")
        print(f"  API log:  {API_LOG}")
        print(f"  Worker:   {WORKER_LOG}")
        print("Press Ctrl+C to stop the complete stack.\n")

        while True:
            for name, process in processes.items():
                return_code = process.poll()
                if return_code is not None:
                    log_path = (
                        API_LOG
                        if name == "api"
                        else WORKER_LOG
                        if name == "worker"
                        else None
                    )
                    details = log_tail(log_path)
                    suffix = f"\n\n{details}" if details else ""
                    raise StartupError(
                        f"{name.capitalize()} exited with status {return_code}.{suffix}"
                    )
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping Open Notebook...")
        return 0
    except (
        OSError,
        StartupError,
        subprocess.CalledProcessError,
        ValueError,
    ) as error:
        print(f"\nERROR: {error}", file=sys.stderr)
        return 1
    finally:
        cleanup()


if __name__ == "__main__":
    raise SystemExit(main())

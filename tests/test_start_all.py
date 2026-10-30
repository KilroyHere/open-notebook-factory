"""Tests for the supervised development-stack launcher."""

import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts import start_all


def write_env(path: Path, database_url: str = "ws://localhost:8000/rpc") -> None:
    path.write_text(
        "\n".join(
            [
                f"SURREAL_URL={database_url}",
                "SURREAL_USER=root",
                "SURREAL_PASSWORD=root",
                "OPEN_NOTEBOOK_ENCRYPTION_KEY=local-test-key",
            ]
        )
    )


def test_env_file_overrides_stale_exported_database_url(tmp_path):
    env_file = tmp_path / ".env"
    write_env(env_file)

    environment = start_all.load_environment(
        env_file,
        {
            "SURREAL_URL": "ws://surrealdb:8000/rpc",
            "OPEN_NOTEBOOK_ENCRYPTION_KEY": "stale-key",
        },
    )

    assert environment["SURREAL_URL"] == "ws://localhost:8000/rpc"
    assert environment["OPEN_NOTEBOOK_ENCRYPTION_KEY"] == "local-test-key"


def test_container_database_hostname_gets_actionable_error(tmp_path):
    env_file = tmp_path / ".env"
    write_env(env_file, "ws://surrealdb:8000/rpc")

    with pytest.raises(
        start_all.StartupError,
        match="SURREAL_URL must use localhost",
    ):
        start_all.load_environment(env_file, {})


def test_missing_env_file_gets_setup_instruction(tmp_path):
    with pytest.raises(start_all.StartupError, match="cp .env.example .env"):
        start_all.load_environment(tmp_path / "missing.env", {})


def test_wait_for_port_accepts_ready_service():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = server.getsockname()[1]

        start_all.wait_for_port(
            "127.0.0.1",
            port,
            "test service",
            timeout=1,
        )


def test_wait_for_port_reports_process_log_on_early_exit(tmp_path):
    log_path = tmp_path / "service.log"
    log_path.write_text("first line\nspecific startup failure\n")
    process = SimpleNamespace(poll=lambda: 2, returncode=2)

    with pytest.raises(
        start_all.StartupError,
        match="specific startup failure",
    ):
        start_all.wait_for_port(
            "127.0.0.1",
            1,
            "test service",
            process=process,
            log_path=log_path,
            timeout=1,
        )


def test_makefile_delegates_start_all_to_supervisor():
    makefile = Path("Makefile").read_text()
    start_target = makefile.split("start-all:", 1)[1].split("stop-all:", 1)[0]

    assert "uv run python scripts/start_all.py" in start_target
    assert "run_api.py &" not in start_target


def test_makefile_status_checks_service_health_not_process_names():
    makefile = Path("Makefile").read_text()
    status_target = makefile.split("status:", 1)[1].split(
        "# === Documentation Export", 1
    )[0]

    assert "http://127.0.0.1:$${API_PORT:-5055}/health" in status_target
    assert "http://127.0.0.1:$${PORT:-3000}" in status_target
    assert 'pgrep -f "run_api.py' not in status_target
    assert 'pgrep -f "next dev' not in status_target


def test_database_compose_command_does_not_force_a_pull():
    command = start_all.database_compose_command()

    assert command[:4] == ["docker", "compose", "up", "-d"]
    assert command[command.index("--pull") + 1] == "missing"
    assert command[-1] == "surrealdb"


def test_makefile_database_target_does_not_force_a_pull():
    makefile = Path("Makefile").read_text()
    database_target = makefile.split("\ndatabase:", 1)[1].split("\nrun:", 1)[0]

    assert "docker compose up -d --pull missing surrealdb" in database_target


def test_start_database_reuses_reachable_surrealdb():
    calls = []

    started = start_all.start_database(
        "127.0.0.1",
        8000,
        {},
        run=lambda *args, **kwargs: calls.append(args),
        is_reachable=lambda host, port: True,
        port_open=lambda host, port: True,
    )

    assert started is False
    assert calls == []


def test_start_database_runs_compose_when_not_reachable():
    calls = []

    started = start_all.start_database(
        "127.0.0.1",
        8000,
        {"SURREAL_URL": "ws://localhost:8000/rpc"},
        run=lambda command, **kwargs: calls.append((command, kwargs)),
        is_reachable=lambda host, port: False,
        port_open=lambda host, port: False,
    )

    assert started is True
    assert len(calls) == 1
    command, kwargs = calls[0]
    assert command == start_all.database_compose_command()
    assert kwargs["check"] is True
    assert kwargs["env"] == {"SURREAL_URL": "ws://localhost:8000/rpc"}


def test_start_database_explains_compose_failure():
    def failing_run(command, **kwargs):
        raise start_all.subprocess.CalledProcessError(1, command)

    with pytest.raises(start_all.StartupError, match="rate limiting") as error:
        start_all.start_database(
            "127.0.0.1",
            8000,
            {},
            run=failing_run,
            is_reachable=lambda host, port: False,
            port_open=lambda host, port: False,
        )

    assert "--pull missing" in str(error.value)


def test_start_database_explains_missing_docker():
    def missing_docker(command, **kwargs):
        raise FileNotFoundError("docker")

    with pytest.raises(start_all.StartupError, match="Docker is not installed"):
        start_all.start_database(
            "127.0.0.1",
            8000,
            {},
            run=missing_docker,
            is_reachable=lambda host, port: False,
            port_open=lambda host, port: False,
        )


def test_start_database_rejects_foreign_service_on_database_port():
    calls = []

    with pytest.raises(start_all.StartupError, match="not answering as SurrealDB"):
        start_all.start_database(
            "127.0.0.1",
            8000,
            {},
            run=lambda *args, **kwargs: calls.append(args),
            is_reachable=lambda host, port: False,
            port_open=lambda host, port: True,
        )

    assert calls == []


def test_surrealdb_is_reachable_checks_health_endpoint():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200 if self.path == "/health" else 404)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        assert start_all.surrealdb_is_reachable("127.0.0.1", port) is True
    finally:
        server.shutdown()
        server.server_close()

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        free_port = probe.getsockname()[1]
    assert start_all.surrealdb_is_reachable("127.0.0.1", free_port) is False


def test_a_second_ctrl_c_does_not_cut_the_shutdown_short(tmp_path, monkeypatch):
    """Ctrl+C again while the stack stops must still stop all of it."""
    import os
    import signal
    import subprocess

    real_popen = subprocess.Popen
    real_sleep = start_all.time.sleep
    services: dict[str, subprocess.Popen] = {}
    compose_calls: list[list[str]] = []
    state = {"interrupted": False}

    def service(name: str) -> subprocess.Popen:
        services[name] = real_popen(["sleep", "30"], start_new_session=True)
        return services[name]

    def start_logged_process(command, log_path, environment, cwd=None):
        name = "api" if "run_api.py" in command else "worker"
        return service(name), (tmp_path / f"{name}.log").open("w")

    def start_frontend(*args, **kwargs):
        frontend = service("frontend")
        real_wait = frontend.wait

        def wait(timeout=None):
            # The impatient second Ctrl+C, while cleanup waits on the frontend.
            os.kill(os.getpid(), signal.SIGINT)
            return real_wait(timeout=timeout)

        frontend.wait = wait  # type: ignore[method-assign]
        return frontend

    def sleep(seconds):
        if "frontend" not in services:
            return  # The worker's startup window.
        if not state["interrupted"]:
            state["interrupted"] = True
            os.kill(os.getpid(), signal.SIGINT)  # The first Ctrl+C.
            return
        real_sleep(seconds)

    pid_file = tmp_path / "start-all.pid"
    monkeypatch.setattr(start_all, "PID_FILE", pid_file)
    monkeypatch.setattr(
        start_all,
        "load_environment",
        lambda: {
            "SURREAL_URL": "ws://localhost:8000/rpc",
            "OPEN_NOTEBOOK_ENCRYPTION_KEY": "local-test-key",
        },
    )
    monkeypatch.setattr(start_all, "ensure_port_available", lambda *args: None)
    monkeypatch.setattr(start_all, "start_database", lambda *args: True)
    monkeypatch.setattr(start_all, "wait_for_port", lambda *args, **kwargs: None)
    monkeypatch.setattr(start_all, "wait_for_http", lambda *args, **kwargs: None)
    monkeypatch.setattr(start_all, "start_logged_process", start_logged_process)
    monkeypatch.setattr(start_all.subprocess, "Popen", start_frontend)
    monkeypatch.setattr(
        start_all.subprocess,
        "run",
        lambda command, **kwargs: compose_calls.append(command),
    )
    monkeypatch.setattr(start_all.time, "sleep", sleep)

    handlers = {
        signum: signal.getsignal(signum) for signum in (signal.SIGINT, signal.SIGTERM)
    }
    try:
        try:
            exit_code = start_all.main()
        except KeyboardInterrupt:
            pytest.fail("the second Ctrl+C interrupted the shutdown")
        still_running = [
            name for name, process in services.items() if process.poll() is None
        ]
    finally:
        for signum, handler in handlers.items():
            signal.signal(signum, handler)
        for process in services.values():
            if process.poll() is None:
                process.kill()
                process.wait()

    assert exit_code == 0
    assert sorted(services) == ["api", "frontend", "worker"]
    assert still_running == []
    assert compose_calls == [["docker", "compose", "down"]]
    assert not pid_file.exists()


def test_interrupts_are_ignored_only_while_stopping():
    import os
    import signal

    received = []
    previous = {
        signum: signal.signal(signum, lambda signum, frame: received.append(signum))
        for signum in (signal.SIGINT, signal.SIGTERM)
    }
    try:
        with start_all.interrupts_ignored():
            os.kill(os.getpid(), signal.SIGINT)
            os.kill(os.getpid(), signal.SIGTERM)
            assert signal.getsignal(signal.SIGINT) is signal.SIG_IGN
        assert received == []
        os.kill(os.getpid(), signal.SIGTERM)
        assert received == [signal.SIGTERM]
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)

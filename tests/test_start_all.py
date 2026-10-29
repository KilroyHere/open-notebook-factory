"""Tests for the supervised development-stack launcher."""

import socket
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

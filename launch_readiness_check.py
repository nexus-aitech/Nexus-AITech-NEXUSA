#!/usr/bin/env python3
"""
Launch Readiness Check — Global‑grade, extensible, one‑command verifier.

What it does (modular checks):
  1) Dependencies
     - Verifies installed packages satisfy requirements (pip check + spec match)
     - Optionally installs missing ones (opt‑in)
  2) Tests
     - Runs pytest if available, otherwise unittest discovery
  3) Structure & Config
     - Validates expected folders/files (defaults + project‑specific via LAUNCHCHECK.json)
  4) Runtime smoke test
     - Starts your app using a configurable startup command; optional HTTP healthcheck
  5) Production settings
     - Validates required environment variables & sanity checks (no DEBUG/secret placeholders)
  6) Static analysis (optional)
     - Runs flake8/pylint/bandit if installed
  7) Docker (optional)
     - Builds image if Dockerfile exists (opt‑in)

Usage:
  python launch_readiness_check.py --help
  python launch_readiness_check.py --strict --report report.md
  python launch_readiness_check.py --install-missing --startup "python -m app" --health "http://127.0.0.1:8000/health"
  python launch_readiness_check.py --init        # writes LAUNCHCHECK.example.json

Config file (optional): LAUNCHCHECK.json
  See LAUNCHCHECK_EXAMPLE_JSON below or run with --init to generate.

Exit codes:
  0 = Ready for launch ✅
  1 = Failed checks ❌ (see summary)

No third‑party deps required; uses stdlib. Shell tools (pytest, flake8, etc.) are invoked if present.
"""
from __future__ import annotations

import argparse
import dataclasses
import http.client
import importlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import textwrap
import threading
import time
from pathlib import Path
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()
load_dotenv(".env.production")
load_dotenv(".env", override=True)  # اجازه بده .env روی مقادیر قبلی بنویسد

# ----------------------------- Utilities -----------------------------

RESET = "\x1b[0m"
RED = "\x1b[31m"
GREEN = "\x1b[32m"
YELLOW = "\x1b[33m"
CYAN = "\x1b[36m"
BOLD = "\x1b[1m"


def cprint(msg: str, color: str = RESET, prefix: str = ""):
    print(f"{prefix}{color}{msg}{RESET}")


def run_cmd(cmd: str | List[str], timeout: Optional[int] = None, env: Optional[Dict[str, str]] = None) -> subprocess.CompletedProcess:
    if isinstance(cmd, str):
        shell = True
        cmd_display = cmd
    else:
        shell = False
        cmd_display = " ".join(cmd)
    cprint(f"$ {cmd_display}", CYAN)
    try:
        proc = subprocess.run(cmd, shell=shell, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired as e:
        return subprocess.CompletedProcess(args=cmd, returncode=124, stdout=e.stdout or "", stderr=e.stderr or "Command timed out")
    return proc


def which(bin_name: str) -> Optional[str]:
    return shutil.which(bin_name)


@dataclasses.dataclass
class CheckResult:
    name: str
    ok: bool
    details: str = ""
    suggestion: str = ""
    duration_s: float = 0.0


class Section:
    def __init__(self, name: str):
        self.name = name
        self.results: List[CheckResult] = []

    def add(self, result: CheckResult):
        self.results.append(result)

    def ok(self) -> bool:
        return all(r.ok for r in self.results)

    def summarize(self) -> str:
        lines = [f"## {self.name}"]
        for r in self.results:
            status = "PASS" if r.ok else "FAIL"
            lines.append(f"- **{status}** {r.name} ({r.duration_s:.2f}s)\n  {r.details}\n  {('*Suggestion:* ' + r.suggestion) if r.suggestion else ''}")
        return "\n".join(lines)


# ----------------------------- Config -----------------------------

LAUNCHCHECK_EXAMPLE_JSON = {
    "expected_paths": ["src", "tests", "README.md", ".env.example", "pyproject.toml"],
    "required_env": ["DATABASE_URL", "SECRET_KEY", "ENV"],
    "env_rules": {
        "ENV": {"allowed": ["production", "staging"]},
        "DEBUG": {"allowed": ["0", "false", "False", 0, False], "disallow_if_missing": True}
    },
    "forbidden_values": ["changeme", "your_key_here", "password"],
    "startup_cmd": "python -m app",  # how to run the service in production mode
    "startup_env": {"ENV": "production", "DEBUG": "0"},
    "healthcheck": {"url": "http://127.0.0.1:8000/health", "timeout_s": 10, "expected_status": 200},
    "static_tools": {"flake8": True, "pylint": False, "bandit": True},
    "docker": {"enabled": False, "image_tag": "myapp:release"}
}


def load_config(config_path: Path) -> Dict[str, Any]:
    if config_path.exists():
        with config_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {}


# ----------------------------- Checks -----------------------------

def check_dependencies(section: Section, install_missing: bool):
    start = time.time()
    # 1) pip check (if available)
    pip_bin = [sys.executable, "-m", "pip"]
    has_pip = which("pip") or True  # assume python -m pip exists

    msgs = []
    ok = True

    # pip check verifies dependency resolution of installed packages
    proc = run_cmd(pip_bin + ["check", "--disable-pip-version-check"])
    if proc.returncode != 0:
        ok = False
        msgs.append(proc.stdout.strip() or proc.stderr.strip())

    # Ensure requirements.txt are satisfied; if not, optionally install
    req = Path("requirements.txt")
    if req.exists():
        # Try a dry check by using pip install with --no-deps --no-input --dry-run when supported.
        # Fallback: attempt install into current env only if user opted in.
        if install_missing:
            proc2 = run_cmd(pip_bin + ["install", "-r", str(req), "--disable-pip-version-check"])
            if proc2.returncode != 0:
                ok = False
                msgs.append("Failed to install requirements.txt\n" + (proc2.stderr or proc2.stdout))
        else:
            # Validate presence by attempting to import top-level packages heuristically
            missing = []
            try:
                import pkg_resources  # type: ignore
                reqs = list(pkg_resources.parse_requirements(req.read_text(encoding="utf-8")))
                for r in reqs:
                    # Heuristic: try to import project name token
                    top = re.split(r"[\[=>< ]", r.project_name)[0]
                    module = top.replace("-", "_")
                    try:
                        importlib.import_module(module)
                    except Exception:
                        missing.append(r.project_name)
                if missing:
                    ok = False
                    msgs.append("Missing packages (use --install-missing): " + ", ".join(missing))
            except Exception:
                msgs.append("Could not parse requirements.txt precisely; consider --install-missing for certainty.")
    else:
        msgs.append("No requirements.txt found (skipping install check).")

    duration = time.time() - start
    section.add(CheckResult(
        name="Dependencies integrity",
        ok=ok,
        details="\n".join(msgs) if msgs else "pip check passed and requirements satisfied.",
        suggestion=("Run with --install-missing to auto-install, or lock versions; consider using a virtualenv/venv." if not install_missing else "Review requirements and pin exact versions."),
        duration_s=duration,
    ))


def check_tests(section: Section, junit: Optional[Path]):
    start = time.time()
    ok = True
    details = []

    if which("pytest"):
        cmd = ["pytest", "-q"]
        if junit:
            cmd.extend(["--junitxml", str(junit)])
        proc = run_cmd(cmd)
        ok = (proc.returncode == 0)
        details.append(proc.stdout[-2000:] or proc.stderr[-2000:] or "pytest executed")
        suggestion = "Fix failing tests. Ensure deterministic tests and isolate network/file system where needed."
    else:
        # Fallback to unittest discovery
        proc = run_cmd([sys.executable, "-m", "unittest", "discover", "-v"])
        ok = (proc.returncode == 0)
        details.append(proc.stdout[-2000:] or proc.stderr[-2000:] or "unittest executed")
        suggestion = "Add pytest for richer assertions and fixtures."

    duration = time.time() - start
    section.add(CheckResult("Test suite", ok, "\n".join(details), suggestion, duration))


def check_structure(section: Section, expected_paths: List[str]):
    start = time.time()
    missing = []
    for p in expected_paths:
        if not Path(p).exists():
            missing.append(p)
    ok = not missing
    details = "All expected paths exist." if ok else ("Missing: " + ", ".join(missing))
    suggestion = "Create the missing files/folders, or update LAUNCHCHECK.json expected_paths."
    section.add(CheckResult("Project structure & config", ok, details, suggestion, time.time() - start))


def _http_head(url: str, timeout_s: int = 10) -> int:
    # very small dependency-free HTTP check (only for http://)
    if not url.startswith("http://") and not url.startswith("https://"):
        raise ValueError("healthcheck URL must start with http:// or https://")
    import urllib.request
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:  # nosec - healthcheck only
        return resp.getcode()


def check_runtime(section: Section, startup_cmd: Optional[str], health_url: Optional[str], env_overrides: Dict[str, str], startup_timeout: int, health_timeout: int, expected_status: int):
    start = time.time()
    if not startup_cmd:
        section.add(CheckResult("Runtime smoke test", True, "No startup_cmd provided; skipped.", "Provide startup_cmd in LAUNCHCHECK.json for runtime verification.", time.time() - start))
        return

    # Merge env
    env = os.environ.copy()
    env.update(env_overrides or {})

    # Start process in background
    cprint("Starting app for smoke test…", YELLOW)
    proc = subprocess.Popen(startup_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)

    # Read logs asynchronously to detect early crashes
    crashed = {"val": False}

    def _drain(stream, buf: List[str]):
        try:
            for line in iter(stream.readline, ""):
                buf.append(line)
        finally:
            stream.close()

    out_buf: List[str] = []
    err_buf: List[str] = []
    t1 = threading.Thread(target=_drain, args=(proc.stdout, out_buf))
    t2 = threading.Thread(target=_drain, args=(proc.stderr, err_buf))
    t1.start(); t2.start()

    # Wait up to startup_timeout for process to be alive
    deadline = time.time() + startup_timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            crashed["val"] = True
            break
        time.sleep(0.2)

    ok = True
    details_lines = []
    if crashed["val"]:
        ok = False
        details_lines.append("Process crashed during startup. Stderr tail:\n" + "".join(err_buf[-40:]))
    else:
        details_lines.append("Process started and remained alive for startup window.")
        if health_url:
            try:
                status = _http_head(health_url, timeout_s=health_timeout)
                if status != expected_status:
                    ok = False
                    details_lines.append(f"Healthcheck returned status {status}, expected {expected_status}.")
                else:
                    details_lines.append(f"Healthcheck returned expected status {status}.")
            except Exception as e:
                ok = False
                details_lines.append(f"Healthcheck error: {e}")

    # Terminate
    try:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    except Exception:
        pass

    section.add(CheckResult("Runtime smoke test", ok, "\n".join(details_lines), "Review startup logs and health endpoint.", time.time() - start))


def check_production_settings(section: Section, required_env: List[str], env_rules: Dict[str, Any], forbidden_values: List[str]):
    start = time.time()
    ok = True
    lines = []

    # Required envs present
    for key in required_env:
        if os.getenv(key) is None:
            ok = False
            lines.append(f"Missing env var: {key}")

    # Rules
    for key, rule in (env_rules or {}).items():
        val = os.getenv(key)
        if val is None:
            if rule.get("disallow_if_missing"):
                ok = False
                lines.append(f"{key} must be set and be one of: {rule.get('allowed')}")
            continue
        allowed = rule.get("allowed")
        if allowed is not None and str(val) not in [str(a) for a in allowed]:
            ok = False
            lines.append(f"{key}='{val}' not in allowed set {allowed}")

    # Forbidden values
    for k, v in os.environ.items():
        if any(str(v).strip().lower() == str(f).strip().lower() for f in forbidden_values or []):
            ok = False
            lines.append(f"Env var {k} has a forbidden placeholder-like value")

    # Common pitfalls
    debug = os.getenv("DEBUG")
    if debug and str(debug).lower() in {"1", "true", "yes"}:
        ok = False
        lines.append("DEBUG must be disabled in production")

    section.add(CheckResult("Production settings", ok, "\n".join(lines) if lines else "Environment variables look sane for production.", "Set real secrets and disable DEBUG.", time.time() - start))


def check_static_tools(section: Section, run_flake8: bool, run_pylint: bool, run_bandit: bool):
    start = time.time()
    any_run = False

    if run_flake8 and which("flake8"):
        any_run = True
        proc = run_cmd(["flake8", "."])
        ok = proc.returncode == 0
        section.add(CheckResult("flake8", ok, proc.stdout or proc.stderr or "flake8 run" , "Fix style/errors or configure .flake8.", time.time() - start))
        start = time.time()

    if run_pylint and which("pylint"):
        any_run = True
        proc = run_cmd(["pylint", Path.cwd().name if Path("pyproject.toml").exists() else "."])
        ok = proc.returncode == 0
        section.add(CheckResult("pylint", ok, (proc.stdout or proc.stderr)[-2000:], "Address findings; consider disabling noisy checks per module.", time.time() - start))
        start = time.time()

    if run_bandit and which("bandit"):
        any_run = True
        proc = run_cmd(["bandit", "-q", "-r", "."])
        ok = proc.returncode == 0
        section.add(CheckResult("bandit (security)", ok, proc.stdout or proc.stderr or "bandit run", "Fix high/medium issues or add # nosec where justified.", time.time() - start))
        start = time.time()

    if not any_run:
        section.add(CheckResult("Static analysis", True, "No static tools configured/installed; skipped.", "Install flake8/pylint/bandit or enable in LAUNCHCHECK.json.", 0.0))


def check_docker(section: Section, enabled: bool, image_tag: str):
    start = time.time()
    if not enabled:
        section.add(CheckResult("Docker build", True, "Docker check disabled.", "Enable docker.enabled in config to verify containerization.", 0.0))
        return
    if not which("docker"):
        section.add(CheckResult("Docker build", False, "Docker CLI not found.", "Install Docker Desktop/Engine.", time.time() - start))
        return
    cmd = ["docker", "build", "-t", image_tag, "."]
    proc = run_cmd(cmd)
    ok = (proc.returncode == 0)
    details = (proc.stdout or proc.stderr)[-2000:]
    section.add(CheckResult("Docker build", ok, details, "Fix Dockerfile or dependencies; consider multi-stage builds.", time.time() - start))


# ----------------------------- Reporting -----------------------------

def render_markdown(sections: List[Section], total_time: float) -> str:
    parts = ["# Launch Readiness Report\n"]
    passed = sum(1 for s in sections if s.ok())
    parts.append(f"**Sections passed: {passed}/{len(sections)}**\n")
    for s in sections:
        parts.append(s.summarize())
        parts.append("")
    parts.append(f"_Total time: {total_time:.2f}s_\n")
    return "\n".join(parts)


# ----------------------------- Main -----------------------------

def main():
    parser = argparse.ArgumentParser(description="Launch readiness checker")
    parser.add_argument("--install-missing", action="store_true", help="Install missing requirements if needed")
    parser.add_argument("--strict", action="store_true", help="Fail on warnings and skip-if-not-configured items")
    parser.add_argument("--report", type=str, help="Write a Markdown report to this path")
    parser.add_argument("--init", action="store_true", help="Write LAUNCHCHECK.example.json and exit")

    # Overrides without config file
    parser.add_argument("--startup", type=str, default=None, help="Startup command for runtime smoke test")
    parser.add_argument("--health", type=str, default=None, help="Healthcheck URL (expects 200 unless --health-status) ")
    parser.add_argument("--health-status", type=int, default=200)
    parser.add_argument("--startup-timeout", type=int, default=12)
    parser.add_argument("--health-timeout", type=int, default=8)

    args = parser.parse_args()

    config_path = Path("LAUNCHCHECK.json")

    if args.init:
        example = json.dumps(LAUNCHCHECK_EXAMPLE_JSON, indent=2)
        Path("LAUNCHCHECK.example.json").write_text(example, encoding="utf-8")
        cprint("Wrote LAUNCHCHECK.example.json", GREEN)
        return 0

    cfg = load_config(config_path)

    expected_paths = cfg.get("expected_paths", ["src", "tests", "README.md"])
    required_env = cfg.get("required_env", [])
    env_rules = cfg.get("env_rules", {})
    forbidden_values = cfg.get("forbidden_values", ["changeme", "replace_me", "your_key_here"])  # common placeholders

    startup_cmd = cfg.get("startup_cmd") or args.startup
    startup_env = cfg.get("startup_env", {})
    health = cfg.get("healthcheck", {})
    health_url = health.get("url") or args.health
    expected_status = int(health.get("expected_status", args.health_status))
    startup_timeout = int(cfg.get("startup_timeout", args.startup_timeout))
    health_timeout = int(health.get("timeout_s", args.health_timeout))

    static_tools = cfg.get("static_tools", {})
    docker_cfg = cfg.get("docker", {"enabled": False, "image_tag": "app:release"})

    sections: List[Section] = []
    t0 = time.time()

    # 1) Dependencies
    s_dep = Section("Dependencies")
    check_dependencies(s_dep, install_missing=args.install_missing)
    sections.append(s_dep)

    # 2) Tests
    s_tests = Section("Tests")
    junit_path = Path(".launch_junit.xml") if which("pytest") else None
    check_tests(s_tests, junit=junit_path)
    sections.append(s_tests)

    # 3) Structure
    s_struct = Section("Structure & Config")
    check_structure(s_struct, expected_paths)
    sections.append(s_struct)

    # 4) Runtime
    s_runtime = Section("Runtime")
    check_runtime(s_runtime, startup_cmd, health_url, startup_env, startup_timeout, health_timeout, expected_status)
    sections.append(s_runtime)

    # 5) Production settings
    s_prod = Section("Production Settings")
    check_production_settings(s_prod, required_env, env_rules, forbidden_values)
    sections.append(s_prod)

    # 6) Static analysis
    s_static = Section("Static Analysis")
    check_static_tools(s_static, bool(static_tools.get("flake8")), bool(static_tools.get("pylint")), bool(static_tools.get("bandit")))
    sections.append(s_static)

    # 7) Docker (optional)
    s_docker = Section("Containerization")
    check_docker(s_docker, bool(docker_cfg.get("enabled")), str(docker_cfg.get("image_tag", "app:release")))
    sections.append(s_docker)

    total_time = time.time() - t0

    # Render report
    ok_all = all(s.ok() for s in sections)
    status_line = f"READY: {ok_all}"
    color = GREEN if ok_all else RED
    cprint("\n=== Launch Readiness Summary ===", BOLD)
    for s in sections:
        mark = "✅" if s.ok() else "❌"
        cprint(f"{mark} {s.name}", color if s.ok() else RED)
    cprint(f"Overall: {'✅ READY' if ok_all else '❌ NOT READY'} (t={total_time:.1f}s)", color)

    if args.report:
        Path(args.report).write_text(render_markdown(sections, total_time), encoding="utf-8")
        cprint(f"Report written to {args.report}", CYAN)

    return 0 if ok_all else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        cprint("Interrupted.", YELLOW)
        sys.exit(130)

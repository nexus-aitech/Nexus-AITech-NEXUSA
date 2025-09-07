# Placeholder for Prefect/Airflow DAGs; designed to be imported by your orchestration tool.
# Define tasks: fetch_rest -> produce_kafka -> feature_job -> signal_job -> store -> report

"""
orchestration/orchestrator.py

Lightweight DAG orchestrator placeholder:
- Define tasks (feature -> signal -> report)
- Resolve dependencies with topological sort
- Execute with timing & simple context passing
- Hooks for retries/circuit breaker from service_mesh_hooks

Integrate later with Prefect/Airflow; keep interfaces similar.
"""

from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Callable

from orchestration.service_mesh_hooks import RetryConfig, retry, CircuitBreaker

TaskFn = Callable[[Dict[str, Any]], Dict[str, Any]]  # takes context, returns updates


@dataclass
class Task:
    """A single DAG node with its callable and execution options."""
    name: str
    fn: TaskFn
    deps: Set[str] = field(default_factory=set)
    retry_cfg: Optional[RetryConfig] = None
    use_circuit_breaker: bool = False


@dataclass
class RunResult:
    """Result of an orchestrator run including timings, outputs, order, and errors."""
    succeeded: bool
    timings_ms: Dict[str, float]
    outputs: Dict[str, Dict[str, Any]]
    order: List[str]
    errors: Dict[str, str]


class Orchestrator:
    """Minimal DAG orchestrator with dependency resolution and simple context passing."""

    def __init__(self) -> None:
        """Initialize an empty task registry."""
        self._tasks: Dict[str, Task] = {}

    def task(
        self,
        name: str,
        *,
        deps: Optional[List[str]] = None,
        retry_cfg: Optional[RetryConfig] = None,
        use_circuit_breaker: bool = False,
    ) -> Callable[[TaskFn], TaskFn]:
        """Decorator to register a function as a task.

        Args:
            name: Unique task name.
            deps: Optional list of dependency task names.
            retry_cfg: Optional retry configuration.
            use_circuit_breaker: Wrap the task with a circuit breaker if True.

        Returns:
            A decorator that registers the function and returns it unchanged.
        """
        def decorator(fn: TaskFn) -> TaskFn:
            """Register the wrapped function as a task and return it."""
            self.add_task(Task(
                name=name,
                fn=fn,
                deps=set(deps or []),
                retry_cfg=retry_cfg,
                use_circuit_breaker=use_circuit_breaker,
            ))
            return fn
        return decorator

    def add_task(self, task: Task) -> None:
        """Add a Task to the orchestrator, enforcing unique names."""
        if task.name in self._tasks:
            raise ValueError(f"Task already exists: {task.name}")
        self._tasks[task.name] = task

    def _toposort(self) -> List[str]:
        """Topologically sort tasks and validate dependencies/cycles.

        Returns:
            A list of task names in a valid execution order.

        Raises:
            ValueError: If an unknown dependency is referenced or a cycle is detected.
        """
        tasks = self._tasks
        indeg: Dict[str, int] = {n: 0 for n in tasks}
        for t in tasks.values():
            for d in t.deps:
                if d not in tasks:
                    raise ValueError(f"Unknown dependency '{d}' for task '{t.name}'")
                indeg[t.name] += 1
        q = [n for n, d in indeg.items() if d == 0]
        order: List[str] = []
        deps_map = {n: set(tasks[n].deps) for n in tasks}
        while q:
            n = q.pop(0)
            order.append(n)
            for m in tasks:
                if n in deps_map[m]:
                    deps_map[m].remove(n)
                    indeg[m] -= 1
                    if indeg[m] == 0:
                        q.append(m)
        if len(order) != len(tasks):
            raise ValueError("Cycle detected in DAG")
        return order

    def run(self, initial_ctx: Optional[Dict[str, Any]] = None) -> RunResult:
        """Execute tasks in topological order with shared context.

        Args:
            initial_ctx: Optional initial context dict.

        Returns:
            RunResult with success flag, timings, outputs, order, and errors.
        """
        order = self._toposort()
        ctx: Dict[str, Any] = dict(initial_ctx or {})
        timings_ms: Dict[str, float] = {}
        outputs: Dict[str, Dict[str, Any]] = {}
        errors: Dict[str, str] = {}
        circuit = CircuitBreaker()

        for name in order:
            task = self._tasks[name]
            fn: TaskFn = task.fn
            if task.retry_cfg:
                fn = retry(task.retry_cfg)(fn)
            if task.use_circuit_breaker:
                fn = circuit.wrap(fn)

            start = time.perf_counter()
            try:
                out = fn(dict(ctx)) or {}
                ctx.update({name: out})
                outputs[name] = out
            except Exception as e:
                errors[name] = str(e)
                timings_ms[name] = (time.perf_counter() - start) * 1000.0
                return RunResult(False, timings_ms, outputs, order, errors)
            timings_ms[name] = (time.perf_counter() - start) * 1000.0

        return RunResult(True, timings_ms, outputs, order, errors)


# ---- Example wiring for feature -> signal -> report ----

def build_default_dag() -> Orchestrator:
    """Build a default DAG: features -> signals -> report."""
    orch = Orchestrator()

    @orch.task("features")
    def compute_features(ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Compute and return feature metadata (placeholder)."""
        # placeholder deterministic compute
        return {"n_features": 42}

    @orch.task("signals", deps=["features"], retry_cfg=RetryConfig(attempts=2, base_delay=0.05))
    def generate_signals(ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Generate signals based on computed features (placeholder)."""
        nf = ctx.get("features", {}).get("n_features", 0)
        return {"signals": ["BUY" if nf % 2 == 0 else "SELL"]}

    @orch.task("report", deps=["signals"], use_circuit_breaker=True)
    def make_report(ctx: Dict[str, Any]) -> Dict[str, Any]:
        """Create a minimal report from generated signals (placeholder)."""
        sigs = ctx.get("signals", {}).get("signals", [])
        return {"report": {"count": len(sigs)}}

    return orch

# Launch Readiness Report

**Sections passed: 3/7**

## Dependencies
- **PASS** Dependencies integrity (6.39s)
  pip check passed and requirements satisfied.
  *Suggestion:* Review requirements and pin exact versions.

## Tests
- **FAIL** Test suite (4.54s)
  ng
E   OIDC_AUDIENCE
E     Field required [type=missing, input_value={'REDIS_URL': 'redis://:0..._llm_reporting': 'true'}, input_type=dict]
E       For further information visit https://errors.pydantic.dev/2.11/v/missing
E   CLICKHOUSE_DSN
E     Field required [type=missing, input_value={'REDIS_URL': 'redis://:0..._llm_reporting': 'true'}, input_type=dict]
E       For further information visit https://errors.pydantic.dev/2.11/v/missing
============================== warnings summary ===============================
C:\Users\elias\AppData\Local\Programs\Python\Python311\Lib\site-packages\_pytest\config\__init__.py:1507
  C:\Users\elias\AppData\Local\Programs\Python\Python311\Lib\site-packages\_pytest\config\__init__.py:1507: PytestConfigWarning: No files were found in testpaths; consider removing or adjusting your testpaths configuration. Searching recursively from the current directory instead.
    self.args, self.args_source = self._decide_args(

C:\Users\elias\AppData\Local\Programs\Python\Python311\Lib\site-packages\_pytest\config\__init__.py:1448
  C:\Users\elias\AppData\Local\Programs\Python\Python311\Lib\site-packages\_pytest\config\__init__.py:1448: PytestConfigWarning: Unknown config option: typeCheckingMode
  
    self._warn_or_fail_if_strict(f"Unknown config option: {key}\n")

C:\Users\elias\AppData\Local\Programs\Python\Python311\Lib\site-packages\starlette\formparsers.py:12
  C:\Users\elias\AppData\Local\Programs\Python\Python311\Lib\site-packages\starlette\formparsers.py:12: PendingDeprecationWarning: Please use `import python_multipart` instead.
    import multipart

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
--------------- generated xml file: D:\NEXUSA\.launch_junit.xml ---------------
=========================== short test summary info ===========================
ERROR services/content/tests/test_content.py - pydantic_core._pydantic_core.V...
!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!

  *Suggestion:* Fix failing tests. Ensure deterministic tests and isolate network/file system where needed.

## Structure & Config
- **FAIL** Project structure & config (0.00s)
  Missing: tests
  *Suggestion:* Create the missing files/folders, or update LAUNCHCHECK.json expected_paths.

## Runtime
- **FAIL** Runtime smoke test (2.61s)
  Process crashed during startup. Stderr tail:
[CONFIG ERROR] 1 validation error for KafkaCfg
bootstrap
  Field required [type=missing, input_value={'app_env': 'production',..._llm_reporting': 'true'}, input_type=dict]
    For further information visit https://errors.pydantic.dev/2.11/v/missing

  *Suggestion:* Review startup logs and health endpoint.

## Production Settings
- **FAIL** Production settings (0.00s)
  Missing env var: ENV
Missing env var: SECRET_KEY
Missing env var: DATABASE_URL
Missing env var: KAFKA_BOOTSTRAP
DEBUG must be set and be one of: ['0', 'false', 'False']
  *Suggestion:* Set real secrets and disable DEBUG.

## Static Analysis
- **PASS** Static analysis (0.00s)
  No static tools configured/installed; skipped.
  *Suggestion:* Install flake8/pylint/bandit or enable in LAUNCHCHECK.json.

## Containerization
- **PASS** Docker build (0.00s)
  Docker check disabled.
  *Suggestion:* Enable docker.enabled in config to verify containerization.

_Total time: 13.56s_

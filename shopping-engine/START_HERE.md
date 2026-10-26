# Shopping Engine — START HERE

This directory is a handoff staging area for the Shopping Intelligence Engine.

## Source provenance
- The original `shopping_handoff_v0_9.zip` was available and inspected in the ChatGPT session.
- The previously reported `shopping_handoff_v0_9_1.zip` and its `p0_evidence_audit.py` were **not available** in the current runtime. Do not claim that v0.9.1 has been restored.
- The v0.9 ZIP contains Python modules, pytest tests, SQLite replay databases and project handoff documentation. The full original source ZIP still needs to be transferred to this repository.

## First actions in Work
1. Locate and add the original v0.9.1 ZIP (preferred), or the verified v0.9 ZIP, to the repository.
2. Read PROJECT_STATUS.md, ARCHITECTURE.md, NEXT_TASKS.md and INTERFACE_CONTRACT.md.
3. Run `python -m pip install -r requirements.txt` and `python -m pytest -q` from the engine directory.
4. Do not count mock/replay tests as authenticated live API tests.
5. Keep credentials out of commits, preserve existing files, and open a PR after validation.

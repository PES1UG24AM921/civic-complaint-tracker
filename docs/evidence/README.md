# Evidence bundle

This directory collects the project evidence required for the DBMS Level 3 submission.

## Included artifacts
- `ddl-log.txt` — PostgreSQL schema and migration verification notes
- `escalation-log.txt` — overdue escalation trigger/procedure check
- `mongo-summary.json` — sample MongoDB comment aggregation summary
- `tree-output.txt` — project tree snapshot for review
- `status.md` — current environment validation status and limitations
- `final-project-report.docx` — Word report bundle generated from the project summary

## Live database outputs
The repository includes the SQL and Mongo code paths needed to generate fresh database proof, but the current environment does not have working PostgreSQL/Mongo services configured with the required credentials. Once the service is available, the repo scripts below can be used to regenerate the live evidence:

- `npm run ddl-demo`
- `npm run escalate`
- `npm run test:integration`

The screenshot set already lives in the parent `docs/` folder and is referenced in the project report.

# Repository Guidelines

## Project Structure & Module Organization

This repository is currently empty (no tracked source, test, or asset files). As you add code, follow a simple, predictable layout:

- `src/`: application or library source code (group by feature or module).
- `tests/`: automated tests mirroring `src/` paths.
- `assets/`: static files (fixtures, sample exports, images, etc.).
- `scripts/`: one-off or maintenance scripts.

Example: `src/exporter/index.ts` with tests in `tests/exporter/index.test.ts`.

## Build, Test, and Development Commands

No build or test commands are defined yet. When tooling is added, document the exact commands here (and in README) with a short explanation.

Example patterns to adopt:

- `npm run dev`: start local development server or watcher.
- `npm test`: run the full test suite.
- `npm run lint`: check code style and formatting.

## Coding Style & Naming Conventions

No formatter or linter is configured. Until one is added:

- Use consistent indentation (2 or 4 spaces) within each file.
- Prefer `camelCase` for variables/functions and `PascalCase` for types/classes.
- Name modules by responsibility (e.g., `exporter`, `parser`, `cli`).

## Testing Guidelines

No testing framework is configured. When tests are added:

- Place tests under `tests/` and mirror `src/` structure.
- Use `*.test.*` naming (for example, `bookmark_parser.test.ts`).
- Document coverage expectations (unit vs. integration) in this file.

## Commit & Pull Request Guidelines

No Git history is present in this workspace. Until conventions are established, use short, imperative commit messages (e.g., “Add parser skeleton”).

For pull requests:

- Provide a concise summary and testing notes.
- Link related issues if applicable.
- Include screenshots or sample outputs when changes affect user-facing behavior.

## Configuration & Security

If you introduce configuration files or secrets, keep them out of version control and document required environment variables in `README.md` or a `docs/` note.

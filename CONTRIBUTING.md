# Contributing

PopCorn is an experimental language. Bug reports and focused pull requests are
welcome.

1. Create a branch from `main`.
2. Install the development environment with `python -m pip install -e ".[dev]"`.
3. Run `python -m pytest`.
4. If the VS Code extension changes, run `npm test` in `vscode-popcorn`.
5. Update `popcorn_specification.md` whenever syntax or runtime behavior changes.

Please keep each pull request limited to one language or tooling change.

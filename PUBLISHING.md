# Publishing

`packages/typescript` and `packages/python` publish as `stagehand-gemini-sdk` on npm and PyPI. Keep their versions aligned with the quickstart dependencies. Build the npm package with `pnpm --dir packages/typescript pack --pack-destination ../../dist` and the Python distributions with `uv build packages/python --out-dir dist`. Both packages include their source and MIT license; Stagehand remains a dependency.

Before the first release, validate the packed distributions with the quickstarts. After publication, switch the quickstart guides to registry installs, remove the Python example's local `tool.uv.sources` override, regenerate its lockfile, and add npm/PyPI links to the root README. Local development uses the pnpm workspace and editable Python package.

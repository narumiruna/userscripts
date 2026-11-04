## Documentation

- [UNREVIEWED] Keep the root `README.md` limited to the script index and documentation that applies to all scripts.
- [UNREVIEWED] Put script-specific usage, setup, behavior, limits, privacy, and validation in `src/<script>/README.md`.
- [UNREVIEWED] Link each script's README from the root index.

## Testing

- When Playwright launches Chromium in headed mode under WSLg, include `--ozone-platform=wayland` in the launch arguments.
  - Preserve existing launch arguments.
  - Do not change headless launch behavior.

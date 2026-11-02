## Testing

- When Playwright launches Chromium in headed mode under WSLg, include `--ozone-platform=wayland` in the launch arguments.
  - Preserve existing launch arguments.
  - Do not change headless launch behavior.

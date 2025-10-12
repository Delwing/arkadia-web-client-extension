# AGENTS

## Testing

Use `yarn --cwd client test` to run tests.
Use `yarn --cwd web-client test` to run tests.

Ensure that `yarn --cwd web-client build` doesn't end up with error.

Always run tests!

## Coding guidelines

In Regexps don't add ever polish letters.
Prefer creation of HTML elements in HTML files, when possible.
Do not register `unload`/`beforeunload` handlers solely to clean up store
subscriptions or other in-memory listeners—the browser tears them down during
navigation and reloads, so manual cleanup is unnecessary.

## Data directory

Never modify files inside the `data` directory.

## Screenshots
For taking screenshots it might be better to use sandbox.html or there is close connection popup button, logging in is not required.
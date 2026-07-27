// Surface runtime errors to the browser console so they are visible for
// interactive debugging. Import once, at the top of main.tsx.
let installed = false;

export function installErrorLogging(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    // Resource load errors (img/script/link) have no `error` object.
    if (event.error) {
      console.error('[app] Uncaught error:', event.error);
    } else {
      console.error(
        `[app] Resource/error event at ${event.filename}:${event.lineno}:${event.colno} —`,
        event.message,
      );
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[app] Unhandled promise rejection:', event.reason);
  });
}

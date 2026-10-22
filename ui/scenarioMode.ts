// Vite removes this branch and the dynamic fixture imports from release builds.
export const scenarioName = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('scenario') : null;

import "./tokens.css";
import "./brand/topology.css";
import "./brand/quota.css";
import "./brand/task-bubbles.css";
import { createRoot } from "react-dom/client";
import UiProvider from "./components/UiProvider";
import App from "./App";
import { scenarioName } from './scenarioMode';
const ready = import.meta.env.DEV && scenarioName ? await (await import('./scenarios')).installScenario(scenarioName) : undefined;
const PagesFixture = import.meta.env.DEV && scenarioName && (await import('./scenarios')).pageFixture ? (await import('./scenarioPages')).default : undefined;
createRoot(document.getElementById("app")!).render(
  <UiProvider>
    {PagesFixture ? <PagesFixture /> : <App />}
  </UiProvider>,
);

if (ready) requestAnimationFrame(() => { void ready().catch(async error => { (await import("./state/scenarioReadiness")).finishScenario(String(error)); }); });

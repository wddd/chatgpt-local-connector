import "./style.css";
import { createRoot } from "react-dom/client";
import UiProvider from "./components/UiProvider";
import App from "./App";
import "./product.css";
import { scenarioName } from './scenarioMode';
const ready = import.meta.env.DEV && scenarioName ? await (await import('./scenarios')).installScenario(scenarioName) : undefined;
const FormsFixture = import.meta.env.DEV && scenarioName?.startsWith("forms-") ? (await import("./scenarioForms")).default : undefined;
const ShellFixture = import.meta.env.DEV && scenarioName?.startsWith("shells-") ? (await import("./scenarioShells")).default : undefined;
createRoot(document.getElementById("app")!).render(
  <UiProvider>
    {FormsFixture ? <FormsFixture /> : ShellFixture ? <ShellFixture /> : <App />}
  </UiProvider>,
);

if (ready) requestAnimationFrame(() => { void ready().catch(async error => { (await import("./state/scenarioReadiness")).finishScenario(String(error)); }); });

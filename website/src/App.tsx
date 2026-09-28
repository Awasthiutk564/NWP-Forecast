import { Alerts } from "./components/Alerts";
import { CaseStudy } from "./components/CaseStudy";
import { Console } from "./components/Console";
import { DataSection, RunIt } from "./components/DataSection";
import { Experiments } from "./components/Experiments";
import { Explorer } from "./components/Explorer";
import { Footer } from "./components/Footer";
import { Hazards } from "./components/Hazards";
import { Header } from "./components/Header";
import { Hero, SourceStrip } from "./components/Hero";
import { Method } from "./components/Method";
import { Models } from "./components/Models";

const SECTIONS = {
  hero: Hero, strip: SourceStrip, results: Console, hazards: Hazards, method: Method, explorer: Explorer,
  experiments: Experiments, alerts: Alerts, case: CaseStudy, models: Models, data: DataSection, run: RunIt, footer: Footer,
};

export default function App() {
  // Development only: /?section=explorer renders a single section, handy for checking one part in isolation.
  const only = import.meta.env.DEV ? new URLSearchParams(location.search).get("section") : null;
  const Single = only ? SECTIONS[only as keyof typeof SECTIONS] : null;
  if (Single) return <><Header /><main id="main"><Single /></main></>;

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <Hero />
        <SourceStrip />
        <Console />
        <Hazards />
        <Method />
        <Explorer />
        <Experiments />
        <Alerts />
        <CaseStudy />
        <Models />
        <DataSection />
        <RunIt />
      </main>
      <Footer />
    </>
  );
}

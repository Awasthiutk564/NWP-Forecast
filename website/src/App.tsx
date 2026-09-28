import { PROJECT } from "./config";
import { Console } from "./components/Console";
import { Header } from "./components/Header";
import { Hero, SourceStrip } from "./components/Hero";

// Sections still to build: Method (observe / blend / warn), 3-D Explorer, Experiments,
// Alerts, Cyclone Michaung case, Models, Data & limitations.
export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <Hero />
        <SourceStrip />
        <Console />
      </main>
      <footer className="container section--tight faint small" style={{ borderTop: "1px solid var(--line)" }}>
        <p>
          {PROJECT.name} · {PROJECT.team} · {PROJECT.hackathon} · {PROJECT.problemId} ({PROJECT.problemTitle})
        </p>
        <p className="xs">
          Student prototype built for the hackathon. It is not an official forecast or warning of IMD, NCMRWF or any
          government body. Data: IMD, NCMRWF (IMDAA, MERA, S2S; CC-BY), LGD district boundaries.
        </p>
      </footer>
    </>
  );
}

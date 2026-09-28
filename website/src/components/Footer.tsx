import { NAV, PROJECT } from "../config";
import { Logo } from "./Header";
import "./footer.css";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p className="small muted">{PROJECT.tagline} for {PROJECT.region}. Next-day district alerts in English and <span lang="te">తెలుగు</span>.</p>
          </div>
          <nav aria-label="Footer: explore">
            <p className="side-title">Explore</p>
            <ul>{NAV.map((n) => <li key={n.id}><a href={`#${n.id}`}>{n.label}</a></li>)}</ul>
          </nav>
          <nav aria-label="Footer: project">
            <p className="side-title">Project</p>
            <ul>
              <li><a href={PROJECT.github} target="_blank" rel="noreferrer">GitHub repository</a></li>
              <li><a href={PROJECT.drive} target="_blank" rel="noreferrer">Team data drive</a></li>
              <li><a href="#case">Cyclone Michaung case</a></li>
              <li><a href="#experiments">Experiments</a></li>
            </ul>
          </nav>
          <div>
            <p className="side-title">Programme</p>
            <ul>
              <li>{PROJECT.hackathon}</li>
              <li>{PROJECT.problemId} · {PROJECT.problemTitle}</li>
              <li>{PROJECT.ministry}</li>
              <li>Theme: {PROJECT.theme}</li>
            </ul>
          </div>
        </div>
        <div className="footer-note">
          <p className="xs">
            <b>Disclaimer.</b> {PROJECT.name} is a student prototype built by {PROJECT.team} for {PROJECT.hackathon}. It is not an official
            forecast or warning of IMD, NCMRWF or any government body. For official warnings, follow IMD and your State Disaster Management Authority.
          </p>
          <p className="xs faint">
            Data: IMD gridded rainfall and temperature; NCMRWF IMDAA, MERA and S2S (CC-BY); LGD district boundaries, Government of India.
            © 2026 {PROJECT.team}.
          </p>
        </div>
      </div>
      <div className="tricolor" aria-hidden><span /><span /><span /></div>
    </footer>
  );
}

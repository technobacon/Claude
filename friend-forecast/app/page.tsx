import { DemoMarket } from "@/components/demo-market";
import Link from "next/link";

const trustPoints = [
  "Private groups only",
  "Points cannot be purchased",
  "One dispute round",
  "Full refund when truth is unclear"
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Friend Forecast home">
          <span className="brand-mark" aria-hidden="true">
            FF
          </span>
          <span>Friend Forecast</span>
        </a>
        <Link className="ghost-button" href="/auth/sign-in?next=%2Fgroups">
          Sign in
        </Link>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Private markets for real friend groups</div>
        <h1 data-testid="hero-title">Put points behind the group chat take.</h1>
        <p className="hero-copy">
          Create a YES/NO market, share it with friends, watch the odds move, and settle the debate when reality arrives.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" href="/auth/sign-in?next=%2Fgroups">Create a market</Link>
          <a className="text-link" href="#demo">
            Try the live demo
          </a>
        </div>
        <div className="social-proof" aria-label="Product characteristics">
          <span className="avatar-stack" aria-hidden="true">
            <span>MA</span>
            <span>GK</span>
            <span>JL</span>
          </span>
          <span>Made for groups of 5–12 friends</span>
        </div>
      </section>

      <section className="demo-section" id="demo" aria-labelledby="demo-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Interactive market preview</span>
            <h2 id="demo-heading">See how the pool moves.</h2>
          </div>
          <span className="status-pill"><span /> Betting open</span>
        </div>
        <DemoMarket />
      </section>

      <section className="principles" aria-labelledby="principles-heading">
        <div>
          <span className="eyebrow">Designed for trust</span>
          <h2 id="principles-heading">Competitive without becoming serious money.</h2>
        </div>
        <ul>
          {trustPoints.map((point) => (
            <li key={point}>
              <span aria-hidden="true">✓</span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <footer>
        <span>Friend Forecast · Foundation build</span>
        <span>No cash, no crypto, no public feed.</span>
      </footer>
    </main>
  );
}

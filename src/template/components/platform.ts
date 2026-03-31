export function platformCss(): string {
  return `.platform-hero {
  padding: 3rem 0 2.5rem;
}

.platform-hero-subtitle {
  color: var(--muted);
  font-size: 0.95rem;
  margin: 0 0 0.5rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.platform-hero h2 {
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.75rem;
}

.platform-hero p {
  color: var(--accent);
  font-size: 1rem;
  max-width: 32rem;
  margin: 0 0 1.1rem;
}

.cta-button {
  display: inline-block;
  padding: 0.6rem 1.6rem;
  background: var(--text);
  color: var(--bg);
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  border-radius: 4px;
  transition: opacity 0.15s;
}

.cta-button:hover {
  opacity: 0.85;
}

.ghost-link {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.85rem;
  font-family: var(--font-mono);
}

.ghost-link:hover {
  color: var(--text);
}

.hero-technical {
  border-bottom: 1px solid var(--border);
  position: relative;
}

.hero-technical::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(800px 300px at 20% 0%, rgba(37, 99, 235, 0.08), transparent 60%),
    radial-gradient(700px 260px at 90% 20%, rgba(0, 0, 0, 0.06), transparent 60%);
  pointer-events: none;
}

:root[data-theme="dark"] .hero-technical::before {
  background:
    radial-gradient(800px 300px at 20% 0%, rgba(37, 99, 235, 0.18), transparent 60%),
    radial-gradient(700px 260px at 90% 20%, rgba(255, 255, 255, 0.06), transparent 60%);
}

.hero-technical-inner {
  position: relative;
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 2.5rem;
  align-items: center;
}

.hero-technical-copy h2 {
  font-size: clamp(1.8rem, 4vw, 2.7rem);
}

.hero-cta {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
}

.hero-technical-panel {
  display: grid;
  gap: 1rem;
}

.hero-panel-box {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem 1.1rem;
  background: rgba(0, 0, 0, 0.02);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
}

:root[data-theme="dark"] .hero-panel-box {
  background: rgba(255, 255, 255, 0.03);
}

.panel-label {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-bottom: 0.5rem;
}

.panel-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  align-items: center;
  font-size: 0.85rem;
  color: var(--accent);
  margin-bottom: 0.6rem;
}

.panel-row:last-child {
  margin-bottom: 0;
}

.panel-pill {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted);
}

.platform-manifesto {
  padding: 2.5rem 0;
  border-bottom: 1px solid var(--border);
}

.manifesto-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(3, 1fr);
}

.manifesto-grid h3 {
  font-size: 1rem;
  margin-bottom: 0.4rem;
}

.manifesto-grid p {
  color: var(--muted);
  font-size: 0.9rem;
}

.platform-features {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
  padding: 2.5rem 0;
  border-bottom: 1px solid var(--border);
}

.feature h3 {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}

.feature p {
  font-size: 0.85rem;
  color: var(--muted);
  line-height: 1.5;
}

.platform-steps {
  padding: 2.5rem 0;
  border-bottom: 1px solid var(--border);
}

.platform-steps h3 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
}

.platform-steps ol {
  display: grid;
  gap: 0.75rem;
  list-style: none;
  counter-reset: steps;
  margin: 0;
  padding: 0;
}

.platform-steps li {
  counter-increment: steps;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.85rem 1rem 0.85rem 3.1rem;
  position: relative;
  background: rgba(0, 0, 0, 0.02);
  font-size: 0.9rem;
  color: var(--accent);
}

:root[data-theme="dark"] .platform-steps li {
  background: rgba(255, 255, 255, 0.03);
}

.platform-steps li::before {
  content: counter(steps);
  position: absolute;
  left: 0.8rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.5rem;
  height: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted);
}

.platform-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 2.5rem 0;
}

.platform-cta h3 {
  font-size: 1.3rem;
  margin-bottom: 0.5rem;
}

.platform-cta p {
  color: var(--muted);
  font-size: 0.9rem;
  max-width: 32rem;
}

.auth-form {
  max-width: 360px;
  margin: 0 auto;
  padding: 2rem 0;
}

.auth-form h2 {
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.auth-form > p {
  color: var(--muted);
  font-size: 0.85rem;
  margin-bottom: 1.5rem;
}

.auth-form form {
  display: flex;
  flex-direction: column;
}

.auth-form label {
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--accent);
  margin-bottom: 0.25rem;
  margin-top: 1rem;
}

.auth-form label:first-of-type {
  margin-top: 0;
}

.auth-form input {
  padding: 0.5rem 0.65rem;
  font-size: 0.9rem;
  font-family: var(--font);
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg);
  color: var(--text);
}

.auth-form input:focus {
  outline: none;
  border-color: var(--accent);
}

.auth-form small {
  font-size: 0.7rem;
  color: var(--muted);
  margin-top: 0.2rem;
}

.auth-form button {
  margin-top: 1.5rem;
  padding: 0.55rem 1rem;
  background: var(--text);
  color: var(--bg);
  border: none;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  cursor: pointer;
  transition: opacity 0.15s;
}

.auth-form button:hover {
  opacity: 0.85;
}

.auth-alt {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.8rem;
  color: var(--muted);
}

.auth-alt a {
  color: var(--text);
}

.form-errors {
  background: rgba(180, 68, 68, 0.08);
  border: 1px solid rgba(180, 68, 68, 0.35);
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  list-style: none;
}

.form-errors li {
  font-size: 0.8rem;
  color: #b44;
  line-height: 1.5;
}`;
}

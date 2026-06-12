/** Shared form control styles — single source for public site inputs/buttons. */

export const siteInputCss = `  display: block;
  width: 100%;
  padding: 0.5rem 0.65rem;
  font-size: 0.9rem;
  font-family: var(--font);
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg);
  color: var(--text);
  transition: border-color 0.15s;`;

export const siteInputFocusCss = `  outline: none;
  border-color: var(--accent);`;

export const siteButtonCss = `  padding: 0.55rem 1rem;
  background: var(--text);
  color: var(--bg);
  border: none;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  cursor: pointer;
  transition: opacity 0.15s;`;

export const siteButtonHoverCss = `  opacity: 0.85;`;

export function siteInputRules(selector: string): string {
  return `${selector} {
${siteInputCss}
}

${selector}:focus {
${siteInputFocusCss}
}`;
}

export function siteButtonRules(selector: string): string {
  return `${selector} {
${siteButtonCss}
}

${selector}:hover {
${siteButtonHoverCss}
}`;
}

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

/**
 * Fills with `accent` rather than `text`, so a theme's accent actually reaches
 * its buttons — and so a plot's primary action reads like the platform's.
 */
export const siteButtonCss = `  padding: 0.55rem 1rem;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  border-radius: 4px;
  font-family: var(--brand-font);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s;`;

export const siteButtonHoverCss = `  filter: brightness(0.93);`;

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

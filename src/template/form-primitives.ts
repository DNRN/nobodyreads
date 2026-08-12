/** Shared form control styles — single source for public site inputs/buttons. */

export const siteInputCss = `  display: block;
  width: 100%;
  padding: 0.5rem 0.65rem;
  font-size: 0.9rem;
  font-family: var(--font-ui);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  transition: border-color 0.15s;`;

export const siteInputFocusCss = `  outline: none;
  border-color: var(--accent);`;

/**
 * Fills with `accent` rather than `text`, so a theme's accent actually reaches
 * its buttons — and so a plot's primary action reads like the platform's.
 */
export const siteButtonCss = `  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  padding: 0.7rem 1.25rem;
  background: var(--accent);
  color: var(--accent-text);
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-family: var(--font-ui);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition: filter 0.15s;`;

/**
 * The quieter half of a two-button row — "Read the manifesto" next to "Write
 * your first post". Outlined rather than a second fill, so the pair reads as
 * one primary action and one alternative.
 */
export const siteButtonGhostCss = `  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);`;

export const siteButtonGhostHoverCss = `  filter: none;
  border-color: var(--text);`;

export const siteButtonHoverCss = `  filter: brightness(0.93);
  text-decoration: none;`;

export const siteButtonDisabledCss = `  cursor: not-allowed;
  opacity: 0.5;
  filter: none;`;

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
}

${selector}--ghost {
${siteButtonGhostCss}
}

${selector}--ghost:hover {
${siteButtonGhostHoverCss}
}

${selector}:disabled,
${selector}:disabled:hover {
${siteButtonDisabledCss}
}`;
}

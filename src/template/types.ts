export interface TokenSet {
  bg: string;
  text: string;
  /** Secondary running copy — post excerpts, supporting paragraphs. */
  bodyText: string;
  muted: string;
  border: string;
  /** Interactive brand colour: button fills, focus rings, the wordmark dot. */
  accent: string;
  /** Foreground on an `accent` fill. */
  accentText: string;
  link: string;
  linkHover: string;
  /**
   * Wordmark overrides. Omit them and the wordmark follows `text` / `accent`,
   * which is what the default template does — duplicating the palette here is
   * how the brand colours drifted out of step in the first place.
   */
  brandInk?: string;
  brandAccent?: string;
  brandFont: string;
  logoWeight: string;
  logoTracking: string;
  font: string;
  fontMono: string;
  fontSize: string;
  lineHeight: string;
  maxWidth: string;
  containerPadding: string;
}

export interface HeaderSectionConfig {
  type: "header";
  enabled: boolean;
  showHero: boolean;
  showTagline: boolean;
  logoText: string;
  logoDotText: string;
}

export interface ContentSectionConfig {
  type: "content";
  enabled: boolean;
}

export interface FooterSectionConfig {
  type: "footer";
  enabled: boolean;
  showWordmark: boolean;
  /**
   * Wordmark text. Omit and the footer follows the header's `logoText` /
   * `logoDotText`, which is what a site almost always wants — the footer used
   * to hardcode "nobodyreads.me", so every self-hosted blog advertised a
   * platform it had nothing to do with.
   */
  logoText?: string;
  logoDotText?: string;
}

export type SectionConfig =
  | HeaderSectionConfig
  | ContentSectionConfig
  | FooterSectionConfig;

export interface ComponentConfig {
  variant?: string;
  tokens?: Record<string, string>;
}

export type ComponentMap = Record<string, ComponentConfig>;

/** @deprecated Legacy theme shape stored in older revisions. */
export interface LegacyComponentVariants {
  postPreview: "default" | "compact" | "card";
  nav: "inline" | "dropdown";
}

/** @deprecated Use ComponentMap instead. */
export type ComponentVariants = LegacyComponentVariants;

export interface CustomToken {
  key: string;
  label: string;
  defaultValue: string;
  type: "text" | "html" | "url" | "color";
}

export interface ThemeMeta {
  name: string;
  author: string;
  description: string;
  version: string;
}

export interface SiteTemplateDefinition {
  tokens: {
    light: TokenSet;
    dark: Partial<TokenSet>;
  };
  sections: SectionConfig[];
  components: ComponentMap;
  customCss?: string;
  customJs?: string;
  layoutHtml?: string;
  customTokens?: CustomToken[];
  themeMeta?: ThemeMeta;
}

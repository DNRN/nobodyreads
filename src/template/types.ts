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
  /**
   * Base of the corner-radius scale. `--radius-sm` and `--radius-lg` derive
   * from it (half and double), so one control moves every rounded surface.
   *
   * Optional: a theme stored before this existed simply omits it and the scale
   * falls back to the values it has always had.
   */
  radius?: string;
}

export interface HeaderSectionConfig {
  type: "header";
  enabled: boolean;
  showHero: boolean;
  showTagline: boolean;
  logoText: string;
  logoDotText: string;
  /** Navigation links in the header. Omitted means shown. */
  showNav?: boolean;
  /** Subscribe form in the header. Omitted means hidden. */
  showSubscribe?: boolean;
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

/**
 * Which supporting details a post listing shows.
 *
 * Modelled here rather than as component tokens because these are booleans, and
 * the component token types are CSS values — a toggle expressed as
 * `display: none` would render as a text box in the generic Components editor.
 *
 * Every flag omitted means shown, so a theme stored before this existed keeps
 * rendering exactly as it did.
 */
export interface PostMetaConfig {
  date?: boolean;
  excerpt?: boolean;
  readMore?: boolean;
  tags?: boolean;
}

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
  postMeta?: PostMetaConfig;
}

export interface TokenSet {
  bg: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  link: string;
  linkHover: string;
  brandInk: string;
  brandAccent: string;
  brandBg: string;
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
}

export type SectionConfig =
  | HeaderSectionConfig
  | ContentSectionConfig
  | FooterSectionConfig;

export interface ComponentVariants {
  postPreview: "default" | "compact" | "card";
  nav: "inline" | "dropdown";
}

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
  components: ComponentVariants;
  customCss?: string;
  customJs?: string;
  layoutHtml?: string;
  customTokens?: CustomToken[];
  themeMeta?: ThemeMeta;
}

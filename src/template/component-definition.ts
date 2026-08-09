export interface ComponentTokenDef {
  key: string;
  cssVar: string;
  label: string;
  type: "color" | "size" | "font" | "text";
  defaultValue: string;
}

export interface ComponentVariantDef {
  label: string;
  css: string;
}

export interface ComponentDefinition {
  name: string;
  label: string;
  variants: Record<string, ComponentVariantDef>;
  defaultVariant: string;
  tokens: ComponentTokenDef[];
  /**
   * Sample markup for the Design → Components gallery, using the same classes
   * this component styles.
   *
   * It lives beside the CSS on purpose: a specimen written anywhere else drifts
   * the first time a class is renamed, and then it silently stops demonstrating
   * the thing it names. Components with no meaningful specimen — global rules,
   * responsive rules, auth-page styling — simply omit it and are left out of
   * the gallery.
   */
  specimen?: string;
  css(variant: string): string;
}

export interface SerializableComponentDefinition {
  name: string;
  label: string;
  defaultVariant: string;
  variants: Array<{ id: string; label: string }>;
  tokens: ComponentTokenDef[];
  specimen?: string;
}

export interface DefineComponentOptions {
  name: string;
  label: string;
  defaultVariant: string;
  tokens: ComponentTokenDef[];
  variants: Record<string, ComponentVariantDef>;
  baseCss: string;
  specimen?: string;
}

export function defineComponent(options: DefineComponentOptions): ComponentDefinition {
  const { baseCss, variants, defaultVariant } = options;

  return {
    name: options.name,
    label: options.label,
    defaultVariant,
    tokens: options.tokens,
    variants,
    specimen: options.specimen,
    css(variant: string) {
      const resolved = variants[variant] ? variant : defaultVariant;
      const variantCss = variants[resolved]?.css ?? "";
      return variantCss ? `${baseCss}\n\n${variantCss}` : baseCss;
    },
  };
}

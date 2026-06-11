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
  css(variant: string): string;
}

export interface SerializableComponentDefinition {
  name: string;
  label: string;
  defaultVariant: string;
  variants: Array<{ id: string; label: string }>;
  tokens: ComponentTokenDef[];
}

export interface DefineComponentOptions {
  name: string;
  label: string;
  defaultVariant: string;
  tokens: ComponentTokenDef[];
  variants: Record<string, ComponentVariantDef>;
  baseCss: string;
}

export function defineComponent(options: DefineComponentOptions): ComponentDefinition {
  const { baseCss, variants, defaultVariant } = options;

  return {
    name: options.name,
    label: options.label,
    defaultVariant,
    tokens: options.tokens,
    variants,
    css(variant: string) {
      const resolved = variants[variant] ? variant : defaultVariant;
      const variantCss = variants[resolved]?.css ?? "";
      return variantCss ? `${baseCss}\n\n${variantCss}` : baseCss;
    },
  };
}

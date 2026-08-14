import type { ContentBlock } from "./types";
import {
  HeadingProperties,
  TextProperties,
  ImageProperties,
  ButtonProperties,
  DividerProperties,
  SpacerProperties,
  HtmlProperties,
  SocialProperties,
} from "./properties";

interface Props {
  block: ContentBlock;
  onChange: (props: Record<string, any>) => void;
}

export function BlockProperties({ block, onChange }: Props) {
  const commonProps = { props: block.props, onChange };

  switch (block.type) {
    case "heading":
      return <HeadingProperties {...commonProps} />;
    case "text":
      return <TextProperties {...commonProps} />;
    case "image":
      return <ImageProperties {...commonProps} />;
    case "button":
      return <ButtonProperties {...commonProps} />;
    case "divider":
      return <DividerProperties {...commonProps} />;
    case "spacer":
      return <SpacerProperties {...commonProps} />;
    case "html":
      return <HtmlProperties {...commonProps} />;
    case "social":
      return <SocialProperties {...commonProps} />;
    default:
      return <p className="text-xs text-gray-400">Sin propiedades</p>;
  }
}

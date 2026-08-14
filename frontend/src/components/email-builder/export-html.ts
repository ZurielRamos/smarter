import type { EmailRow, ContentBlock } from "./types";

function renderBlock(block: ContentBlock): string {
  switch (block.type) {
    case "heading": {
      const { text, level, align, color, fontFamily } = block.props;
      const tag = level || "h2";
      const fontSize = block.props.fontSize ? `${block.props.fontSize}px` : (tag === "h1" ? "28px" : tag === "h2" ? "22px" : "18px");
      const font = fontFamily || "Arial,sans-serif";
      // Convert variable spans back to {{variable}} syntax
      const processedText = text.replace(
        /<span[^>]*data-variable="([^"]+)"[^>]*>[^<]*<\/span>/gi,
        (_: string, variable: string) => variable
      );
      return `<${tag} style="margin:0;padding:10px 0;text-align:${align};color:${color};font-size:${fontSize};font-family:${font};">${processedText}</${tag}>`;
    }
    case "text": {
      const { text, align, color, fontSize, fontFamily } = block.props;
      const font = fontFamily || "Arial,sans-serif";
      // Convert variable spans back to {{variable}} syntax
      const processedText = text.replace(
        /<span[^>]*data-variable="([^"]+)"[^>]*>[^<]*<\/span>/gi,
        (_: string, variable: string) => variable
      );
      return `<div style="margin:0;padding:8px 0;text-align:${align};color:${color};font-size:${fontSize};font-family:${font};line-height:1.5;">${processedText}</div>`;
    }
    case "image": {
      const { src, alt, width, align, link } = block.props;
      if (!src) return "";
      const img = `<img src="${src}" alt="${alt}" style="max-width:${width};height:auto;display:block;${align === "center" ? "margin:0 auto;" : ""}" />`;
      if (link) return `<a href="${link}" target="_blank" style="text-decoration:none;">${img}</a>`;
      return img;
    }
    case "button": {
      const { text, url, align, bgColor, textColor, borderRadius } = block.props;
      const pt = block.props.paddingTop ?? 12;
      const pr = block.props.paddingRight ?? 24;
      const pb = block.props.paddingBottom ?? 12;
      const pl = block.props.paddingLeft ?? 24;
      const mt = block.props.marginTop ?? 0;
      const mr = block.props.marginRight ?? 0;
      const mb = block.props.marginBottom ?? 0;
      const ml = block.props.marginLeft ?? 0;
      const btnPadding = `${pt}px ${pr}px ${pb}px ${pl}px`;
      const margin = `${mt}px ${mr}px ${mb}px ${ml}px`;
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${align}" style="padding:${margin};"><a href="${url}" target="_blank" style="display:inline-block;padding:${btnPadding};background-color:${bgColor};color:${textColor};text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;border-radius:${borderRadius};">${text}</a></td></tr></table>`;
    }
    case "divider": {
      const { color, thickness, margin } = block.props;
      return `<hr style="border:none;border-top:${thickness} solid ${color};margin:${margin};" />`;
    }
    case "spacer": {
      const { height } = block.props;
      return `<div style="height:${height};"></div>`;
    }
    case "html": {
      return block.props.code || "";
    }
    case "social": {
      const icons: Array<{ network: string; url: string; label: string }> = block.props.icons || [];
      const iconSize = block.props.iconSize || 32;
      const gap = block.props.gap || 10;
      const align = block.props.align || "center";
      const iconStyle = block.props.iconStyle || "circle-color";
      const NETWORK_COLORS: Record<string, string> = {
        facebook: "#1877F2", x: "#000000", instagram: "#E4405F", youtube: "#FF0000",
        linkedin: "#0A66C2", tiktok: "#000000", whatsapp: "#25D366", telegram: "#26A5E4",
        pinterest: "#BD081C", spotify: "#1DB954", threads: "#000000", snapchat: "#FFFC00",
        discord: "#5865F2", twitch: "#9146FF", github: "#181717", dribbble: "#EA4C89",
        behance: "#1769FF", vimeo: "#1AB7EA", website: "#4A5568",
      };
      // Use CDN PNG icons (white icon on colored circle, or colored icon on transparent)
      // simpleicons.org CDN: https://cdn.simpleicons.org/{network}/{color}
      const getIconUrl = (network: string, fill: string) => {
        const cleanColor = fill.replace("#", "");
        return `https://cdn.simpleicons.org/${network === "x" ? "x" : network}/${cleanColor}`;
      };
      const getStyleConfig = (style: string) => {
        switch (style) {
          case "color": return { bg: "transparent", fill: "brand", shape: "none", border: false };
          case "black": return { bg: "transparent", fill: "#000000", shape: "none", border: false };
          case "gray": return { bg: "transparent", fill: "#9CA3AF", shape: "none", border: false };
          case "white-on-dark": return { bg: "#1F2937", fill: "#ffffff", shape: "rounded", border: false };
          case "circle-color": return { bg: "brand", fill: "#ffffff", shape: "circle", border: false };
          case "circle-color-border": return { bg: "transparent", fill: "brand", shape: "circle", border: true };
          case "rounded-color": return { bg: "brand", fill: "#ffffff", shape: "rounded", border: false };
          case "rounded-color-border": return { bg: "transparent", fill: "brand", shape: "rounded", border: true };
          case "square-color": return { bg: "brand", fill: "#ffffff", shape: "square", border: false };
          case "square-color-border": return { bg: "transparent", fill: "brand", shape: "square", border: true };
          case "circle-black": return { bg: "#000000", fill: "#ffffff", shape: "circle", border: false };
          case "circle-gray": return { bg: "#6B7280", fill: "#ffffff", shape: "circle", border: false };
          default: return { bg: "brand", fill: "#ffffff", shape: "circle", border: false };
        }
      };
      const config = getStyleConfig(iconStyle);
      const imgSize = config.shape === "none" ? iconSize : Math.round(iconSize * 0.6);
      const iconsHtml = icons.map((icon) => {
        const brandColor = NETWORK_COLORS[icon.network] || "#4A5568";
        const bg = config.bg === "brand" ? brandColor : config.bg === "transparent" ? "transparent" : config.bg;
        const fill = config.fill === "brand" ? brandColor : config.fill;
        const borderRadius = config.shape === "circle" ? "50%" : config.shape === "rounded" ? "20%" : config.shape === "square" ? "4px" : "0";
        const border = config.border ? `2px solid ${fill}` : "none";
        const iconUrl = getIconUrl(icon.network, fill.replace("#", ""));

        if (config.shape === "none") {
          return `<a href="${icon.url}" target="_blank" style="display:inline-block;text-decoration:none;margin:0 ${Math.round(gap / 2)}px;vertical-align:middle;"><img src="${iconUrl}" alt="${icon.label}" width="${iconSize}" height="${iconSize}" style="display:block;" /></a>`;
        }

        return `<a href="${icon.url}" target="_blank" style="display:inline-block;width:${iconSize}px;height:${iconSize}px;border-radius:${borderRadius};background-color:${bg};border:${border};text-align:center;line-height:${iconSize}px;text-decoration:none;margin:0 ${Math.round(gap / 2)}px;vertical-align:middle;"><img src="${iconUrl}" alt="${icon.label}" width="${imgSize}" height="${imgSize}" style="display:inline-block;vertical-align:middle;" /></a>`;
      }).join("");
      return `<div style="text-align:${align};padding:8px 0;">${iconsHtml}</div>`;
    }
    default:
      return "";
  }
}

function renderRow(row: EmailRow): string {
  const rs = row.style;
  const totalWidth = row.cells.reduce((sum, c) => sum + c.width, 0);
  const tds = row.cells.map((cell) => {
    const pct = Math.round((cell.width / totalWidth) * 100);
    const content = cell.blocks.map(renderBlock).join("\n") || "&nbsp;";
    return `<td style="width:${pct}%;vertical-align:top;padding:0 ${rs?.gap ? Math.round(rs.gap / 2) : 5}px;">\n${content}\n</td>`;
  }).join("\n");

  // Build row container styles
  const rowStyles: string[] = ["table-layout:fixed", "margin-bottom:0"];
  if (rs) {
    if (rs.marginTop) rowStyles.push(`margin-top:${rs.marginTop}px`);
    if (rs.marginBottom) rowStyles.push(`margin-bottom:${rs.marginBottom}px`);
    if (rs.marginLeft) rowStyles.push(`margin-left:${rs.marginLeft}px`);
    if (rs.marginRight) rowStyles.push(`margin-right:${rs.marginRight}px`);
    if (rs.backgroundColor && rs.backgroundColor !== "transparent") rowStyles.push(`background-color:${rs.backgroundColor}`);
    if (rs.backgroundImage) rowStyles.push(`background-image:url(${rs.backgroundImage})`, `background-size:${rs.backgroundSize || "cover"}`, `background-position:${rs.backgroundPosition || "center"}`, `background-repeat:${rs.backgroundRepeat || "no-repeat"}`);
    if (rs.borderWidth > 0) rowStyles.push(`border:${rs.borderWidth}px solid ${rs.borderColor || "#e0e0e0"}`);
    if (rs.borderRadius > 0) rowStyles.push(`border-radius:${rs.borderRadius}px`);
  }

  // Padding goes on an inner wrapper td
  const pt = rs?.paddingTop ?? 10;
  const pr = rs?.paddingRight ?? 10;
  const pb = rs?.paddingBottom ?? 10;
  const pl = rs?.paddingLeft ?? 10;

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${rowStyles.join(";")};">
<tr><td style="padding:${pt}px ${pr}px ${pb}px ${pl}px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
<tr>
${tds}
</tr>
</table>
</td></tr>
</table>`;
}

export interface CanvasStyleExport {
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  width?: number;
  backgroundColor?: string;
  backgroundImage?: string;
}

export function exportToHtml(rows: EmailRow[], canvasStyle?: CanvasStyleExport): string {
  const width = canvasStyle?.width || 600;
  const pt = canvasStyle?.paddingTop ?? 20;
  const pr = canvasStyle?.paddingRight ?? 30;
  const pb = canvasStyle?.paddingBottom ?? 20;
  const pl = canvasStyle?.paddingLeft ?? 30;
  const bgColor = canvasStyle?.backgroundColor || "#ffffff";
  const bgImage = canvasStyle?.backgroundImage ? `background-image:url(${canvasStyle.backgroundImage});background-size:cover;background-position:center;background-repeat:no-repeat;` : "";

  const body = rows
    .filter((row) => row.cells.some((cell) => cell.blocks.length > 0))
    .map(renderRow).join("\n");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;}table{border-collapse:collapse;}img{max-width:100%;height:auto;}</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:20px 0;">
<table width="${width}" cellpadding="0" cellspacing="0" border="0" style="background-color:${bgColor};border-radius:8px;overflow:hidden;${bgImage}">
<tr><td style="padding:${pt}px ${pr}px ${pb}px ${pl}px;">
${body}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

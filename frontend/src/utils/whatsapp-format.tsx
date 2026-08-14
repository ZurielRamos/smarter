/**
 * Formats WhatsApp text with markdown-like syntax into React elements.
 * Supports: *bold*, _italic_, ~strikethrough~, ```monospace```
 */
export function formatWhatsAppText(text: string): React.ReactNode[] {
  // Process inline formatting patterns
  // Order matters: process code blocks first, then bold, italic, strikethrough
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Regex for WhatsApp formatting (greedy, supports multiline with [\s\S])
  const patterns = [
    { regex: /```([\s\S]*?)```/g, wrap: (content: string) => <code key={key++} className="bg-gray-200/60 px-1 py-0.5 rounded text-[11px] font-mono">{content}</code> },
    { regex: /\*([^\s*](?:[^*]*[^\s*])?)\*/g, wrap: (content: string) => <strong key={key++}>{content}</strong> },
    { regex: /_((?:[^_\s]|[^_\s][^_]*[^_\s]))_/g, wrap: (content: string) => <em key={key++}>{content}</em> },
    { regex: /~((?:[^~\s]|[^~\s][^~]*[^~\s]))~/g, wrap: (content: string) => <del key={key++}>{content}</del> },
  ];

  // Apply all patterns sequentially using a single-pass approach
  const tokenize = (input: string): React.ReactNode[] => {
    // Build a combined regex
    const combined = /```([\s\S]*?)```|\*([^\s*](?:[^*]*[^\s*])?)\*|_((?:[^_\s]|[^_\s][^_]*[^_\s]))_|~((?:[^~\s]|[^~\s][^~]*[^~\s]))~/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = combined.exec(input)) !== null) {
      // Add text before this match
      if (match.index > lastIndex) {
        result.push(input.slice(lastIndex, match.index));
      }

      if (match[1] !== undefined) {
        // Code block ```...```
        result.push(<code key={key++} className="bg-gray-200/60 px-1 py-0.5 rounded text-[11px] font-mono">{match[1]}</code>);
      } else if (match[2] !== undefined) {
        // Bold *...*
        result.push(<strong key={key++}>{match[2]}</strong>);
      } else if (match[3] !== undefined) {
        // Italic _..._
        result.push(<em key={key++}>{match[3]}</em>);
      } else if (match[4] !== undefined) {
        // Strikethrough ~...~
        result.push(<del key={key++}>{match[4]}</del>);
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < input.length) {
      result.push(input.slice(lastIndex));
    }

    return result.length > 0 ? result : [input];
  };

  return tokenize(text);
}

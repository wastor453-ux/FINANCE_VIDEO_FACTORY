// Font files come from the @fontsource packages (bundled by Remotion, so a CI runner needs no system fonts).
// Families are looked up by the name in the style pack; a pack that names a family not listed here fails loudly.
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/playfair-display/latin-700.css";
import "@fontsource/space-grotesk/latin-600.css";

export const BUNDLED_FAMILIES: Record<string, number[]> = {
  "Plus Jakarta Sans": [500, 600, 700, 800],
  Inter: [400, 500, 600, 700],
  "Playfair Display": [700],
  "Space Grotesk": [600],
};

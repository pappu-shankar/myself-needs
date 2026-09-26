import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/app/globals.css";
import "./fonts.css";

// Mirrors src/app/layout.tsx's providers so components render exactly as they
// do in the app (tooltip delay/context, themed background). Font variables
// come from fonts.css, not next/font/google directly — see its comment.
const withProviders: Decorator = (Story) => (
  <div className="bg-background text-foreground p-6 antialiased">
    <TooltipProvider>
      <Story />
    </TooltipProvider>
  </div>
);

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withProviders,
    // next-themes uses the "dark" class on an ancestor element (see layout.tsx) —
    // matched here since Tailwind's dark: variant is defined as `&:is(.dark *)`.
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
  ],
};

export default preview;

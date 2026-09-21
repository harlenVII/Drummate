// NOTE: This file is NOT used by Tailwind v4. Its `content` array below is
// ignored because src/index.css has no `@config` directive pointing at it.
// Tailwind v4 configuration (including content scanning via `@source`) lives
// in src/index.css via `@theme` and `@source` directives. Editing this file
// will have no effect on the build.
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

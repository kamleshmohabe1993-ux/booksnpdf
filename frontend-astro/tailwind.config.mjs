/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // "Admit Card" palette — paper, official-stamp ink, marigold accent.
        paper: {
          DEFAULT: '#F5F0E4',
          soft: '#EDE6D4',
          card: '#FFFCF5',
        },
        ink: {
          DEFAULT: '#1C2B4A',
          soft: '#33456B',
          faint: '#5B6C8F',
        },
        marigold: {
          DEFAULT: '#E8871E',
          dark: '#C46E10',
          light: '#FBD9A8',
        },
        stamp: {
          green: '#2F6B4F',
          red: '#B23A2E',
        },
        nightpaper: {
          DEFAULT: '#12182B',
          soft: '#1B233D',
          card: '#1F2A47',
        },
        cream: '#EDE7D9',
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        body: ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        ticket: '0.5rem',
      },
      boxShadow: {
        ticket: '0 1px 0 0 rgba(28,43,74,0.08), 0 8px 24px -12px rgba(28,43,74,0.25)',
      },
      backgroundImage: {
        'perforation': 'radial-gradient(circle, transparent 3px, currentColor 3.5px)',
      },
    },
  },
  plugins: [],
};

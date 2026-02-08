import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        cloud: '#ECFEFF',
        ember: '#FB923C',
        mint: '#14B8A6',
      },
      boxShadow: {
        glow: '0 12px 40px rgba(20, 184, 166, 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;

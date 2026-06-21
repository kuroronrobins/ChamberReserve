/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chamber: {
          ink: '#172026',
          line: '#cfd8d5',
          panel: '#f4f7f4',
          surface: '#fbfcfa',
          access: '#dff3ed',
          run: '#e4ebf2',
          unload: '#fff0d4',
          reserved: '#1f7a78',
          inUse: '#7a4e9f',
          done: '#7f858a',
          blocked: '#b94736',
          impact: '#b7791f',
          steel: '#40525a',
        },
      },
      boxShadow: {
        focus: '0 0 0 3px rgba(47, 111, 115, 0.22)',
      },
    },
  },
  plugins: [],
};

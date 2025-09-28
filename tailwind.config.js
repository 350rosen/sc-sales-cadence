export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "sc-orange": "#F58529",
        "sc-lightgreen": "#98C93C",
        "sc-delft": "#29335C",
        "sc-offwhite": "#EDF6F9",
        "sc-black": "#231F20",
        "sc-white": "#FFFFFF",
        "sc-green": "#1F5B2C",
      },
      fontFamily: {
        heading: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

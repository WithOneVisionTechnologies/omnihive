const colors = require("tailwindcss/colors");

module.exports = {
    darkMode: false, // or 'media' or 'class'
    plugins: [],
    purge: ["./pages/**/*.js", "./components/**/*.js"],
    theme: {
        colors: {
            transparent: "transparent",
            current: "currentColor",
            gray: { ...colors.trueGray, 750: "#353535" },
            yellow: colors.yellow,
            white: "#FFFFFFEE",
        },
    },
    variants: {
        extend: {},
    },
};

module.exports = {
    purge: ["./app/**/*.{ts,tsx}"],
    darkMode: "media", // or 'media' or 'class'
    theme: {
        extend: {},
    },
    variants: {
        extend: {},
    },
    plugins: [require("@tailwindcss/forms")],
};

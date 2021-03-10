const path = require("path");

module.exports = {
    entry: {
        reactAdmin: "./app/index.tsx",
    },
    output: {
        path: path.resolve(__dirname, "app", "public", "scripts"),
        filename: "[name].js",
    },
    devtool: "eval-source-map",
    resolve: {
        extensions: [".js", ".ts", ".tsx", ".css"],
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                loader: "ts-loader",
                options: {},
            },
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader", "postcss-loader"],
            },
        ],
    },
    performance: {
        hints: false,
    },
};

const path = require('path');

module.exports = {
    mode: "development",
    devtool: "inline-source-map",
    entry: {
        main: "./src/main.ts",
    },
    output: {
        path: path.resolve(__dirname, '../extension/dist'),
        filename: "main.js"
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader"
            },
            {
                test: /\.wasm$/i,
                type: "asset/resource"
            }
        ]
    }
};
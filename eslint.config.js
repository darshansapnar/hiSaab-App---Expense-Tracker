const prettier = require("eslint-plugin-prettier");

module.exports = [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      prettier,
    },
    rules: {
      "prettier/prettier": "warn",
      "no-unused-vars": "off",
    },
  },
  {
    ignores: ["node_modules/", ".expo/", "dist/", "build/"],
  },
];

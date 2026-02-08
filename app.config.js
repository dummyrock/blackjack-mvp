const appJson = require("./app.json");

const isCloudflarePages = Boolean(
  process.env.CF_PAGES ||
    process.env.CF_PAGES_URL ||
    process.env.CF_PAGES_BRANCH
);

const baseUrl = isCloudflarePages ? "" : process.env.EXPO_BASE_URL || "";

module.exports = () => ({
  ...appJson.expo,
  experiments: {
    ...(appJson.expo.experiments || {}),
    baseUrl,
  },
});

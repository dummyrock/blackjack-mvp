const appJson = require("./app.json");

const isCloudflarePages = Boolean(
  process.env.CF_PAGES ||
    process.env.CF_PAGES_URL ||
    process.env.CF_PAGES_BRANCH
);

module.exports = () => ({
  ...appJson.expo,

  ...(isCloudflarePages
    ? {}
    : {
        experiments: {
          ...(appJson.expo.experiments || {}),
          baseUrl: process.env.EXPO_BASE_URL,
        },
      }),
});

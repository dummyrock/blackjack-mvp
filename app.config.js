const appJson = require("./app.json");

const baseUrl = process.env.EXPO_BASE_URL || "";

module.exports = () => ({
  ...appJson.expo,
  experiments: {
    ...(appJson.expo.experiments || {}),
    baseUrl,
  },
});

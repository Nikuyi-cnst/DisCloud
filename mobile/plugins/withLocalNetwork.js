const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withLocalNetwork(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android manifest is missing its application element.');
    application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};

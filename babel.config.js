module.exports = function (api) {
  api.cache(true);
  return {
    presets: [require.resolve('babel-preset-expo')],
    plugins: [
      [
        'react-native-iconify/babel',
        {
          icons: [
            'mdi:home',
            'mdi:home-outline',
            'mdi:briefcase',
            'mdi:briefcase-outline',
            'mdi:chevron-left',
          ],
        },
      ],
    ],
  };
};

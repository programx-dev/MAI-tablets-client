module.exports = {
  presets: [
    ['expo', {
      // Включаем полифил для import.meta
      unstable_transformImportMeta: true,
    }]
  ],
  plugins: [
    'react-native-reanimated/plugin', // ← ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ
  ],
};
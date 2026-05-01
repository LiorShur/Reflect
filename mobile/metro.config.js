// Custom Metro config for the Reflect mobile workspace.
//
// Why this exists: firebase 10.x ships React Native persistence
// (AsyncStorage-backed auth state) only via the "react-native" export
// condition in @firebase/auth's package.json. Expo SDK 53+ enables
// package.json `exports` resolution by default but doesn't include
// "react-native" in Metro's condition list, so
// `getReactNativePersistence` resolves to undefined and `initializeAuth`
// silently falls back to memory persistence with the runtime error
// "Component auth has not been registered yet".
//
// Adding "react-native" first in the condition list pins the correct
// bundle for firebase and any other library that ships an RN-specific
// build via export conditions. Other conditions follow Expo's defaults.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_conditionNames = [
  'react-native',
  'browser',
  'require',
  'import',
];

module.exports = config;

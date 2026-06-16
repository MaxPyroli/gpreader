// On vient lire dynamiquement ton fichier package.json
const packageJson = require('./package.json');

module.exports = {
  expo: {
    name: "GP Scanner",
    slug: "grandpaname-scanner",
    version: packageJson.version,
    updates: {
      url: "https://u.expo.dev/a5929ce5-7839-4ecf-b33a-415498803efd"
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: true
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png"
      },
      predictiveBackGestureEnabled: false,
      package: "com.grandpaname.scanner"
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#041b3b" // 👈 Remplace par le code couleur exact de ton fond bleu nuit
    },
    // 👇 LA LIAISON AVEC TON COMPTE EXPO EST LÀ 👇
    extra: {
      eas: {
        projectId: "a5929ce5-7839-4ecf-b33a-415498803efd"
      }
    }
  }
};
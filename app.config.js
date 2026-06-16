// On vient lire dynamiquement ton fichier package.json
const packageJson = require('./package.json');

module.exports = {
  expo: {
    name: "Grand Paname Scanner",
    slug: "grandpaname-scanner",
    version: packageJson.version,
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
    // 👇 LA LIAISON AVEC TON COMPTE EXPO EST LÀ 👇
    extra: {
      eas: {
        projectId: "a5929ce5-7839-4ecf-b33a-415498803efd"
      }
    }
  }
};
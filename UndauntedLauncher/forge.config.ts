import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

// Windows only. The Squirrel installer is what friends run; the ZIP is for people who prefer a
// portable copy. Releases are built by .github/workflows/launcher-release.yml.
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "Dauntless Revived Launcher",
    executableName: "DauntlessRevivedLauncher",
    appBundleId: "io.github.mixutin.dauntlessrevived",
    appCopyright: "Dauntless Revived contributors. Free software under the GNU AGPL-3.0.",
    icon: "assets/icon",
    // The two pinned DLLs the game needs, and the window icon. Nothing else ships outside the asar.
    extraResource: ["assets/dxgi.dll", "assets/UndauntedInternalServer.dll", "assets/icon.png"],
    win32metadata: {
      CompanyName: "Dauntless Revived",
      FileDescription: "Dauntless Revived Launcher",
      ProductName: "Dauntless Revived Launcher",
      InternalName: "DauntlessRevivedLauncher",
      OriginalFilename: "DauntlessRevivedLauncher.exe",
    },
  },
  rebuildConfig: {
    onlyModules: [],
  },
  makers: [
    new MakerSquirrel({
      name: "DauntlessRevivedLauncher",
      authors: "mixutin",
      description: "Dauntless Revived Launcher",
      setupExe: "DauntlessRevivedLauncher-Setup.exe",
      setupIcon: "assets/icon.ico",
      iconUrl: "https://raw.githubusercontent.com/mixutin/dauntless-revived/dauntless-revived/UndauntedLauncher/assets/icon.ico",
      noMsi: true,
    }),
    new MakerZIP({}, ["win32"]),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    // Switched off at package time: running the exe as plain Node, NODE_OPTIONS, the inspector
    // flags, and loading app code from anywhere but the (integrity-checked) asar.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;

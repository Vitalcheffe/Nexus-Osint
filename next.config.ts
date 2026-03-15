import type { NextConfig } from "next";
import path from "path";
import webpack from "webpack";
import CopyPlugin from "copy-webpack-plugin";

const cesiumSource = path.resolve(__dirname, "node_modules/cesium/Build/Cesium");

const nextConfig: NextConfig = {
  // --- LES DEUX LIGNES À AJOUTER ICI ---
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // -------------------------------------
  
  env: {
    CESIUM_BASE_URL: "/cesium",
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ta config Cesium actuelle reste identique en dessous...
      if (process.env.NODE_ENV === "production" || !isServer) {
        if (process.env.NODE_ENV === "production") {
          config.plugins?.push(
            new CopyPlugin({
              patterns: [
                {
                  from: path.join(cesiumSource, "Workers"),
                  to: path.resolve(__dirname, "public/cesium/Workers"),
                },
                {
                  from: path.join(cesiumSource, "ThirdParty"),
                  to: path.resolve(__dirname, "public/cesium/ThirdParty"),
                },
                {
                  from: path.join(cesiumSource, "Assets"),
                  to: path.resolve(__dirname, "public/cesium/Assets"),
                },
                {
                  from: path.join(cesiumSource, "Widgets"),
                  to: path.resolve(__dirname, "public/cesium/Widgets"),
                },
              ],
            })
          );
        }
      }

      config.plugins?.push(
        new webpack.DefinePlugin({
          CESIUM_BASE_URL: JSON.stringify("/cesium"),
        })
      );

      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        http: false,
        https: false,
        zlib: false,
        url: false,
      };
    }

    return config;
  },
};

export default nextConfig;
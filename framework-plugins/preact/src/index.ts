import type {
  AnalyzableComponent,
  FrameworkPluginFactory,
} from "@previewjs/core";
import path from "path";
import ts from "typescript";
import url from "url";
import { extractPreactComponents } from "./extract-component.js";
import { PREACT_SPECIAL_TYPES } from "./special-types.js";

const preactFrameworkPlugin: FrameworkPluginFactory = {
  isCompatible: async (dependencies) => {
    const version = await dependencies["preact"]?.readInstalledVersion();
    if (!version) {
      return false;
    }
    return parseInt(version) >= 10;
  },
  async create({ rootDirPath }) {
    const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
    const previewDirPath = path.resolve(__dirname, "..", "preview");
    return {
      pluginApiVersion: 3,
      name: "@previewjs/plugin-preact",
      defaultWrapperPath: "__previewjs__/Wrapper.tsx",
      previewDirPath,
      specialTypes: PREACT_SPECIAL_TYPES,
      tsCompilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "preact",
        jsxFactory: "h",
        jsxFragmentFactory: "Fragment",
      },
      detectComponents: async (reader, typeAnalyzer, absoluteFilePaths) => {
        const resolver = typeAnalyzer.analyze(absoluteFilePaths);
        const components: AnalyzableComponent[] = [];
        for (const absoluteFilePath of absoluteFilePaths) {
          components.push(
            ...extractPreactComponents(resolver, rootDirPath, absoluteFilePath)
          );
        }
        return components;
      },
      viteConfig: (configuredPlugins) => {
        return {
          resolve: {
            alias: {
              react: "preact/compat",
              "react-dom/test-utils": "preact/test-utils",
              "react-dom": "preact/compat",
              "react/jsx-runtime": "preact/jsx-runtime",
            },
          },
          esbuild: {
            jsx: "automatic",
            jsxImportSource: "preact",
            jsxFactory: "h",
            jsxFragment: "fragment",
          },
          plugins: [
            ...configuredPlugins.filter(
              (plugin) =>
                plugin.name !== "prefresh" && plugin.name !== "vite:preact-jsx"
            ),
            {
              name: "previewjs:optimize-deps",
              config: () => ({
                optimizeDeps: {
                  include: ["preact", "preact/jsx-runtime"],
                },
              }),
            },
          ],
        };
      },
    };
  },
};

export default preactFrameworkPlugin;

import type {
  AnalyzableComponent,
  FrameworkPluginFactory,
} from "@previewjs/core";
import { createFileSystemReader, createStackedReader } from "@previewjs/vfs";
import path from "path";
import url from "url";
import { extractVueComponents } from "./extract-component.js";
import { createVueTypeScriptReader } from "./vue-reader.js";

const vue3FrameworkPlugin: FrameworkPluginFactory = {
  isCompatible: async (dependencies) => {
    const version =
      (await dependencies["vue"]?.readInstalledVersion()) ||
      (await dependencies["nuxt"]?.readInstalledVersion()) ||
      (await dependencies["nuxt3"]?.readInstalledVersion());
    if (!version) {
      return false;
    }
    return parseInt(version) === 3;
  },
  async create({ rootDirPath }) {
    const { default: createVuePlugin } = await import("@vitejs/plugin-vue");
    const { default: vueJsxPlugin } = await import("@vitejs/plugin-vue-jsx");
    const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
    const previewDirPath = path.resolve(__dirname, "..", "preview");
    return {
      pluginApiVersion: 3,
      name: "@previewjs/plugin-vue3",
      defaultWrapperPath: "__previewjs__/Wrapper.vue",
      previewDirPath,
      transformReader: (reader) =>
        createStackedReader([
          createVueTypeScriptReader(reader),
          createFileSystemReader({
            mapping: {
              from: path.join(previewDirPath, "modules"),
              to: path.join(rootDirPath, "node_modules"),
            },
            watch: false,
          }),
        ]),
      detectComponents: async (reader, typeAnalyzer, absoluteFilePaths) => {
        const resolver = typeAnalyzer.analyze(
          absoluteFilePaths.map((p) => (p.endsWith(".vue") ? p + ".ts" : p))
        );
        const components: AnalyzableComponent[] = [];
        for (const absoluteFilePath of absoluteFilePaths) {
          components.push(
            ...extractVueComponents(
              reader,
              resolver,
              rootDirPath,
              absoluteFilePath
            )
          );
        }
        return components;
      },
      viteConfig: (configuredPlugins) => {
        return {
          plugins: [
            ...configuredPlugins,
            configuredPlugins.find((plugin) => plugin.name === "vite:vue")
              ? null
              : createVuePlugin(),
            configuredPlugins.find((plugin) => plugin.name.includes("jsx"))
              ? null
              : vueJsxPlugin(),
            {
              name: "previewjs:disable-vue-hmr",
              async transform(code, id) {
                if (!id.endsWith(".vue")) {
                  return null;
                }
                // HMR code prevents component loader from receiving
                // updated preview props, so we disable it.
                // If you find a better or more reliable way, please
                // feel free to send a PR :)
                const matchHmr = /import\.meta\.hot\.accept\((.|\n)*\}\);?/m;
                return code.replace(matchHmr, "");
              },
            },
            {
              name: "previewjs:optimize-deps",
              config: () => ({
                optimizeDeps: {
                  include: ["vue"],
                },
              }),
            },
          ],
          esbuild: {
            banner: `import { h } from 'vue';`,
            jsxFactory: "h",
          },
          resolve: {
            alias: {
              vue: "vue/dist/vue.esm-bundler.js",
            },
          },
        };
      },
    };
  },
};

export default vue3FrameworkPlugin;

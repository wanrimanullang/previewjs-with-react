import { PreviewConfig } from "@previewjs/config";
import { URLSearchParams } from "url";
import * as vite from "vite";

const COMPONENT_LOADER_MODULE = "/@component-loader.jsx";

export function vueComponentLoaderPlugin(options: {
  config: PreviewConfig;
}): vite.Plugin {
  return {
    name: "previewjs:component-loader",
    resolveId: async function (id) {
      if (id.startsWith(COMPONENT_LOADER_MODULE)) {
        return id;
      }
      return null;
    },
    load: async function (id) {
      if (!id.startsWith(COMPONENT_LOADER_MODULE)) {
        return null;
      }
      const params = new URLSearchParams(id.split("?")[1] || "");
      return generateComponentLoaderModule(params, options.config.wrapper);
    },
  };
}

function generateComponentLoaderModule(
  urlParams: URLSearchParams,
  wrapper?: {
    path: string;
    componentName?: string;
  }
): string {
  const relativeFilePath = urlParams.get("p");
  const componentName = urlParams.get("c");
  if (relativeFilePath === null || componentName === null) {
    throw new Error(`Invalid use of /render module`);
  }
  const componentModuleId = `/${relativeFilePath.replace(/\\/g, "/")}`;
  return `import { h } from 'vue';
import { sendMessageFromPreview } from '/__previewjs_internal__/messages';
import { updateComponent } from '/__previewjs_internal__/update-component';

export async function update() {
  let loadingError = null;
  ${
    wrapper
      ? `
  let wrapperModulePromise;
  if (import.meta.hot.data.preloadedWrapperModule) {
    wrapperModulePromise = Promise.resolve(import.meta.hot.data.preloadedWrapperModule);
  } else {
    wrapperModulePromise = import("/${wrapper.path}");
  }
  const Wrapper = await wrapperModulePromise.then(module => {
    return module["${wrapper.componentName || "default"}"];
  }).catch(e => {
    console.error(e);
    loadingError = e.stack || e.message || null;
  }) || null;
  `
      : `
  const Wrapper = null;
  `
  }
  let componentModulePromise;
  if (import.meta.hot.data.preloadedComponentModule) {
    componentModulePromise = Promise.resolve(import.meta.hot.data.preloadedComponentModule);
  } else {
    componentModulePromise = import("${componentModuleId}");
  }
  const { Component, decorators } = await componentModulePromise.then((module) => {
    let Component = ${
      relativeFilePath.endsWith(".vue")
        ? `module.default`
        : `module["__previewjs__${componentName}"]`
    };
    if (!Component) {
      throw new Error("No default component could be found in ${relativeFilePath}");
    }
    let decorators = [];
    if (typeof(Component) === 'function') {
      const maybeStory = Component;
      const maybeStoryComponent = maybeStory(maybeStory.args || {});
      if (maybeStoryComponent?.components || maybeStoryComponent?.template) {
        // This looks a lot like a Storybook story. It must be one.
        Component = maybeStoryComponent;
        decorators = maybeStory.decorators || [];
      }
    }
    return import.meta.hot.data.cached = {
      Component,
      decorators: [
        ...decorators,
        ...(module.default?.decorators || []),
      ],
    };
  }).catch(e => {
    console.error(e);
    loadingError = e.stack || e.message || null;
    return import.meta.hot.data.cached || {
      Component: () => h("p", "Oops! Something went wrong..."),
      decorators: [],
    };
  });
  const Decorated = decorators.reduce(
    (component, decorator) => {
      const decorated = decorator();
      return {
        ...decorated,
        components: { ...decorated.components, story: component }
      }
    },
    Component
  );
  const previews = typeof(Component.previews) === "function"
    ? Component.previews()
    : Component.previews || {};
  const variants = Object.entries(previews).map(
    ([key, props]) => {
      return {
        key,
        label: key,
        isEditorDriven: false,
        props,
      };
    });
  variants.push({
    key: "custom",
    label: "<${componentName} />",
    props: {},
    isEditorDriven: true,
  });
  return {
    componentInfo: {
      relativeFilePath: ${JSON.stringify(relativeFilePath)},
      componentName: ${JSON.stringify(componentName)},
      variants,
      Component: (props) => {
        return Wrapper ? h(Wrapper, null, () => h(Decorated, props)) : h(Decorated, props);
      },
    },
    loadingError
  };
}

import.meta.hot.accept();

function refresh() {
  updateComponent(update);
}

${
  wrapper
    ? `
import.meta.hot.accept(["${wrapper.path}"], ([wrapperModule]) => {
  import.meta.hot.data.preloadedWrapperModule = wrapperModule;
  refresh();
});
`
    : ``
}

import.meta.hot.accept(["${componentModuleId}"], ([componentModule]) => {
  import.meta.hot.data.preloadedComponentModule = componentModule;
  refresh();
});
`;
}

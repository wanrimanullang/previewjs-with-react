import type { GetPropsFn, RendererLoader } from "@previewjs/iframe";
import type { JSX } from "solid-js";
import h from "solid-js/h";
import * as Solid from "solid-js/web";

const container = document.getElementById("root")!;
let detachFn: () => void = () => {
  // This function will be replaced by the real one when the component is loaded.
};

export const load: RendererLoader = async ({
  wrapperModule,
  wrapperName,
  componentModule,
  componentId,
  shouldAbortRender,
}) => {
  const componentName = componentId.substring(componentId.indexOf(":") + 1);
  const isStoryModule = !!componentModule.default?.component;
  const Wrapper =
    (wrapperModule && wrapperModule[wrapperName || "Wrapper"]) ||
    (({ children }: { children: JSX.Element }) => <>{children}</>);
  const ComponentOrStory =
    componentModule[
      componentName === "default" ? "default" : `__previewjs__${componentName}`
    ];
  if (!ComponentOrStory) {
    throw new Error(`No component named '${componentName}'`);
  }
  const decorators = [
    ...(ComponentOrStory.decorators || []),
    ...(componentModule.default?.decorators || []),
  ];
  const RenderComponent = isStoryModule
    ? typeof ComponentOrStory === "function"
      ? ComponentOrStory
      : ComponentOrStory.render ||
        ComponentOrStory.component ||
        componentModule.default?.render ||
        componentModule.default?.component ||
        ComponentOrStory
    : ComponentOrStory;
  return {
    render: async (getProps: GetPropsFn) => {
      if (shouldAbortRender()) {
        return;
      }
      detachFn();
      container.innerHTML = "";
      const props = getProps({
        presetGlobalProps: componentModule.default?.args || {},
        presetProps: ComponentOrStory.args || {},
      });
      detachFn = Solid.render(
        () => (
          <Wrapper>
            {decorators.reduce(
              (component, decorator) => () => decorator(component),
              () => <RenderComponent {...props} />
            )()}
          </Wrapper>
        ),
        container
      );
      if (ComponentOrStory.play) {
        await ComponentOrStory.play({ canvasElement: container });
      }
    },
    jsxFactory: h,
  };
};

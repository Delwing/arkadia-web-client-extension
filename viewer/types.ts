/**
 * Props passed to a plugin-provided viewer component.
 * The plugin's module must default-export a React component accepting these props.
 */
export interface ViewerComponentProps {
  /** URL search params from the viewer page URL. */
  params: URLSearchParams;
}

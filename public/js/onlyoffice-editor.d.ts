/**
 * Types for the local wrapper around the official ONLYOFFICE browser API.
 * The official api.js is not bundled; it is loaded at runtime from Document Server.
 */

export interface OnlyOfficeEditorInstance {
  destroyEditor(): void;
}

export interface OnlyOfficeApi {
  DocEditor: new (
    containerId: string,
    config: Record<string, unknown>
  ) => OnlyOfficeEditorInstance;
}

export type OnlyOfficeApiLoader = (
  documentServerUrl: string,
  windowObject?: Window
) => Promise<OnlyOfficeApi>;

export interface OnlyOfficeEditorOptions {
  containerId: string;
  documentServerUrl: string;
  apiLoader?: OnlyOfficeApiLoader;
  windowObject?: Window;
}

export interface OnlyOfficeStateChangeDetail {
  dirty: boolean;
}

export interface OnlyOfficeErrorDetail {
  code: number;
  description: string;
}

export function loadOnlyOfficeApi(
  documentServerUrl: string,
  windowObject?: Window
): Promise<OnlyOfficeApi>;

export class OnlyOfficeEditor extends EventTarget {
  constructor(options: OnlyOfficeEditorOptions);

  readonly isOpen: boolean;

  open(config: Record<string, unknown>): Promise<void>;
  close(): void;

  addEventListener(
    type: "ready",
    listener: (this: OnlyOfficeEditor, event: CustomEvent<undefined>) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: "document-ready",
    listener: (this: OnlyOfficeEditor, event: CustomEvent<undefined>) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: "state-change",
    listener: (
      this: OnlyOfficeEditor,
      event: CustomEvent<OnlyOfficeStateChangeDetail>
    ) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: "error",
    listener: (
      this: OnlyOfficeEditor,
      event: CustomEvent<OnlyOfficeErrorDetail>
    ) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;

  removeEventListener(
    type: "ready" | "document-ready",
    listener: (this: OnlyOfficeEditor, event: CustomEvent<undefined>) => void,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: "state-change",
    listener: (
      this: OnlyOfficeEditor,
      event: CustomEvent<OnlyOfficeStateChangeDetail>
    ) => void,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: "error",
    listener: (
      this: OnlyOfficeEditor,
      event: CustomEvent<OnlyOfficeErrorDetail>
    ) => void,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void;
}

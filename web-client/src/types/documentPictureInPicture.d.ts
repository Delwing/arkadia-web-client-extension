interface DocumentPictureInPictureOptions {
    width?: number;
    height?: number;
}

declare interface DocumentPictureInPictureWindow extends Window {
    readonly document: Document;
    close(): void;
    addEventListener(type: "pagehide", listener: (this: DocumentPictureInPictureWindow, ev: PageTransitionEvent) => any): void;
    removeEventListener(
        type: "pagehide",
        listener: (this: DocumentPictureInPictureWindow, ev: PageTransitionEvent) => any
    ): void;
}

declare interface DocumentPictureInPicture {
    requestWindow(options?: DocumentPictureInPictureOptions): Promise<DocumentPictureInPictureWindow>;
}

declare interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
}

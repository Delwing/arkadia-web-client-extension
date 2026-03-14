interface FileSystemHandlePermissionDescriptor {
    mode?: "read" | "readwrite";
}

interface FileSystemHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface ShowDirectoryPickerOptions {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}

declare interface Window {
    showDirectoryPicker?(options?: ShowDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}

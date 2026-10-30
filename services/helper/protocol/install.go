package protocol

// Install registers the arkadia:// protocol handler with the OS.
// The execPath should be the absolute path to the helper binary.
func Install(execPath string) error {
	return installPlatform(execPath)
}

// Uninstall removes the arkadia:// protocol handler registration.
func Uninstall() error {
	return uninstallPlatform()
}

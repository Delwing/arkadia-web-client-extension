//go:build !windows

package hotkey

import "fmt"

// Stub implementations for non-Windows platforms.
// These will be replaced with platform-specific implementations later.

func InstallHook(cb hookCallback) error {
	return fmt.Errorf("keyboard hook not implemented on this platform")
}

func UninstallHook() {}

func RunMessagePump() {}

func SetCaptureCallback(cb captureCallback) {}

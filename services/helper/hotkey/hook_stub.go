//go:build !windows && !linux && !darwin

package hotkey

import "fmt"

// Stub implementations for unsupported platforms.

func InstallHook(cb hookCallback) error {
	return fmt.Errorf("keyboard hook not implemented on this platform")
}

func UninstallHook() {}

func RunMessagePump() {}

func SetCaptureCallback(cb captureCallback) {}

func PlatformGrab(mods Modifier, vk KeyCode) error { return nil }

func PlatformUngrab(mods Modifier, vk KeyCode) {}

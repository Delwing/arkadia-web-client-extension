//go:build !darwin

package main

// isInsideAppBundle is a no-op on non-macOS platforms.
// Only macOS uses .app bundles for protocol handler registration.
func isInsideAppBundle(_ string) bool {
	return false
}

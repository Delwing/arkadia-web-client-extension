//go:build !windows

package updater

import (
	"os"
	"syscall"
)

func restart() {
	exe, err := os.Executable()
	if err != nil {
		os.Exit(1)
	}

	// Replace current process with new binary
	syscall.Exec(exe, os.Args, os.Environ())
}

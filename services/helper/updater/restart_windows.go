//go:build windows

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

	// Start new process with the same args
	_, err = os.StartProcess(exe, os.Args, &os.ProcAttr{
		Files: []*os.File{os.Stdin, os.Stdout, os.Stderr},
		Sys:   &syscall.SysProcAttr{},
	})
	if err != nil {
		os.Exit(1)
	}

	// Exit current process
	os.Exit(0)
}

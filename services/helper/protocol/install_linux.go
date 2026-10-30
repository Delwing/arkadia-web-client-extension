//go:build linux

package protocol

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func installPlatform(execPath string) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("get home dir: %w", err)
	}

	appsDir := filepath.Join(homeDir, ".local", "share", "applications")
	if err := os.MkdirAll(appsDir, 0755); err != nil {
		return fmt.Errorf("create applications dir: %w", err)
	}

	desktopEntry := fmt.Sprintf(`[Desktop Entry]
Name=Arkadia Helper
Exec=%s %%u
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/arkadia;
`, execPath)

	desktopPath := filepath.Join(appsDir, "arkadia-helper.desktop")
	if err := os.WriteFile(desktopPath, []byte(desktopEntry), 0644); err != nil {
		return fmt.Errorf("write desktop file: %w", err)
	}

	cmd := exec.Command("xdg-mime", "default", "arkadia-helper.desktop", "x-scheme-handler/arkadia")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("xdg-mime default: %w", err)
	}

	return nil
}

func uninstallPlatform() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("get home dir: %w", err)
	}
	desktopPath := filepath.Join(homeDir, ".local", "share", "applications", "arkadia-helper.desktop")
	os.Remove(desktopPath)
	return nil
}

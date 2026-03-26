//go:build darwin

package protocol

import (
	"fmt"
	"os"
	"path/filepath"
)

func installPlatform(execPath string) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("get home dir: %w", err)
	}

	appDir := filepath.Join(homeDir, "Applications", "ArkadiaHelper.app", "Contents")
	macosDir := filepath.Join(appDir, "MacOS")
	if err := os.MkdirAll(macosDir, 0755); err != nil {
		return fmt.Errorf("create app bundle dir: %w", err)
	}

	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>ArkadiaHelper</string>
    <key>CFBundleIdentifier</key>
    <string>pl.rpg.arkadia.helper</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>arkadia-helper</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>Arkadia Helper Protocol</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>arkadia</string>
            </array>
        </dict>
    </array>
</dict>
</plist>`

	plistPath := filepath.Join(appDir, "Info.plist")
	if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
		return fmt.Errorf("write Info.plist: %w", err)
	}

	linkPath := filepath.Join(macosDir, "arkadia-helper")
	os.Remove(linkPath)
	if err := os.Symlink(execPath, linkPath); err != nil {
		return fmt.Errorf("symlink binary: %w", err)
	}

	return nil
}

func uninstallPlatform() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("get home dir: %w", err)
	}
	appDir := filepath.Join(homeDir, "Applications", "ArkadiaHelper.app")
	os.RemoveAll(appDir)
	return nil
}

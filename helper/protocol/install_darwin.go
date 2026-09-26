//go:build darwin

package protocol

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>ArkadiaHelper</string>
    <key>CFBundleDisplayName</key>
    <string>Arkadia Helper</string>
    <key>CFBundleIdentifier</key>
    <string>pl.rpg.arkadia.helper</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleExecutable</key>
    <string>arkadia-helper</string>
    <key>LSUIElement</key>
    <true/>
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

func bundlePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get home dir: %w", err)
	}
	return filepath.Join(homeDir, "Applications", "ArkadiaHelper.app"), nil
}

func installPlatform(execPath string) error {
	appPath, err := bundlePath()
	if err != nil {
		return err
	}
	contentsDir := filepath.Join(appPath, "Contents")
	macosDir := filepath.Join(contentsDir, "MacOS")
	if err := os.MkdirAll(macosDir, 0755); err != nil {
		return fmt.Errorf("create app bundle dir: %w", err)
	}

	plistPath := filepath.Join(contentsDir, "Info.plist")
	if err := os.WriteFile(plistPath, []byte(infoPlist), 0644); err != nil {
		return fmt.Errorf("write Info.plist: %w", err)
	}

	// The bundle gets its own copy of the binary rather than a symlink to
	// the download: LaunchServices refuses to launch a bundle whose
	// executable lives outside it (and in a quarantined folder at that),
	// and the copy keeps working after the download is moved or deleted.
	// When already running from the bundle there is nothing to copy.
	binPath := filepath.Join(macosDir, "arkadia-helper")
	if !sameFile(execPath, binPath) {
		if err := copyExecutable(execPath, binPath); err != nil {
			return fmt.Errorf("copy binary: %w", err)
		}
	}

	// Files written to ~/Applications are not picked up by LaunchServices
	// on their own, so arkadia:// would stay unhandled ("no application
	// set to open the URL") until the bundle was opened from Finder.
	if out, err := exec.Command(lsregister, "-f", "-R", appPath).CombinedOutput(); err != nil {
		return fmt.Errorf("lsregister: %w: %s", err, out)
	}

	return nil
}

func uninstallPlatform() error {
	appPath, err := bundlePath()
	if err != nil {
		return err
	}
	if out, err := exec.Command(lsregister, "-u", appPath).CombinedOutput(); err != nil {
		log.Printf("lsregister -u: %v: %s", err, out)
	}
	return os.RemoveAll(appPath)
}

func sameFile(a, b string) bool {
	ra, errA := filepath.EvalSymlinks(a)
	rb, errB := filepath.EvalSymlinks(b)
	return errA == nil && errB == nil && ra == rb
}

// copyExecutable writes src to dst through a temp file and a rename, so a
// running copy of dst keeps its inode and a half-written file is never
// launched. Extended attributes (quarantine) are not carried over.
func copyExecutable(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	tmp, err := os.CreateTemp(filepath.Dir(dst), ".arkadia-helper-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := io.Copy(tmp, in); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		return err
	}
	// Rename replaces whatever is there, including the symlink older
	// installs left behind.
	if err := os.Rename(tmpPath, dst); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

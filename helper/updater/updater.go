package updater

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	checkInterval = 5 * time.Minute
	baseURL       = "https://delwing.github.io/arkadia-web-client-extension/helper"
)

// Start begins periodic update checks in the background.
// currentVersion is the running binary's version (commit hash).
func Start(currentVersion string) {
	// Clean up old binary from previous update
	cleanupOld()

	go func() {
		// Check once shortly after startup
		time.Sleep(10 * time.Second)
		checkAndUpdate(currentVersion)

		ticker := time.NewTicker(checkInterval)
		defer ticker.Stop()
		for range ticker.C {
			checkAndUpdate(currentVersion)
		}
	}()
}

func checkAndUpdate(currentVersion string) {
	remoteVersion, err := fetchRemoteVersion()
	if err != nil {
		log.Printf("Update check failed: %v", err)
		return
	}

	if remoteVersion == currentVersion || remoteVersion == "" {
		return
	}

	log.Printf("Update available: %s -> %s", currentVersion, remoteVersion)

	if err := downloadAndReplace(); err != nil {
		log.Printf("Update failed: %v", err)
		return
	}

	log.Println("Update downloaded, restarting...")
	restart()
}

func fetchRemoteVersion() (string, error) {
	resp, err := http.Get(baseURL + "/version.txt")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("version check returned %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(data)), nil
}

func binaryName() string {
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	name := fmt.Sprintf("arkadia-helper-%s-%s", goos, goarch)
	if goos == "windows" {
		name += ".exe"
	}
	return name
}

func downloadAndReplace() error {
	url := baseURL + "/" + binaryName()

	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("download returned %d", resp.StatusCode)
	}

	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable path: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("eval symlinks: %w", err)
	}

	// Write new binary to a temp file in the same directory
	dir := filepath.Dir(execPath)
	tmpFile, err := os.CreateTemp(dir, "arkadia-helper-update-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write update: %w", err)
	}
	tmpFile.Close()

	// Make executable on unix
	if runtime.GOOS != "windows" {
		os.Chmod(tmpPath, 0755)
	}

	// On Windows: can't overwrite running exe, so rename current to .old
	oldPath := execPath + ".old"
	os.Remove(oldPath) // remove any previous .old

	if err := os.Rename(execPath, oldPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename current binary: %w", err)
	}

	if err := os.Rename(tmpPath, execPath); err != nil {
		// Try to restore
		os.Rename(oldPath, execPath)
		os.Remove(tmpPath)
		return fmt.Errorf("rename new binary: %w", err)
	}

	return nil
}

func cleanupOld() {
	execPath, err := os.Executable()
	if err != nil {
		return
	}
	execPath, _ = filepath.EvalSymlinks(execPath)
	oldPath := execPath + ".old"
	os.Remove(oldPath)
}

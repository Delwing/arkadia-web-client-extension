//go:build windows

package protocol

import (
	"fmt"

	"golang.org/x/sys/windows/registry"
)

func installPlatform(execPath string) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, `Software\Classes\arkadia`, registry.ALL_ACCESS)
	if err != nil {
		return fmt.Errorf("create registry key: %w", err)
	}
	defer key.Close()
	key.SetStringValue("", "URL:Arkadia Helper Protocol")
	key.SetStringValue("URL Protocol", "")

	cmdKey, _, err := registry.CreateKey(registry.CURRENT_USER, `Software\Classes\arkadia\shell\open\command`, registry.ALL_ACCESS)
	if err != nil {
		return fmt.Errorf("create command registry key: %w", err)
	}
	defer cmdKey.Close()

	command := fmt.Sprintf(`"%s" "%%1"`, execPath)
	cmdKey.SetStringValue("", command)
	return nil
}

func uninstallPlatform() error {
	registry.DeleteKey(registry.CURRENT_USER, `Software\Classes\arkadia\shell\open\command`)
	registry.DeleteKey(registry.CURRENT_USER, `Software\Classes\arkadia\shell\open`)
	registry.DeleteKey(registry.CURRENT_USER, `Software\Classes\arkadia\shell`)
	registry.DeleteKey(registry.CURRENT_USER, `Software\Classes\arkadia`)
	return nil
}

//go:build linux

package hotkey

import (
	"fmt"
	"log"
	"sync"

	"github.com/BurntSushi/xgb"
	"github.com/BurntSushi/xgb/xproto"
)

// X11 modifier masks
const (
	x11ModCtrl  = xproto.ModMaskControl
	x11ModAlt   = xproto.ModMask1
	x11ModShift = xproto.ModMaskShift
)

// X11 keysym to our VK code mapping
var keysymToVK = map[xproto.Keysym]KeyCode{
	0x0061: VKFromChar('a'), 0x0062: VKFromChar('b'), 0x0063: VKFromChar('c'),
	0x0064: VKFromChar('d'), 0x0065: VKFromChar('e'), 0x0066: VKFromChar('f'),
	0x0067: VKFromChar('g'), 0x0068: VKFromChar('h'), 0x0069: VKFromChar('i'),
	0x006a: VKFromChar('j'), 0x006b: VKFromChar('k'), 0x006c: VKFromChar('l'),
	0x006d: VKFromChar('m'), 0x006e: VKFromChar('n'), 0x006f: VKFromChar('o'),
	0x0070: VKFromChar('p'), 0x0071: VKFromChar('q'), 0x0072: VKFromChar('r'),
	0x0073: VKFromChar('s'), 0x0074: VKFromChar('t'), 0x0075: VKFromChar('u'),
	0x0076: VKFromChar('v'), 0x0077: VKFromChar('w'), 0x0078: VKFromChar('x'),
	0x0079: VKFromChar('y'), 0x007a: VKFromChar('z'),
	0x0030: VKFromChar('0'), 0x0031: VKFromChar('1'), 0x0032: VKFromChar('2'),
	0x0033: VKFromChar('3'), 0x0034: VKFromChar('4'), 0x0035: VKFromChar('5'),
	0x0036: VKFromChar('6'), 0x0037: VKFromChar('7'), 0x0038: VKFromChar('8'),
	0x0039: VKFromChar('9'),
	0xffbe: VKFunctionKey(1), 0xffbf: VKFunctionKey(2), 0xffc0: VKFunctionKey(3),
	0xffc1: VKFunctionKey(4), 0xffc2: VKFunctionKey(5), 0xffc3: VKFunctionKey(6),
	0xffc4: VKFunctionKey(7), 0xffc5: VKFunctionKey(8), 0xffc6: VKFunctionKey(9),
	0xffc7: VKFunctionKey(10), 0xffc8: VKFunctionKey(11), 0xffc9: VKFunctionKey(12),
	0xff09: VK_TAB, 0xff0d: VK_RETURN, 0xff1b: VK_ESCAPE,
	0x0020: VK_SPACE, 0xffff: VK_DELETE, 0xff08: VK_BACK,
	0xff51: VK_LEFT, 0xff52: VK_UP, 0xff53: VK_RIGHT, 0xff54: VK_DOWN,
}

// Reverse: VK code to X11 keysym
var vkToKeysym map[KeyCode]xproto.Keysym

func init() {
	vkToKeysym = make(map[KeyCode]xproto.Keysym)
	for ks, vk := range keysymToVK {
		vkToKeysym[vk] = ks
	}
}

type x11GrabbedKey struct {
	keycode xproto.Keycode
	modMask uint16
}

var (
	x11Conn        *xgb.Conn
	x11Root        xproto.Window
	x11Mu          sync.Mutex
	x11Cb          hookCallback
	x11GrabbedKeys []x11GrabbedKey
	x11Running     bool
	x11CaptureMu   sync.Mutex
	x11CaptureCb   captureCallback

	// For capture mode: we grab all keys temporarily
	x11CaptureGrabs []x11GrabbedKey

	// keysym lookup cache
	x11KeysymMap map[xproto.Keycode]xproto.Keysym
)

func x11Connect() error {
	conn, err := xgb.NewConn()
	if err != nil {
		return fmt.Errorf("X11 connection failed: %w", err)
	}
	x11Conn = conn

	setup := xproto.Setup(conn)
	x11Root = setup.DefaultScreen(conn).Root

	// Build keycode -> keysym map
	const minKeycode = 8
	const maxKeycode = 255
	mapping, err := xproto.GetKeyboardMapping(conn, minKeycode, maxKeycode-minKeycode+1).Reply()
	if err != nil {
		conn.Close()
		return fmt.Errorf("get keyboard mapping: %w", err)
	}

	x11KeysymMap = make(map[xproto.Keycode]xproto.Keysym)
	keysymsPerKeycode := int(mapping.KeysymsPerKeycode)
	for i := 0; i < int(maxKeycode-minKeycode+1); i++ {
		keycode := xproto.Keycode(i + minKeycode)
		if keysymsPerKeycode > 0 {
			ks := mapping.Keysyms[i*keysymsPerKeycode]
			if ks != 0 {
				x11KeysymMap[keycode] = ks
			}
		}
	}

	return nil
}

func x11KeycodeForKeysym(ks xproto.Keysym) xproto.Keycode {
	for kc, s := range x11KeysymMap {
		if s == ks {
			return kc
		}
	}
	return 0
}

func modsToX11(mods Modifier) uint16 {
	var x11Mods uint16
	if mods&ModCtrl != 0 {
		x11Mods |= x11ModCtrl
	}
	if mods&ModAlt != 0 {
		x11Mods |= x11ModAlt
	}
	if mods&ModShift != 0 {
		x11Mods |= x11ModShift
	}
	return x11Mods
}

func x11ModsToMods(state uint16) Modifier {
	var m Modifier
	if state&x11ModCtrl != 0 {
		m |= ModCtrl
	}
	if state&x11ModAlt != 0 {
		m |= ModAlt
	}
	if state&x11ModShift != 0 {
		m |= ModShift
	}
	return m
}

func x11GrabKey(keycode xproto.Keycode, modMask uint16) {
	// Grab with and without NumLock (Mod2) and CapsLock (Lock)
	numLock := uint16(xproto.ModMask2)
	capsLock := uint16(xproto.ModMaskLock)
	for _, extra := range []uint16{0, numLock, capsLock, numLock | capsLock} {
		xproto.GrabKey(x11Conn, true, x11Root, modMask|extra, keycode,
			xproto.GrabModeAsync, xproto.GrabModeAsync)
	}
}

func x11UngrabKey(keycode xproto.Keycode, modMask uint16) {
	numLock := uint16(xproto.ModMask2)
	capsLock := uint16(xproto.ModMaskLock)
	for _, extra := range []uint16{0, numLock, capsLock, numLock | capsLock} {
		xproto.UngrabKey(x11Conn, keycode, x11Root, modMask|extra)
	}
}

func InstallHook(cb hookCallback) error {
	x11Mu.Lock()
	defer x11Mu.Unlock()

	if x11Running {
		return fmt.Errorf("hook already installed")
	}

	if err := x11Connect(); err != nil {
		return err
	}

	x11Cb = cb
	x11Running = true
	return nil
}

func UninstallHook() {
	x11Mu.Lock()
	defer x11Mu.Unlock()

	if !x11Running {
		return
	}

	// Ungrab all keys
	for _, g := range x11GrabbedKeys {
		x11UngrabKey(g.keycode, g.modMask)
	}
	x11GrabbedKeys = nil

	x11Running = false
	if x11Conn != nil {
		x11Conn.Close()
		x11Conn = nil
	}
}

// GrabKeyCombo grabs a specific key combo on X11.
func GrabKeyCombo(mods Modifier, vk KeyCode) error {
	ks, ok := vkToKeysym[vk]
	if !ok {
		return fmt.Errorf("no X11 keysym for VK 0x%02X", vk)
	}
	keycode := x11KeycodeForKeysym(ks)
	if keycode == 0 {
		return fmt.Errorf("no keycode for keysym 0x%04X", ks)
	}

	modMask := modsToX11(mods)
	x11GrabKey(keycode, modMask)

	x11Mu.Lock()
	x11GrabbedKeys = append(x11GrabbedKeys, x11GrabbedKey{keycode: keycode, modMask: modMask})
	x11Mu.Unlock()

	return nil
}

// UngrabKeyCombo ungrabs a specific key combo.
func UngrabKeyCombo(mods Modifier, vk KeyCode) {
	ks, ok := vkToKeysym[vk]
	if !ok {
		return
	}
	keycode := x11KeycodeForKeysym(ks)
	if keycode == 0 {
		return
	}
	modMask := modsToX11(mods)
	x11UngrabKey(keycode, modMask)

	x11Mu.Lock()
	for i, g := range x11GrabbedKeys {
		if g.keycode == keycode && g.modMask == modMask {
			x11GrabbedKeys = append(x11GrabbedKeys[:i], x11GrabbedKeys[i+1:]...)
			break
		}
	}
	x11Mu.Unlock()
}

// PlatformGrab grabs a specific key combo on X11.
func PlatformGrab(mods Modifier, vk KeyCode) error {
	return GrabKeyCombo(mods, vk)
}

// PlatformUngrab ungrabs a specific key combo on X11.
func PlatformUngrab(mods Modifier, vk KeyCode) {
	UngrabKeyCombo(mods, vk)
}

func SetCaptureCallback(cb captureCallback) {
	x11CaptureMu.Lock()
	defer x11CaptureMu.Unlock()

	// Ungrab previous capture grabs if any
	for _, g := range x11CaptureGrabs {
		x11UngrabKey(g.keycode, g.modMask)
	}
	x11CaptureGrabs = nil

	x11CaptureCb = cb
	if cb == nil {
		return
	}

	// Grab all known keys with all modifier combos for capture
	allMods := []uint16{0, x11ModCtrl, x11ModAlt, x11ModShift,
		x11ModCtrl | x11ModAlt, x11ModCtrl | x11ModShift,
		x11ModAlt | x11ModShift, x11ModCtrl | x11ModAlt | x11ModShift}

	for _, ks := range vkToKeysym {
		kc := x11KeycodeForKeysym(ks)
		if kc == 0 {
			continue
		}
		for _, mod := range allMods {
			x11GrabKey(kc, mod)
			x11CaptureGrabs = append(x11CaptureGrabs, x11GrabbedKey{keycode: kc, modMask: mod})
		}
	}
}

// RunMessagePump reads X11 events. Blocks until UninstallHook is called.
func RunMessagePump() {
	for {
		x11Mu.Lock()
		conn := x11Conn
		running := x11Running
		x11Mu.Unlock()

		if !running || conn == nil {
			return
		}

		ev, err := conn.WaitForEvent()
		if err != nil {
			log.Printf("X11 event error: %v", err)
			continue
		}
		if ev == nil {
			return // connection closed
		}

		switch e := ev.(type) {
		case xproto.KeyPressEvent:
			handleX11KeyPress(e)
		}
	}
}

func handleX11KeyPress(e xproto.KeyPressEvent) {
	ks, ok := x11KeysymMap[e.Detail]
	if !ok {
		return
	}
	vk, ok := keysymToVK[ks]
	if !ok {
		return
	}
	mods := x11ModsToMods(e.State)
	event := KeyEvent{VK: vk, Mods: mods}

	// Check capture mode first
	x11CaptureMu.Lock()
	capCb := x11CaptureCb
	if capCb != nil {
		// Escape cancels capture
		if vk == VK_ESCAPE {
			x11CaptureCb = nil
			// Ungrab capture keys
			for _, g := range x11CaptureGrabs {
				x11UngrabKey(g.keycode, g.modMask)
			}
			x11CaptureGrabs = nil
			x11CaptureMu.Unlock()
			go capCb(KeyEvent{}) // empty = cancelled
			return
		}

		x11CaptureCb = nil
		for _, g := range x11CaptureGrabs {
			x11UngrabKey(g.keycode, g.modMask)
		}
		x11CaptureGrabs = nil
		x11CaptureMu.Unlock()
		go capCb(event)
		return
	}
	x11CaptureMu.Unlock()

	// Normal hotkey handling
	x11Mu.Lock()
	cb := x11Cb
	x11Mu.Unlock()

	if cb != nil {
		cb(event) // X11 XGrabKey already suppresses the key
	}
}

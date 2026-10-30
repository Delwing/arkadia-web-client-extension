//go:build windows

package tray

import (
	"runtime"
	"syscall"
	"unsafe"
)

var (
	shell32              = syscall.NewLazyDLL("shell32.dll")
	user32               = syscall.NewLazyDLL("user32.dll")
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	pShellNotifyIcon     = shell32.NewProc("Shell_NotifyIconW")
	pCreateWindowEx      = user32.NewProc("CreateWindowExW")
	pDefWindowProc       = user32.NewProc("DefWindowProcW")
	pRegisterClassEx     = user32.NewProc("RegisterClassExW")
	pGetMessage          = user32.NewProc("GetMessageW")
	pTranslateMessage    = user32.NewProc("TranslateMessage")
	pDispatchMessage     = user32.NewProc("DispatchMessageW")
	pPostQuitMessage     = user32.NewProc("PostQuitMessage")
	pCreatePopupMenu     = user32.NewProc("CreatePopupMenu")
	pAppendMenu          = user32.NewProc("AppendMenuW")
	pTrackPopupMenu      = user32.NewProc("TrackPopupMenu")
	pDestroyMenu         = user32.NewProc("DestroyMenu")
	pSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	pGetCursorPos        = user32.NewProc("GetCursorPos")
	pCreateIconFromResource = user32.NewProc("CreateIconFromResource")
	pGetConsoleWindow    = kernel32.NewProc("GetConsoleWindow")
	pShowWindow          = user32.NewProc("ShowWindow")
	pFreeConsole         = kernel32.NewProc("FreeConsole")
)

const (
	WM_APP          = 0x8000
	WM_TRAYICON     = WM_APP + 1
	WM_COMMAND      = 0x0111
	WM_RBUTTONUP    = 0x0205
	NIM_ADD         = 0x00000000
	NIM_DELETE      = 0x00000002
	NIF_MESSAGE     = 0x00000001
	NIF_ICON        = 0x00000002
	NIF_TIP         = 0x00000004
	MF_STRING       = 0x00000000
	MF_GRAYED       = 0x00000001
	MF_SEPARATOR    = 0x00000800
	TPM_RIGHTALIGN  = 0x0008
	TPM_BOTTOMALIGN = 0x0020
	SW_HIDE         = 0
	IDM_UNREGISTER  = 1001
	IDM_QUIT        = 1002
)

type NOTIFYICONDATA struct {
	CbSize           uint32
	HWnd             uintptr
	UID              uint32
	UFlags           uint32
	UCallbackMessage uint32
	HIcon            uintptr
	SzTip            [128]uint16
}

type WNDCLASSEX struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  uintptr
	LpszClassName uintptr
	HIconSm      uintptr
}

type POINT struct {
	X, Y int32
}

type MSG struct {
	HWnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      POINT
}

var (
	trayHwnd  uintptr
	trayCb    Callbacks
	trayTitle string
	nid       NOTIFYICONDATA
)

func run(title string, cb Callbacks, ready func()) {
	runtime.LockOSThread()
	trayCb = cb
	trayTitle = title

	// Hide and detach the startup console window
	if hwnd, _, _ := pGetConsoleWindow.Call(); hwnd != 0 {
		pShowWindow.Call(hwnd, SW_HIDE)
		pFreeConsole.Call()
	}

	className := syscall.StringToUTF16Ptr("ArkadiaHelperTray")

	wc := WNDCLASSEX{
		LpfnWndProc:   syscall.NewCallback(trayWndProc),
		LpszClassName: uintptr(unsafe.Pointer(className)),
	}
	wc.CbSize = uint32(unsafe.Sizeof(wc))
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))

	trayHwnd, _, _ = pCreateWindowEx.Call(
		0, uintptr(unsafe.Pointer(className)), 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0,
	)

	hIcon := createIconFromICO(IconData)

	nid = NOTIFYICONDATA{
		HWnd:             trayHwnd,
		UID:              1,
		UFlags:           NIF_MESSAGE | NIF_ICON | NIF_TIP,
		UCallbackMessage: WM_TRAYICON,
		HIcon:            hIcon,
	}
	nid.CbSize = uint32(unsafe.Sizeof(nid))
	copy(nid.SzTip[:], syscall.StringToUTF16(title))

	pShellNotifyIcon.Call(NIM_ADD, uintptr(unsafe.Pointer(&nid)))

	go ready()

	var msg MSG
	for {
		ret, _, _ := pGetMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if ret == 0 || ret == uintptr(^uintptr(0)) {
			break
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		pDispatchMessage.Call(uintptr(unsafe.Pointer(&msg)))
	}

	pShellNotifyIcon.Call(NIM_DELETE, uintptr(unsafe.Pointer(&nid)))
}

func trayWndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	switch msg {
	case WM_TRAYICON:
		if lParam == WM_RBUTTONUP {
			showContextMenu(hwnd)
		}
		return 0
	case WM_COMMAND:
		switch wParam {
		case IDM_UNREGISTER:
			if trayCb.OnUnregister != nil {
				trayCb.OnUnregister()
			}
		case IDM_QUIT:
			if trayCb.OnQuit != nil {
				trayCb.OnQuit()
			}
			pPostQuitMessage.Call(0)
		}
		return 0
	}
	ret, _, _ := pDefWindowProc.Call(hwnd, msg, wParam, lParam)
	return ret
}

func showContextMenu(hwnd uintptr) {
	menu, _, _ := pCreatePopupMenu.Call()

	pAppendMenu.Call(menu, MF_STRING|MF_GRAYED, 0, uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr(trayTitle))))
	pAppendMenu.Call(menu, MF_SEPARATOR, 0, 0)
	pAppendMenu.Call(menu, MF_STRING, IDM_UNREGISTER, uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("Unregister arkadia://"))))
	pAppendMenu.Call(menu, MF_STRING, IDM_QUIT, uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("Quit"))))

	var pt POINT
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	pSetForegroundWindow.Call(hwnd)
	pTrackPopupMenu.Call(menu, TPM_RIGHTALIGN|TPM_BOTTOMALIGN, uintptr(pt.X), uintptr(pt.Y), 0, hwnd, 0)
	pDestroyMenu.Call(menu)
}

func createIconFromICO(data []byte) uintptr {
	if len(data) < 22 {
		return 0
	}
	imgSize := uint32(data[14]) | uint32(data[15])<<8 | uint32(data[16])<<16 | uint32(data[17])<<24
	imgOffset := uint32(data[18]) | uint32(data[19])<<8 | uint32(data[20])<<16 | uint32(data[21])<<24

	if uint32(len(data)) < imgOffset+imgSize {
		return 0
	}

	imgData := data[imgOffset : imgOffset+imgSize]
	hIcon, _, _ := pCreateIconFromResource.Call(
		uintptr(unsafe.Pointer(&imgData[0])),
		uintptr(imgSize),
		1,
		0x00030000,
	)
	return hIcon
}

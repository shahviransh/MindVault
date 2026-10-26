//! Swallows the shortcuts that open an AI assistant, only while a session is running.
//! Win+L, Ctrl+Shift+Esc, Alt+Tab, and Command+Space are left alone. The hook
//! goes away when the session ends or MindVault exits.

use std::sync::atomic::{AtomicBool, Ordering};

static ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn set_active(active: bool) {
    if !crate::policy::locks_this_computer() {
        return;
    }
    if active {
        if ACTIVE.swap(true, Ordering::SeqCst) {
            return;
        }
        let _ = std::thread::Builder::new().name("mindvault-keys".into()).spawn(platform::run);
    } else {
        ACTIVE.store(false, Ordering::SeqCst);
        platform::stop();
    }
}

fn still_active() -> bool {
    ACTIVE.load(Ordering::SeqCst)
}

/// Win+C and the Copilot key (Win+F23). Ctrl or Alt keeps the key, so Win+Ctrl+C still toggles color filters.
pub(crate) fn swallow_ai_shortcut(win: bool, ctrl: bool, alt: bool, vk: u32) -> bool {
    win && !ctrl && !alt && (vk == 0x43 || vk == 0x86)
}

#[cfg(windows)]
mod platform {
    use super::{still_active, ACTIVE};
    use std::sync::atomic::{AtomicU32, Ordering};
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use std::sync::atomic::AtomicBool;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, RegisterHotKey, UnregisterHotKey, MOD_NOREPEAT, MOD_SHIFT, MOD_WIN, VK_C, VK_CONTROL,
        VK_F23, VK_LCONTROL, VK_LMENU, VK_LWIN, VK_MENU, VK_RCONTROL, VK_RMENU, VK_RWIN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
        HC_ACTION, KBDLLHOOKSTRUCT, MSG, PM_NOREMOVE, WH_KEYBOARD_LL, WM_QUIT,
    };

    static THREAD: AtomicU32 = AtomicU32::new(0);
    static LEFT_WIN: AtomicBool = AtomicBool::new(false);
    static RIGHT_WIN: AtomicBool = AtomicBool::new(false);
    static CTRL: AtomicBool = AtomicBool::new(false);
    static ALT: AtomicBool = AtomicBool::new(false);
    const LLKHF_UP: u32 = 0x80;

    pub fn stop() {
        let id = THREAD.load(Ordering::SeqCst);
        if id != 0 {
            unsafe {
                PostThreadMessageW(id, WM_QUIT, 0, 0);
            }
        }
    }

    pub fn run() {
        unsafe {
            let id = GetCurrentThreadId();
            THREAD.store(id, Ordering::SeqCst);
            if !still_active() {
                THREAD.store(0, Ordering::SeqCst);
                return;
            }
            // The thread needs a message queue before the hook is installed, or Windows drops the hook.
            let mut message = std::mem::zeroed::<MSG>();
            PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(proc), std::ptr::null_mut(), 0);
            if hook.is_null() || !still_active() {
                if !hook.is_null() {
                    UnhookWindowsHookEx(hook);
                }
                THREAD.store(0, Ordering::SeqCst);
                ACTIVE.store(false, Ordering::SeqCst);
                return;
            }
            // Claim the shortcut so Explorer cannot keep it. Failure is fine; the hook still eats the key.
            let _ = RegisterHotKey(std::ptr::null_mut(), 1, MOD_WIN | MOD_NOREPEAT, VK_C as u32);
            let _ = RegisterHotKey(
                std::ptr::null_mut(),
                2,
                MOD_WIN | MOD_SHIFT | MOD_NOREPEAT,
                VK_F23 as u32,
            );
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {}
            UnregisterHotKey(std::ptr::null_mut(), 1);
            UnregisterHotKey(std::ptr::null_mut(), 2);
            UnhookWindowsHookEx(hook);
            LEFT_WIN.store(false, Ordering::SeqCst);
            RIGHT_WIN.store(false, Ordering::SeqCst);
            CTRL.store(false, Ordering::SeqCst);
            ALT.store(false, Ordering::SeqCst);
            THREAD.store(0, Ordering::SeqCst);
        }
    }

    fn note(vk: u32, up: bool) {
        let slot = if vk == VK_LWIN as u32 {
            Some(&LEFT_WIN)
        } else if vk == VK_RWIN as u32 {
            Some(&RIGHT_WIN)
        } else if vk == VK_CONTROL as u32 || vk == VK_LCONTROL as u32 || vk == VK_RCONTROL as u32 {
            Some(&CTRL)
        } else if vk == VK_MENU as u32 || vk == VK_LMENU as u32 || vk == VK_RMENU as u32 {
            Some(&ALT)
        } else {
            None
        };
        if let Some(slot) = slot {
            slot.store(!up, Ordering::SeqCst);
        }
    }

    fn held(key: u16) -> bool {
        unsafe { GetAsyncKeyState(key as i32) < 0 }
    }

    unsafe extern "system" fn proc(
        code: i32,
        wparam: windows_sys::Win32::Foundation::WPARAM,
        lparam: windows_sys::Win32::Foundation::LPARAM,
    ) -> windows_sys::Win32::Foundation::LRESULT {
        if code == HC_ACTION as i32 {
            let info = &*(lparam as *const KBDLLHOOKSTRUCT);
            let up = info.flags & LLKHF_UP != 0;
            note(info.vkCode, up);
            // The hook's own record is what counts. Asking Windows if the Windows key is down often says no.
            let win = LEFT_WIN.load(Ordering::SeqCst)
                || RIGHT_WIN.load(Ordering::SeqCst)
                || held(VK_LWIN)
                || held(VK_RWIN);
            if super::swallow_ai_shortcut(win, CTRL.load(Ordering::SeqCst), ALT.load(Ordering::SeqCst), info.vkCode) {
                return 1;
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::still_active;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicPtr, Ordering};

    static RUNLOOP: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            events: u64,
            callback: unsafe extern "C" fn(*mut c_void, u32, *mut c_void, *mut c_void) -> *mut c_void,
            user: *mut c_void,
        ) -> *mut c_void;
        fn CGEventTapEnable(tap: *mut c_void, enable: bool);
        fn CGEventGetFlags(event: *mut c_void) -> u64;
        fn CGEventGetIntegerValueField(event: *mut c_void, field: u32) -> i64;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFMachPortCreateRunLoopSource(allocator: *mut c_void, port: *mut c_void, order: i64) -> *mut c_void;
        fn CFRunLoopGetCurrent() -> *mut c_void;
        fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
        fn CFRunLoopRun();
        fn CFRunLoopStop(rl: *mut c_void);
        static kCFRunLoopCommonModes: *const c_void;
    }

    pub fn stop() {
        let loop_ = RUNLOOP.load(Ordering::SeqCst);
        if !loop_.is_null() {
            unsafe { CFRunLoopStop(loop_) };
        }
    }

    pub fn run() {
        unsafe {
            // Key down and key up. Accessibility permission is required; without it the tap is null.
            let mask = (1u64 << 10) | (1u64 << 11);
            let tap = CGEventTapCreate(1, 0, 0, mask, callback, std::ptr::null_mut());
            if tap.is_null() || !still_active() {
                return;
            }
            let source = CFMachPortCreateRunLoopSource(std::ptr::null_mut(), tap, 0);
            let loop_ = CFRunLoopGetCurrent();
            RUNLOOP.store(loop_, Ordering::SeqCst);
            CFRunLoopAddSource(loop_, source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
            if still_active() {
                CFRunLoopRun();
            }
            RUNLOOP.store(std::ptr::null_mut(), Ordering::SeqCst);
        }
    }

    /// Option+Space is the usual quick-chat shortcut. Command+Space (Spotlight) is kept.
    unsafe extern "C" fn callback(
        _proxy: *mut c_void,
        kind: u32,
        event: *mut c_void,
        _user: *mut c_void,
    ) -> *mut c_void {
        if kind == 10 || kind == 11 {
            let flags = CGEventGetFlags(event);
            let key = CGEventGetIntegerValueField(event, 9);
            let option = flags & 0x0008_0000 != 0;
            let command = flags & 0x0010_0000 != 0;
            let control = flags & 0x0004_0000 != 0;
            if option && !command && !control && key == 49 {
                return std::ptr::null_mut();
            }
        }
        event
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::still_active;
    use std::ffi::{c_int, c_uchar, c_ulong, c_void};
    use std::sync::atomic::{AtomicPtr, Ordering};

    static DISPLAY: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    pub fn stop() {
        // The grab loop wakes itself. Nothing else has to be posted.
    }

    pub fn run() {
        unsafe {
            let lib = libc::dlopen(c"libX11.so.6".as_ptr(), libc::RTLD_LAZY);
            if lib.is_null() {
                return;
            }
            let open_display: Option<unsafe extern "C" fn(*const i8) -> *mut c_void> =
                std::mem::transmute(libc::dlsym(lib, c"XOpenDisplay".as_ptr()));
            let close_display: Option<unsafe extern "C" fn(*mut c_void) -> c_int> =
                std::mem::transmute(libc::dlsym(lib, c"XCloseDisplay".as_ptr()));
            let keycode: Option<unsafe extern "C" fn(*mut c_void, c_ulong) -> c_uchar> =
                std::mem::transmute(libc::dlsym(lib, c"XKeysymToKeycode".as_ptr()));
            let grab: Option<unsafe extern "C" fn(*mut c_void, c_int, u32, c_ulong, c_int, c_int, c_int) -> c_int> =
                std::mem::transmute(libc::dlsym(lib, c"XGrabKey".as_ptr()));
            let ungrab: Option<unsafe extern "C" fn(*mut c_void, c_int, u32, c_ulong) -> c_int> =
                std::mem::transmute(libc::dlsym(lib, c"XUngrabKey".as_ptr()));
            let root: Option<unsafe extern "C" fn(*mut c_void) -> c_ulong> =
                std::mem::transmute(libc::dlsym(lib, c"XDefaultRootWindow".as_ptr()));
            let pending: Option<unsafe extern "C" fn(*mut c_void) -> c_int> =
                std::mem::transmute(libc::dlsym(lib, c"XPending".as_ptr()));
            let next: Option<unsafe extern "C" fn(*mut c_void, *mut [u8; 256]) -> c_int> =
                std::mem::transmute(libc::dlsym(lib, c"XNextEvent".as_ptr()));
            let sync: Option<unsafe extern "C" fn(*mut c_void, c_int) -> c_int> =
                std::mem::transmute(libc::dlsym(lib, c"XSync".as_ptr()));
            let Some(open_display) = open_display else {
                libc::dlclose(lib);
                return;
            };
            let display = open_display(std::ptr::null());
            if display.is_null()
                || !still_active()
                || grab.is_none()
                || keycode.is_none()
                || root.is_none()
                || pending.is_none()
                || next.is_none()
            {
                if !display.is_null() {
                    if let Some(close_display) = close_display {
                        close_display(display);
                    }
                }
                libc::dlclose(lib);
                return;
            }
            DISPLAY.store(display, Ordering::SeqCst);
            let root = root.unwrap()(display);
            let code = keycode.unwrap()(display, 0x0063) as c_int;
            // Super is usually Mod4. Grab the NumLock and CapsLock variants too.
            let mod4 = 1u32 << 6;
            let variants = [0u32, 2, 16, 18];
            for extra in variants {
                grab.unwrap()(display, code, mod4 | extra, root, 1, 1, 1);
            }
            if let Some(sync) = sync {
                sync(display, 0);
            }
            let mut event = [0u8; 256];
            while still_active() {
                while pending.unwrap()(display) > 0 {
                    next.unwrap()(display, &mut event);
                }
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
            if let Some(ungrab) = ungrab {
                ungrab(display, code, mod4, root);
            }
            DISPLAY.store(std::ptr::null_mut(), Ordering::SeqCst);
            if let Some(close_display) = close_display {
                close_display(display);
            }
            libc::dlclose(lib);
        }
    }
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
mod platform {
    pub fn run() {}
    pub fn stop() {}
}

#[cfg(test)]
mod tests {
    use super::swallow_ai_shortcut;

    #[test]
    fn win_c_and_the_copilot_key_are_swallowed() {
        assert!(swallow_ai_shortcut(true, false, false, 0x43));
        assert!(swallow_ai_shortcut(true, false, false, 0x86));
        assert!(!swallow_ai_shortcut(true, true, false, 0x43));
        assert!(!swallow_ai_shortcut(true, false, true, 0x43));
        assert!(!swallow_ai_shortcut(false, false, false, 0x43));
        assert!(!swallow_ai_shortcut(true, false, false, b'L' as u32));
    }
}

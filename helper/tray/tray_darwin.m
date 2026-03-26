#import <Cocoa/Cocoa.h>

extern void trayOnQuit();
extern void trayOnUnregister();

static NSStatusItem *statusItem = nil;

@interface TrayDelegate : NSObject
- (void)quit:(id)sender;
- (void)unregister:(id)sender;
@end

@implementation TrayDelegate
- (void)quit:(id)sender {
    trayOnQuit();
    [NSApp terminate:nil];
}
- (void)unregister:(id)sender {
    trayOnUnregister();
}
@end

static TrayDelegate *delegate = nil;

void setupTray(const char* title, const void* iconData, int iconLen) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];

        delegate = [[TrayDelegate alloc] init];

        statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];

        // Set icon from data
        if (iconData && iconLen > 0) {
            NSData *data = [NSData dataWithBytes:iconData length:iconLen];
            NSImage *image = [[NSImage alloc] initWithData:data];
            [image setSize:NSMakeSize(18, 18)];
            [image setTemplate:YES];
            statusItem.button.image = image;
        }

        statusItem.button.toolTip = [NSString stringWithUTF8String:title];

        // Build menu
        NSMenu *menu = [[NSMenu alloc] init];

        // Version label (disabled)
        NSMenuItem *versionItem = [[NSMenuItem alloc]
            initWithTitle:[NSString stringWithUTF8String:title]
            action:nil
            keyEquivalent:@""];
        [versionItem setEnabled:NO];
        [menu addItem:versionItem];

        [menu addItem:[NSMenuItem separatorItem]];

        NSMenuItem *unregItem = [[NSMenuItem alloc]
            initWithTitle:@"Unregister arkadia://"
            action:@selector(unregister:)
            keyEquivalent:@""];
        [unregItem setTarget:delegate];
        [menu addItem:unregItem];

        NSMenuItem *quitItem = [[NSMenuItem alloc]
            initWithTitle:@"Quit"
            action:@selector(quit:)
            keyEquivalent:@"q"];
        [quitItem setTarget:delegate];
        [menu addItem:quitItem];

        statusItem.menu = menu;
    }
}

void runApp() {
    @autoreleasepool {
        [NSApp run];
    }
}

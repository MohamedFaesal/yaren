#import <Foundation/Foundation.h>
#import <ImageCaptureCore/ImageCaptureCore.h>

@interface ScannerBridge : NSObject <ICDeviceBrowserDelegate, ICScannerDeviceDelegate>
@property (nonatomic, copy) NSString *mode;
@property (nonatomic, copy) NSString *deviceId;
@property (nonatomic, copy) NSString *outputPath;
@property (nonatomic, strong) ICDeviceBrowser *browser;
@property (nonatomic, strong) NSMutableArray<ICScannerDevice *> *scanners;
@property (nonatomic, assign) BOOL startedScan;
@property (nonatomic, assign) BOOL finished;
- (void)start;
@end

@implementation ScannerBridge

- (instancetype)initWithMode:(NSString *)mode deviceId:(NSString *)deviceId output:(NSString *)outputPath {
    self = [super init];
    if (!self) return nil;
    _mode = mode ?: @"list";
    _deviceId = deviceId ?: @"";
    _outputPath = outputPath ?: @"";
    _browser = [ICDeviceBrowser new];
    _scanners = [NSMutableArray array];
    return self;
}

- (void)start {
    self.browser.delegate = self;
    self.browser.browsedDeviceTypeMask = ICDeviceTypeMaskScanner
        | ICDeviceLocationTypeMaskLocal
        | ICDeviceLocationTypeMaskBonjour
        | ICDeviceLocationTypeMaskShared
        | ICDeviceLocationTypeMaskBluetooth;
    [self.browser start];
    NSTimeInterval listWait = [self.mode isEqualToString:@"list"] ? 8 : 12;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(listWait * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (self.finished) return;
        if ([self.mode isEqualToString:@"list"]) [self finishList];
        else if (!self.startedScan) [self fail:@"No scanner is plugged in or connected over Wi-Fi."];
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(90 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (!self.finished) [self fail:@"The scanner did not finish."];
    });
}

- (BOOL)isScanner:(ICDevice *)device {
    if (![device isKindOfClass:[ICScannerDevice class]]) return NO;
    NSUInteger kind = device.type;
    if ((kind & ICDeviceTypeMaskCamera) != 0) return NO;
    if ((kind & ICDeviceTypeMaskScanner) == 0) return NO;
    NSUInteger place = ICDeviceLocationTypeMaskLocal | ICDeviceLocationTypeMaskBonjour | ICDeviceLocationTypeMaskShared | ICDeviceLocationTypeMaskBluetooth;
    if ((kind & place) == 0) return NO;
    NSString *lower = device.name.lowercaseString ?: @"";
    for (NSString *word in @[@"camera", @"facetime", @"isight", @"continuity", @"iphone", @"ipad", @"webcam"]) {
        if ([lower containsString:word]) return NO;
    }
    return YES;
}

- (void)deviceBrowser:(ICDeviceBrowser *)browser didAddDevice:(ICDevice *)device moreComing:(BOOL)moreComing {
    if (![self isScanner:device]) return;
    [self.scanners addObject:(ICScannerDevice *)device];
    if ([self.mode isEqualToString:@"scan"] && !moreComing) [self beginScan];
}

- (void)deviceBrowser:(ICDeviceBrowser *)browser didRemoveDevice:(ICDevice *)device moreGoing:(BOOL)moreGoing {
    [self.scanners removeObject:(ICScannerDevice *)device];
}

- (void)deviceBrowserDidEnumerateLocalDevices:(ICDeviceBrowser *)browser {
    if (self.scanners.count == 0) return;
    if ([self.mode isEqualToString:@"list"]) [self finishList];
    else [self beginScan];
}

- (void)device:(ICDevice *)device didOpenSessionWithError:(NSError *)error {
    if (error) {
        [self fail:error.localizedDescription];
        return;
    }
    ICScannerDevice *scanner = (ICScannerDevice *)device;
    BOOL hasFlatbed = [scanner.availableFunctionalUnitTypes containsObject:@(ICScannerFunctionalUnitTypeFlatbed)];
    BOOL hasFeeder = [scanner.availableFunctionalUnitTypes containsObject:@(ICScannerFunctionalUnitTypeDocumentFeeder)];
    if (hasFlatbed) [scanner requestSelectFunctionalUnit:ICScannerFunctionalUnitTypeFlatbed];
    else if (hasFeeder) [scanner requestSelectFunctionalUnit:ICScannerFunctionalUnitTypeDocumentFeeder];
    else [self startTransfer:scanner];
}

- (void)device:(ICDevice *)device didCloseSessionWithError:(NSError *)error {
}

- (void)didRemoveDevice:(ICDevice *)device {
}

- (void)scannerDevice:(ICScannerDevice *)scanner didSelectFunctionalUnit:(ICScannerFunctionalUnit *)functionalUnit error:(NSError *)error {
    if (error) {
        [self fail:error.localizedDescription];
        return;
    }
    [self startTransfer:scanner];
}

- (void)scannerDevice:(ICScannerDevice *)scanner didScanToURL:(NSURL *)url {
    NSURL *destination = [NSURL fileURLWithPath:self.outputPath];
    NSError *error = nil;
    if ([[NSFileManager defaultManager] fileExistsAtPath:destination.path]) {
        [[NSFileManager defaultManager] removeItemAtURL:destination error:nil];
    }
    if (![url.path isEqualToString:destination.path]) {
        [[NSFileManager defaultManager] copyItemAtURL:url toURL:destination error:&error];
    }
    if (error) [self fail:error.localizedDescription];
}

- (void)scannerDevice:(ICScannerDevice *)scanner didCompleteScanWithError:(NSError *)error {
    if (error) {
        [self fail:error.localizedDescription];
        return;
    }
    if (![[NSFileManager defaultManager] fileExistsAtPath:self.outputPath]) {
        [self fail:@"The scanner did not return a page."];
        return;
    }
    [self finish:0];
}

- (void)startTransfer:(ICScannerDevice *)scanner {
    NSURL *output = [NSURL fileURLWithPath:self.outputPath];
    scanner.transferMode = ICScannerTransferModeFileBased;
    scanner.downloadsDirectory = [output URLByDeletingLastPathComponent];
    scanner.documentName = [[output URLByDeletingPathExtension] lastPathComponent];
    scanner.documentUTI = @"public.jpeg";
    ICScannerFunctionalUnit *unit = scanner.selectedFunctionalUnit;
    NSUInteger resolution = 200;
    if (![unit.supportedResolutions containsIndex:resolution]) {
        resolution = [unit.preferredResolutions firstIndex];
        if (resolution == NSNotFound) resolution = [unit.supportedResolutions firstIndex];
    }
    if (resolution != NSNotFound) unit.resolution = resolution;
    [scanner requestScan];
}

- (void)beginScan {
    if (self.startedScan) return;
    ICScannerDevice *scanner = nil;
    for (ICScannerDevice *candidate in self.scanners) {
        if ([[self identity:candidate] isEqualToString:self.deviceId]) {
            scanner = candidate;
            break;
        }
    }
    if (!scanner && self.deviceId.length == 0) {
        if ([self.browser.preferredDevice isKindOfClass:[ICScannerDevice class]]) scanner = (ICScannerDevice *)self.browser.preferredDevice;
        else scanner = self.scanners.firstObject;
    }
    if (!scanner) {
        if (self.deviceId.length > 0 && self.scanners.count == 0) return;
        [self fail:self.scanners.count == 0 ? @"No scanner is plugged in or connected over Wi-Fi." : @"The selected scanner is not connected."];
        return;
    }
    self.startedScan = YES;
    scanner.delegate = self;
    [scanner requestOpenSession];
}

- (void)finishList {
    if (self.finished) return;
    NSMutableArray *devices = [NSMutableArray array];
    for (ICScannerDevice *scanner in self.scanners) {
        [devices addObject:@{ @"id": [self identity:scanner], @"name": scanner.name ?: @"Scanner" }];
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:devices options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"[]";
    printf("%s\n", json.UTF8String);
    [self finish:0];
}

- (NSString *)identity:(ICScannerDevice *)scanner {
    if (scanner.persistentIDString.length > 0) return scanner.persistentIDString;
    return scanner.name ?: @"scanner";
}

- (void)fail:(NSString *)message {
    if (self.finished) return;
    fprintf(stderr, "%s\n", message.UTF8String);
    [self finish:1];
}

- (void)finish:(int)code {
    if (self.finished) return;
    self.finished = YES;
    [self.browser stop];
    exit(code);
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSString *mode = argc > 1 ? [NSString stringWithUTF8String:argv[1]] : @"list";
        NSString *deviceId = argc > 2 ? [NSString stringWithUTF8String:argv[2]] : @"";
        NSString *output = argc > 3 ? [NSString stringWithUTF8String:argv[3]] : @"";
        if ([mode isEqualToString:@"scan"] && output.length == 0) {
            fprintf(stderr, "A scan destination is required.\n");
            return 1;
        }
        ScannerBridge *bridge = [[ScannerBridge alloc] initWithMode:mode deviceId:deviceId output:output];
        [bridge start];
        CFRunLoopRun();
    }
    return 0;
}

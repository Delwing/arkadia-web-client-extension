export {
    areOutputTimestampsVisible,
    setOutputTimestampVisibility,
    toggleOutputTimestampVisibility,
    areOutputMessageTypesVisible,
    setOutputMessageTypeVisibility,
    toggleOutputMessageTypeVisibility,
    setupOutputMessageHandler,
    createTimestampElement,
    createMessageTypeElement,
} from './outputMessageHandler';
export type {OutputMessageHandler} from './outputMessageHandler';
export {isLikelyTouchDevice, isMobileLikeViewport, isTouchPointerType} from './pointerEnvironment';
export {isAndroid, isIOS, isMobileOs} from './mobileOs';
export {hasHardwareKeyboard, subscribeHardwareKeyboard, resetHardwareKeyboardDetection} from './hardwareKeyboard';

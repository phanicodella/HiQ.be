// utils/browserCompatibility.js

/**
 * Checks browser compatibility for audio/video features
 * @returns {Object} Compatibility status and details
 */
export const checkBrowserCompatibility = () => {
  // Check for required APIs
  const hasRequiredAPIs = !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.AudioContext
  );

  // Get browser info
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isChromium = /chrome|chromium|crios/i.test(userAgent);
  const isFirefox = /firefox/i.test(userAgent);
  const isSafari = /safari/i.test(userAgent) && !/chrome|chromium|crios/i.test(userAgent);
  const isEdgeChromium = isChromium && /edg/i.test(userAgent);
  const isLegacyEdge = /edge/i.test(userAgent) && !isEdgeChromium;

  // Check for minimum versions (can be adjusted as needed)
  const browserVersion = userAgent.match(/(?:chrome|firefox|safari|edge|opr)\/?\s*(\d+)/i);
  const version = browserVersion ? parseInt(browserVersion[1], 10) : 0;

  const isSupported = hasRequiredAPIs && (
    (isChromium && version >= 60) ||
    (isFirefox && version >= 52) ||
    (isSafari && version >= 11) ||
    (isEdgeChromium) // Modern Edge is always supported as it's Chromium-based
  );

  return {
    isSupported,
    hasMediaDevices: !!navigator.mediaDevices,
    hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
    hasAudioContext: !!window.AudioContext,
    browser: {
      isChrome: isChromium && !isEdgeChromium,
      isFirefox,
      isSafari,
      isEdge: isEdgeChromium || isLegacyEdge,
      isLegacyEdge,
      version
    },
    message: !isSupported
      ? `Your browser may not fully support all required features. For the best experience, please use:
         • Google Chrome (version 60 or later)
         • Microsoft Edge (Chromium-based)
         • Firefox (version 52 or later)
         • Safari (version 11 or later)`
      : null
  };
};

/**
 * Initializes media devices with proper error handling
 * @returns {Promise} Stream and compatibility status
 */
export const initializeMediaDevices = async () => {
  const compatibility = checkBrowserCompatibility();
  
  if (!compatibility.isSupported) {
    throw new Error(compatibility.message);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      }
    });

    return {
      stream,
      compatibility
    };
  } catch (error) {
    let message = 'Failed to access microphone.';
    if (error.name === 'NotAllowedError') {
      message = 'Microphone access was denied. Please enable microphone access and try again.';
    } else if (error.name === 'NotFoundError') {
      message = 'No microphone was found. Please ensure a microphone is connected and try again.';
    }
    throw new Error(message);
  }
};
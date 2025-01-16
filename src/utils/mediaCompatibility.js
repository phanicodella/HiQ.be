// src/utils/mediaCompatibility.js
export const checkBrowserCompatibility = () => {
  const isIE = /*@cc_on!@*/false || !!document.documentMode;
  const isEdge = !isIE && !!window.StyleMedia;
  
  if (isIE) {
    return {
      compatible: false,
      message: "Internet Explorer is not supported. Please use Chrome, Firefox, or Edge."
    };
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      compatible: false,
      message: "Your browser doesn't support media devices. Please update your browser."
    };
  }

  return {
    compatible: true,
    message: ""
  };
};

export const getMediaStream = async () => {
  const compatibility = checkBrowserCompatibility();
  if (!compatibility.compatible) {
    throw new Error(compatibility.message);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 15 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      }
    });
    return stream;
  } catch (error) {
    throw new Error("Failed to access camera/microphone. Please check your permissions.");
  }
};

// Update PublicInterviewRoom.js to use this utility
useEffect(() => {
  const initMedia = async () => {
    try {
      const stream = await getMediaStream();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      setError(error.message);
    }
  };

  initMedia();
}, []);

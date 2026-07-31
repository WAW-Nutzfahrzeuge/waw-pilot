"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toDateOnlyString } from "@/lib/format/date";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type DocumentScannerDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onScanComplete: (file: File) => void;
};

type JscanifyConstructor = new () => JscanifyScanner;

type JscanifyScanner = {
    findPaperContour: (image: unknown) => CvContour | null;
    highlightPaper: (
        image: HTMLCanvasElement,
        options?: { color?: string; thickness?: number },
    ) => HTMLCanvasElement;
    extractPaper: (
        image: HTMLCanvasElement,
        resultWidth: number,
        resultHeight: number,
        cornerPoints?: DocumentCorners,
    ) => HTMLCanvasElement | null;
    getCornerPoints: (contour: CvContour) => Partial<DocumentCorners>;
};

type DocumentPoint = {
    x: number;
    y: number;
};

type DocumentCorners = {
    topLeftCorner: DocumentPoint;
    topRightCorner: DocumentPoint;
    bottomLeftCorner: DocumentPoint;
    bottomRightCorner: DocumentPoint;
};

type CvContour = {
    delete?: () => void;
};

type CvMat = {
    delete?: () => void;
};

type CvRuntime = {
    Mat?: unknown;
    imread?: (source: HTMLCanvasElement) => CvMat;
    Canny?: unknown;
    findContours?: unknown;
    warpPerspective?: unknown;
    contourArea?: (contour: CvContour) => number;
};

declare global {
    interface Window {
        cv?: CvRuntime;
        jscanify?: unknown;
        Scanner?: unknown;
    }
}

const CAMERA_TIMEOUT_MS = 9000;
const VIDEO_READY_TIMEOUT_MS = 8000;
const SCANNER_LOAD_TIMEOUT_MS = 12000;
const DETECTION_INTERVAL_MS = 700;
const ANALYSIS_MAX_WIDTH = 1280;
const OUTPUT_MAX_EDGE = 3000;
const JPEG_QUALITY = 0.95;
const MIN_DOCUMENT_AREA_RATIO = 0.08;
const MIN_DOCUMENT_SIDE_RATIO = 0.25;
const OPENCV_SCRIPT_SRC = "/vendor/jscanify-opencv.js";
const JSCANIFY_SCRIPT_SRC = "/vendor/jscanify.js";
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

type JscanifyConstructorResult = {
    Constructor: JscanifyConstructor;
    label: string;
    name: string;
};

type ScannerDebugState = {
    camera: string;
    videoSize: string;
    openCvScript: string;
    openCvRuntime: string;
    jscanifyScript: string;
    jscanifyConstructor: string;
    scannerInstance: string;
    lastDetection: string;
    analysisSize: string;
    analysisAttempts: number;
    lastAnalysisAt: string;
    lastError: string;
};

function getInitialDebugState(): ScannerDebugState {
    return {
        camera: "wartet",
        videoSize: "-",
        openCvScript: "wartet",
        openCvRuntime: "nicht bereit",
        jscanifyScript: "wartet",
        jscanifyConstructor: "nicht gefunden",
        scannerInstance: "wartet",
        lastDetection: "-",
        analysisSize: "-",
        analysisAttempts: 0,
        lastAnalysisAt: "-",
        lastError: "-",
    };
}

function createTimeoutError(message: string): Error {
    return new Error(message);
}

function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            reject(createTimeoutError(message));
        }, timeoutMs);

        promise.then(
            (value) => {
                window.clearTimeout(timeoutId);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timeoutId);
                reject(error);
            },
        );
    });
}

function stopMediaStream(stream: MediaStream | null) {
    stream?.getTracks().forEach((track) => track.stop());
}

function isVideoDimensionReady(video: HTMLVideoElement): boolean {
    return video.videoWidth > 0 && video.videoHeight > 0;
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
    if (isVideoDimensionReady(video)) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let intervalId: number | null = null;
        let timeoutId: number | null = null;

        const cleanup = () => {
            video.removeEventListener("loadedmetadata", handleReady);
            video.removeEventListener("loadeddata", handleReady);
            video.removeEventListener("canplay", handleReady);
            video.removeEventListener("playing", handleReady);
            video.removeEventListener("resize", handleReady);

            if (intervalId !== null) window.clearInterval(intervalId);
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };

        const handleReady = () => {
            if (!isVideoDimensionReady(video)) return;

            console.info("[scanner] video ready width/height", {
                width: video.videoWidth,
                height: video.videoHeight,
                readyState: video.readyState,
            });

            cleanup();
            resolve();
        };

        video.addEventListener("loadedmetadata", handleReady);
        video.addEventListener("loadeddata", handleReady);
        video.addEventListener("canplay", handleReady);
        video.addEventListener("playing", handleReady);
        video.addEventListener("resize", handleReady);

        intervalId = window.setInterval(handleReady, 150);
        timeoutId = window.setTimeout(() => {
            cleanup();
            console.warn("[scanner] waitForVideoReady timeout", {
                width: video.videoWidth,
                height: video.videoHeight,
                readyState: video.readyState,
            });
            reject(
                createTimeoutError(
                    "Kameravorschau konnte nicht gestartet werden.",
                ),
            );
        }, VIDEO_READY_TIMEOUT_MS);

        handleReady();
    });
}

function startVideoPlayback(video: HTMLVideoElement) {
    console.info("[scanner] video.play started");
    let playSettled = false;

    void video.play().then(
        () => {
            playSettled = true;
        },
        () => {
            playSettled = true;
            console.warn("[scanner] video.play rejected/ignored");
        },
    );

    window.setTimeout(() => {
        if (!playSettled) {
            console.warn("[scanner] video.play timeout/ignored");
        }
    }, 1000);
}

function getCameraErrorMessage(hasStream: boolean): string {
    if (hasStream) {
        return "Kameravorschau konnte nicht gestartet werden. Bitte Seite neu laden oder Datei manuell hochladen.";
    }

    return "Kamera konnte nicht geöffnet werden. Bitte Berechtigung prüfen oder Datei manuell hochladen.";
}

function getScanFileName(): string {
    const now = new Date();
    const date = toDateOnlyString(now);
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((value) => String(value).padStart(2, "0"))
        .join("-");

    return `scan-${date}-${time}.jpg`;
}

function canvasToFile(canvas: HTMLCanvasElement): Promise<File> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("Scan konnte nicht als Bild gespeichert werden."));
                    return;
                }

                resolve(
                    new File([blob], getScanFileName(), {
                        type: "image/jpeg",
                        lastModified: Date.now(),
                    }),
                );
            },
            "image/jpeg",
            JPEG_QUALITY,
        );
    });
}

function getScaledDimensions(
    width: number,
    height: number,
    maxEdge: number,
): { width: number; height: number } {
    const longestEdge = Math.max(width, height);
    const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

function drawVideoFrame(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    maxEdge = OUTPUT_MAX_EDGE,
) {
    const dimensions = getScaledDimensions(video.videoWidth, video.videoHeight, maxEdge);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
        throw new Error("Kamerabild konnte nicht gelesen werden.");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
}

function enhanceDocumentCanvas(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const contrast = 1.08;
    const brightness = 4;

    for (let index = 0; index < data.length; index += 4) {
        data[index] = Math.min(
            255,
            Math.max(0, (data[index] - 128) * contrast + 128 + brightness),
        );
        data[index + 1] = Math.min(
            255,
            Math.max(0, (data[index + 1] - 128) * contrast + 128 + brightness),
        );
        data[index + 2] = Math.min(
            255,
            Math.max(0, (data[index + 2] - 128) * contrast + 128 + brightness),
        );
    }

    context.putImageData(imageData, 0, 0);
}

function distance(pointA: DocumentPoint, pointB: DocumentPoint): number {
    return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function getCompleteCorners(
    corners: Partial<DocumentCorners>,
): DocumentCorners | null {
    const {
        topLeftCorner,
        topRightCorner,
        bottomLeftCorner,
        bottomRightCorner,
    } = corners;

    if (
        !topLeftCorner ||
        !topRightCorner ||
        !bottomLeftCorner ||
        !bottomRightCorner
    ) {
        return null;
    }

    return {
        topLeftCorner,
        topRightCorner,
        bottomLeftCorner,
        bottomRightCorner,
    };
}

function getDocumentDimensions(corners: DocumentCorners) {
    const topWidth = distance(corners.topLeftCorner, corners.topRightCorner);
    const bottomWidth = distance(corners.bottomLeftCorner, corners.bottomRightCorner);
    const leftHeight = distance(corners.topLeftCorner, corners.bottomLeftCorner);
    const rightHeight = distance(corners.topRightCorner, corners.bottomRightCorner);

    return {
        width: Math.max(topWidth, bottomWidth),
        height: Math.max(leftHeight, rightHeight),
    };
}

function drawDocumentOutline(
    canvas: HTMLCanvasElement,
    corners: DocumentCorners | null,
) {
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!corners) return;

    const points = [
        corners.topLeftCorner,
        corners.topRightCorner,
        corners.bottomRightCorner,
        corners.bottomLeftCorner,
    ];

    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.lineWidth = Math.max(4, canvas.width / 180);
    context.strokeStyle = "#22d3ee";
    context.fillStyle = "rgba(8, 145, 178, 0.12)";
    context.fill();
    context.stroke();

    points.forEach((point) => {
        context.beginPath();
        context.arc(point.x, point.y, Math.max(5, canvas.width / 150), 0, Math.PI * 2);
        context.fillStyle = "#ffffff";
        context.fill();
        context.lineWidth = Math.max(2, canvas.width / 280);
        context.strokeStyle = "#0891b2";
        context.stroke();
    });
}

function scaleCorners(
    corners: DocumentCorners,
    fromSize: { width: number; height: number },
    toSize: { width: number; height: number },
): DocumentCorners {
    const scaleX = toSize.width / fromSize.width;
    const scaleY = toSize.height / fromSize.height;
    const scalePoint = (point: DocumentPoint) => ({
        x: point.x * scaleX,
        y: point.y * scaleY,
    });

    return {
        topLeftCorner: scalePoint(corners.topLeftCorner),
        topRightCorner: scalePoint(corners.topRightCorner),
        bottomLeftCorner: scalePoint(corners.bottomLeftCorner),
        bottomRightCorner: scalePoint(corners.bottomRightCorner),
    };
}

async function getCameraStreamWithFallback(
    onLateStream: (stream: MediaStream) => void,
): Promise<MediaStream> {
    const constraints: MediaStreamConstraints[] = [
        {
            audio: false,
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
        },
        {
            audio: false,
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
        },
        {
            audio: false,
            video: { facingMode: "environment" },
        },
        {
            audio: false,
            video: true,
        },
    ];

    let lastError: unknown = null;

    for (const constraint of constraints) {
        let timedOut = false;
        const cameraPromise = navigator.mediaDevices
            .getUserMedia(constraint)
            .then((stream) => {
                if (timedOut) onLateStream(stream);
                return stream;
            });

        try {
            return await withTimeout(
                cameraPromise,
                CAMERA_TIMEOUT_MS,
                "Kamera konnte nicht geöffnet werden.",
            );
        } catch (error) {
            timedOut = true;
            lastError = error;
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Kamera konnte nicht geöffnet werden.");
}

function isCvReady(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;

    const runtime = value as CvRuntime;

    return (
        typeof runtime.Mat === "function" &&
        typeof runtime.imread === "function" &&
        typeof runtime.Canny === "function" &&
        typeof runtime.findContours === "function" &&
        typeof runtime.warpPerspective === "function" &&
        typeof runtime.contourArea === "function"
    );
}

function getJscanifyConstructor(): JscanifyConstructorResult | null {
    const jscanifyExport = window.jscanify as
        | {
        default?: unknown;
        Scanner?: unknown;
    }
        | undefined;
    const candidates: Array<{ label: string; value: unknown }> = [
        { label: "window.jscanify.default", value: jscanifyExport?.default },
        { label: "window.jscanify.Scanner", value: jscanifyExport?.Scanner },
        { label: "window.jscanify", value: window.jscanify },
        { label: "window.Scanner", value: window.Scanner },
    ];

    for (const candidate of candidates) {
        if (typeof candidate.value === "function") {
            const Constructor = candidate.value as JscanifyConstructor;

            return {
                Constructor,
                label: candidate.label,
                name: Constructor.name || "anonymous",
            };
        }
    }

    return null;
}

function detectDocument(
    scanner: JscanifyScanner,
    canvas: HTMLCanvasElement,
): { corners: DocumentCorners; areaRatio: number; reason?: string } | null {
    const cv = window.cv;
    if (!cv?.imread || !cv.contourArea) return null;

    const image = cv.imread(canvas);
    const contour = scanner.findPaperContour(image);

    try {
        if (!contour) return null;

        const area = Math.abs(cv.contourArea(contour));
        const areaRatio = area / (canvas.width * canvas.height);
        const corners = getCompleteCorners(scanner.getCornerPoints(contour));

        if (!corners) return null;

        if (areaRatio < MIN_DOCUMENT_AREA_RATIO) {
            console.info("[scanner] contour rejected: small area", {
                areaRatio,
                minAreaRatio: MIN_DOCUMENT_AREA_RATIO,
            });
            return null;
        }

        const dimensions = getDocumentDimensions(corners);
        const widthRatio = dimensions.width / canvas.width;
        const heightRatio = dimensions.height / canvas.height;

        if (
            widthRatio < MIN_DOCUMENT_SIDE_RATIO &&
            heightRatio < MIN_DOCUMENT_SIDE_RATIO
        ) {
            console.info("[scanner] contour rejected: too small in frame", {
                widthRatio,
                heightRatio,
                minSideRatio: MIN_DOCUMENT_SIDE_RATIO,
            });
            return null;
        }

        return { corners, areaRatio };
    } finally {
        contour?.delete?.();
        image.delete?.();
    }
}

function loadOpenCvScript(): Promise<void> {
    if (isCvReady(window.cv)) {
        console.info("[scanner] cv runtime ready");
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        let intervalId: number | null = null;
        let timeoutId: number | null = null;

        const cleanup = () => {
            if (intervalId !== null) window.clearInterval(intervalId);
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };

        const tryResolve = () => {
            if (!isCvReady(window.cv) || settled) return;

            settled = true;
            cleanup();
            console.info("[scanner] cv runtime ready");
            resolve();
        };

        const existingScript = document.querySelector<HTMLScriptElement>(
            'script[data-document-scanner-opencv="jscanify"]',
        );

        if (!existingScript) {
            const script = document.createElement("script");
            script.src = OPENCV_SCRIPT_SRC;
            script.async = true;
            script.dataset.documentScannerOpencv = "jscanify";
            script.addEventListener("load", () => {
                console.info("[scanner] opencv script loaded");
                tryResolve();
            });
            script.addEventListener(
                "error",
                () => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(new Error("OpenCV konnte nicht geladen werden."));
                },
                { once: true },
            );
            document.head.appendChild(script);
        }

        intervalId = window.setInterval(tryResolve, 100);
        timeoutId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error("Scanner konnte nicht geladen werden."));
        }, SCANNER_LOAD_TIMEOUT_MS);

        tryResolve();
    });
}

function loadScriptOnce(
    src: string,
    markerName: string,
    isReady: () => boolean,
    timeoutMessage: string,
): Promise<void> {
    if (isReady()) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        let intervalId: number | null = null;
        let timeoutId: number | null = null;

        const cleanup = () => {
            if (intervalId !== null) window.clearInterval(intervalId);
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };

        const tryResolve = () => {
            if (!isReady() || settled) return;

            settled = true;
            cleanup();
            resolve();
        };

        const existingScript = document.querySelector<HTMLScriptElement>(
            `script[data-document-scanner-script="${markerName}"]`,
        );

        if (!existingScript) {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.dataset.documentScannerScript = markerName;
            script.addEventListener("load", () => {
                if (markerName === "jscanify") {
                    console.info("[scanner] jscanify script loaded");
                }
                tryResolve();
            });
            script.addEventListener(
                "error",
                () => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(new Error(timeoutMessage));
                },
                { once: true },
            );
            document.head.appendChild(script);
        }

        intervalId = window.setInterval(tryResolve, 100);
        timeoutId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(timeoutMessage));
        }, SCANNER_LOAD_TIMEOUT_MS);

        tryResolve();
    });
}

export function DocumentScannerDialog({
                                          open,
                                          onOpenChange,
                                          onScanComplete,
                                      }: DocumentScannerDialogProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const frameCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const outputCanvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectionIntervalRef = useRef<number | null>(null);
    const scannerRef = useRef<JscanifyScanner | null>(null);
    const detectedCornersRef = useRef<DocumentCorners | null>(null);
    const detectedCanvasSizeRef = useRef<{ width: number; height: number } | null>(null);
    const detectionRunningRef = useRef(false);

    const [isLoadingScanner, setIsLoadingScanner] = useState(false);
    const [isOpeningCamera, setIsOpeningCamera] = useState(false);
    const [isPreparingVideo, setIsPreparingVideo] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [canCapturePhoto, setCanCapturePhoto] = useState(false);
    const [isProcessingScan, setIsProcessingScan] = useState(false);
    const [isScannerUnavailable, setIsScannerUnavailable] = useState(false);
    const [scannerReady, setScannerReady] = useState(false);
    const [documentDetected, setDocumentDetected] = useState(false);
    const [scanHint, setScanHint] = useState(
        "Dokument vollständig ins Bild halten oder Foto übernehmen",
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [, setDebugState] =
        useState<ScannerDebugState>(getInitialDebugState);

    const updateDebug = useCallback((partialState: Partial<ScannerDebugState>) => {
        if (!IS_DEVELOPMENT) return;

        setDebugState((currentState) => ({
            ...currentState,
            ...partialState,
        }));
    }, []);

    const stopScanner = useCallback(() => {
        if (detectionIntervalRef.current !== null) {
            window.clearInterval(detectionIntervalRef.current);
            detectionIntervalRef.current = null;
        }

        stopMediaStream(streamRef.current);
        streamRef.current = null;

        const video = videoRef.current;
        if (video) {
            video.pause();
            video.srcObject = null;
            video.removeAttribute("src");
            video.load();
        }

        detectionRunningRef.current = false;
        scannerRef.current = null;
        setScannerReady(false);
        detectedCornersRef.current = null;
        detectedCanvasSizeRef.current = null;
        setDocumentDetected(false);
        setScanHint("Dokument vollständig ins Bild halten oder Foto übernehmen");
        updateDebug({
            scannerInstance: "wartet",
            lastDetection: "-",
            analysisSize: "-",
        });

        const overlayCanvas = overlayCanvasRef.current;
        const overlayContext = overlayCanvas?.getContext("2d");
        if (overlayCanvas && overlayContext) {
            overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }
    }, [updateDebug]);

    const resetScannerState = useCallback(() => {
        setIsLoadingScanner(false);
        setIsOpeningCamera(false);
        setIsPreparingVideo(false);
        setIsVideoReady(false);
        setCanCapturePhoto(false);
        setIsProcessingScan(false);
        setIsScannerUnavailable(false);
        setScannerReady(false);
        setDocumentDetected(false);
        detectedCornersRef.current = null;
        detectedCanvasSizeRef.current = null;
        setScanHint("Dokument vollständig ins Bild halten oder Foto übernehmen");
        setErrorMessage(null);
        setDebugState(getInitialDebugState());
    }, []);

    const handleCancel = useCallback(() => {
        stopScanner();
        resetScannerState();
        onOpenChange(false);
    }, [onOpenChange, resetScannerState, stopScanner]);

    const analyzeFrame = useCallback(() => {
        if (detectionRunningRef.current) return;

        const scanner = scannerRef.current;
        const video = videoRef.current;
        const frameCanvas = frameCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;

        if (
            !scanner ||
            !video ||
            !frameCanvas ||
            !overlayCanvas ||
            !isVideoDimensionReady(video)
        ) {
            return;
        }

        detectionRunningRef.current = true;

        try {
            const analysisWidth = Math.min(ANALYSIS_MAX_WIDTH, video.videoWidth);
            const analysisHeight = Math.round(
                video.videoHeight * (analysisWidth / video.videoWidth),
            );
            const analysisSize = `${analysisWidth} x ${analysisHeight}`;

            frameCanvas.width = analysisWidth;
            frameCanvas.height = analysisHeight;
            overlayCanvas.width = analysisWidth;
            overlayCanvas.height = analysisHeight;

            if (IS_DEVELOPMENT) {
                setDebugState((currentState) => ({
                    ...currentState,
                    analysisAttempts: currentState.analysisAttempts + 1,
                    analysisSize,
                    videoSize: `${video.videoWidth} x ${video.videoHeight}`,
                    lastAnalysisAt: new Date().toLocaleTimeString("de-DE"),
                }));
            }

            const frameContext = frameCanvas.getContext("2d", {
                willReadFrequently: true,
            });
            if (!frameContext) return;

            frameContext.drawImage(video, 0, 0, analysisWidth, analysisHeight);

            const detectedDocument = detectDocument(scanner, frameCanvas);

            if (!detectedDocument) {
                console.info("[scanner] no contour found");
                detectedCornersRef.current = null;
                detectedCanvasSizeRef.current = null;
                drawDocumentOutline(overlayCanvas, null);
                setDocumentDetected(false);
                updateDebug({
                    lastDetection: "keine Kontur",
                    lastError: "-",
                });
                setScanHint(
                    "Dokument vollständig ins Bild halten. Achte auf guten Kontrast zum Hintergrund.",
                );
                return;
            }

            console.info("[scanner] contour found", detectedDocument.corners);
            detectedCornersRef.current = detectedDocument.corners;
            detectedCanvasSizeRef.current = {
                width: frameCanvas.width,
                height: frameCanvas.height,
            };
            drawDocumentOutline(overlayCanvas, detectedDocument.corners);
            setDocumentDetected(true);
            updateDebug({
                lastDetection: `Kontur gefunden (${Math.round(
                    detectedDocument.areaRatio * 100,
                )}%)`,
                lastError: "-",
            });
            setScanHint("Dokument erkannt - ruhig halten und Scan übernehmen");
        } catch (error) {
            console.warn("[scanner] contour detection failed", error);
            detectedCornersRef.current = null;
            detectedCanvasSizeRef.current = null;
            drawDocumentOutline(overlayCanvas, null);
            setDocumentDetected(false);
            updateDebug({
                lastDetection: "Fehler",
                lastError:
                    error instanceof Error
                        ? error.message
                        : "Dokumenterkennung fehlgeschlagen",
            });
            setScanHint("Achte auf gute Beleuchtung und halte das Dokument näher an die Kamera.");
        } finally {
            detectionRunningRef.current = false;
        }
    }, [updateDebug]);

    const startDetection = useCallback(() => {
        const video = videoRef.current;

        if (
            detectionIntervalRef.current !== null ||
            !scannerRef.current ||
            !video ||
            !isVideoDimensionReady(video)
        ) {
            return;
        }

        detectionIntervalRef.current = window.setInterval(
            analyzeFrame,
            DETECTION_INTERVAL_MS,
        );
        analyzeFrame();
    }, [analyzeFrame]);

    useEffect(() => {
        if (!open) {
            const timeoutId = window.setTimeout(() => {
                stopScanner();
                resetScannerState();
            }, 0);

            return () => window.clearTimeout(timeoutId);
        }

        let cancelled = false;

        async function startScannerLibrary() {
            setIsLoadingScanner(true);
            setIsScannerUnavailable(false);
            updateDebug({
                openCvScript: "wartet",
                openCvRuntime: "nicht bereit",
                jscanifyScript: "wartet",
                jscanifyConstructor: "nicht gefunden",
                scannerInstance: "wartet",
                lastError: "-",
            });

            try {
                await loadOpenCvScript();
                if (cancelled) return;

                updateDebug({
                    openCvScript: "geladen",
                    openCvRuntime: isCvReady(window.cv) ? "bereit" : "nicht bereit",
                });

                await loadScriptOnce(
                    JSCANIFY_SCRIPT_SRC,
                    "jscanify",
                    () => getJscanifyConstructor() !== null,
                    "jscanify konnte nicht geladen werden.",
                );
                if (cancelled) return;

                updateDebug({
                    jscanifyScript: "geladen",
                });

                const scannerConstructor = getJscanifyConstructor();

                if (!scannerConstructor) {
                    throw new Error("jscanify Constructor wurde nicht gefunden.");
                }

                updateDebug({
                    jscanifyConstructor: `${scannerConstructor.label} (${scannerConstructor.name})`,
                });
                console.info("[scanner] jscanify constructor", {
                    export: scannerConstructor.label,
                    name: scannerConstructor.name,
                });

                scannerRef.current = new scannerConstructor.Constructor();
                setScannerReady(true);
                console.info("[scanner] scanner instance created");
                updateDebug({
                    scannerInstance: "erstellt",
                });
                setIsScannerUnavailable(false);
                startDetection();
            } catch (error) {
                if (cancelled) return;

                scannerRef.current = null;
                setScannerReady(false);
                setIsScannerUnavailable(true);
                setDocumentDetected(false);
                updateDebug({
                    openCvRuntime: isCvReady(window.cv) ? "bereit" : "nicht bereit",
                    jscanifyConstructor: getJscanifyConstructor()
                        ? "gefunden"
                        : "nicht gefunden",
                    scannerInstance: "Fehler",
                    lastError:
                        error instanceof Error
                            ? error.message
                            : "Scanner konnte nicht initialisiert werden.",
                });
            } finally {
                if (!cancelled) setIsLoadingScanner(false);
            }
        }

        async function startCamera() {
            stopScanner();
            resetScannerState();

            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error("Kamera-API ist in diesem Browser nicht verfügbar.");
                }

                setIsOpeningCamera(true);
                updateDebug({
                    camera: "wartet",
                    lastError: "-",
                });
                const stream = await getCameraStreamWithFallback((lateStream) => {
                    stopMediaStream(lateStream);
                });
                console.info("[scanner] getUserMedia resolved");
                updateDebug({
                    camera: "bereit",
                });

                if (cancelled) {
                    stopMediaStream(stream);
                    return;
                }

                setIsOpeningCamera(false);
                setIsPreparingVideo(true);
                streamRef.current = stream;

                const video = videoRef.current;
                if (!video) {
                    throw new Error("Kameravorschau konnte nicht initialisiert werden.");
                }

                video.muted = true;
                video.playsInline = true;
                video.autoplay = true;
                video.srcObject = stream;

                console.info("[scanner] video srcObject set");
                startVideoPlayback(video);
                console.info("[scanner] waiting for video ready");
                await waitForVideoReady(video);

                if (cancelled) return;

                setIsVideoReady(true);
                setCanCapturePhoto(true);
                updateDebug({
                    videoSize: `${video.videoWidth} x ${video.videoHeight}`,
                });
                startDetection();
            } catch (error) {
                if (cancelled) return;

                const hadStream = Boolean(streamRef.current);
                stopScanner();
                setIsOpeningCamera(false);
                setIsPreparingVideo(false);
                setIsVideoReady(false);
                setCanCapturePhoto(false);
                setErrorMessage(getCameraErrorMessage(hadStream));
                updateDebug({
                    camera: "Fehler",
                    lastError:
                        error instanceof Error
                            ? error.message
                            : getCameraErrorMessage(hadStream),
                });
                return;
            } finally {
                if (!cancelled) {
                    setIsOpeningCamera(false);
                    setIsPreparingVideo(false);
                }
            }
        }

        void startCamera();
        void startScannerLibrary();

        return () => {
            cancelled = true;
            stopScanner();
        };
    }, [open, resetScannerState, startDetection, stopScanner, updateDebug]);

    useEffect(() => {
        if (!open) return;

        const intervalId = window.setInterval(() => {
            const video = videoRef.current;

            if (!video || !isVideoDimensionReady(video)) return;

            setCanCapturePhoto(true);
            setIsVideoReady(true);
            setIsPreparingVideo(false);
            updateDebug({
                camera: "bereit",
                videoSize: `${video.videoWidth} x ${video.videoHeight}`,
            });
            startDetection();
        }, 150);

        return () => window.clearInterval(intervalId);
    }, [open, startDetection, updateDebug]);

    async function handlePhotoCapture() {
        const video = videoRef.current;
        const outputCanvas = outputCanvasRef.current;

        if (!video || !outputCanvas || !isVideoDimensionReady(video)) {
            setErrorMessage("Foto konnte nicht verarbeitet werden.");
            return;
        }

        setIsProcessingScan(true);
        setErrorMessage(null);

        try {
            drawVideoFrame(video, outputCanvas);
            enhanceDocumentCanvas(outputCanvas);

            const file = await canvasToFile(outputCanvas);
            stopScanner();
            onScanComplete(file);
            onOpenChange(false);
        } catch {
            setErrorMessage(
                "Foto konnte nicht verarbeitet werden. Bitte erneut versuchen oder Datei manuell hochladen.",
            );
        } finally {
            setIsProcessingScan(false);
        }
    }

    async function handleDocumentScan() {
        const video = videoRef.current;
        const scanner = scannerRef.current;
        const frameCanvas = frameCanvasRef.current;
        const outputCanvas = outputCanvasRef.current;

        if (!video || !scanner || !frameCanvas || !outputCanvas) {
            await handlePhotoCapture();
            return;
        }

        setIsProcessingScan(true);
        setErrorMessage(null);

        try {
            drawVideoFrame(video, frameCanvas);
            const detectedDocument = detectDocument(scanner, frameCanvas);
            const fallbackCorners =
                detectedCornersRef.current && detectedCanvasSizeRef.current
                    ? scaleCorners(detectedCornersRef.current, detectedCanvasSizeRef.current, {
                        width: frameCanvas.width,
                        height: frameCanvas.height,
                    })
                    : null;
            const corners = detectedDocument?.corners ?? fallbackCorners;

            if (!corners) {
                setIsProcessingScan(false);
                await handlePhotoCapture();
                return;
            }

            detectedCornersRef.current = corners;
            detectedCanvasSizeRef.current = {
                width: frameCanvas.width,
                height: frameCanvas.height,
            };
            const documentDimensions = getDocumentDimensions(corners);
            const scaledDimensions = getScaledDimensions(
                documentDimensions.width,
                documentDimensions.height,
                OUTPUT_MAX_EDGE,
            );
            const scannedCanvas = scanner.extractPaper(
                frameCanvas,
                scaledDimensions.width,
                scaledDimensions.height,
                corners,
            );

            if (!scannedCanvas) {
                setIsProcessingScan(false);
                await handlePhotoCapture();
                return;
            }

            outputCanvas.width = scannedCanvas.width;
            outputCanvas.height = scannedCanvas.height;
            const outputContext = outputCanvas.getContext("2d", {
                willReadFrequently: true,
            });
            if (!outputContext) {
                throw new Error("Scan konnte nicht verarbeitet werden.");
            }

            outputContext.drawImage(scannedCanvas, 0, 0);
            enhanceDocumentCanvas(outputCanvas);

            const file = await canvasToFile(outputCanvas);
            stopScanner();
            onScanComplete(file);
            onOpenChange(false);
        } catch {
            setIsProcessingScan(false);
            await handlePhotoCapture();
        } finally {
            setIsProcessingScan(false);
        }
    }

    async function handlePrimaryAction() {
        if (scannerRef.current && documentDetected) {
            await handleDocumentScan();
            return;
        }

        await handlePhotoCapture();
    }

    const hasCameraError = Boolean(errorMessage && !isVideoReady);
    const showCameraLoading = open && isOpeningCamera && !isVideoReady && !hasCameraError;
    const showVideoPreparing =
        open &&
        isPreparingVideo &&
        !isOpeningCamera &&
        !isVideoReady &&
        !hasCameraError;
    const primaryButtonLabel = isProcessingScan
        ? "Wird verarbeitet..."
        : scannerReady && documentDetected
            ? "Scan übernehmen"
            : "Foto übernehmen";

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    handleCancel();
                    return;
                }

                onOpenChange(true);
            }}
        >
            <DialogContent
                showCloseButton={false}
                className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto rounded-2xl bg-slate-950 p-3 text-white sm:p-5"
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg font-extrabold text-white">
                        <ScanLine className="size-5 text-cyan-400" />
                        Dokument scannen
                    </DialogTitle>
                    <DialogDescription className="text-slate-300">
                        Die Verarbeitung erfolgt lokal im Browser. Es wird erst nach deiner
                        Bestätigung hochgeladen.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative overflow-hidden rounded-2xl bg-black">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="block max-h-[62dvh] w-full object-contain"
                    />
                    <canvas
                        ref={overlayCanvasRef}
                        className="pointer-events-none absolute inset-0 size-full"
                    />

                    {showCameraLoading || showVideoPreparing ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85">
                            <div className="text-center">
                                <Loader2 className="mx-auto size-8 animate-spin text-cyan-400" />
                                {showCameraLoading ? (
                                    <>
                                        <p className="mt-3 font-bold">Kamera wird geöffnet...</p>
                                        <p className="mt-1 text-sm text-slate-300">
                                            Bitte Kamerazugriff erlauben.
                                        </p>
                                    </>
                                ) : null}
                                {showVideoPreparing ? (
                                    <>
                                        <p className="mt-3 font-bold">Kamera wird vorbereitet...</p>
                                        <p className="mt-1 text-sm text-slate-300">
                                            Videovorschau wird gestartet.
                                        </p>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {hasCameraError ? (
                        <div className="absolute inset-0 flex min-h-72 items-center justify-center bg-slate-950 p-6">
                            <div className="max-w-md text-center">
                                <TriangleAlert className="mx-auto size-9 text-amber-400" />
                                <p className="mt-4 font-extrabold">Scanner nicht verfügbar</p>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                    {errorMessage}
                                </p>
                            </div>
                        </div>
                    ) : null}
                </div>

                <canvas ref={frameCanvasRef} className="hidden" />
                <canvas ref={outputCanvasRef} className="hidden" />

                {isVideoReady ? (
                    <div
                        className={
                            documentDetected
                                ? "rounded-2xl border border-emerald-700 bg-emerald-950/70 px-4 py-3 text-sm font-bold text-emerald-200"
                                : "rounded-2xl border border-amber-700 bg-amber-950/70 px-4 py-3 text-sm font-bold text-amber-200"
                        }
                    >
                        {documentDetected && scannerReady
                            ? scanHint
                            : isScannerUnavailable
                                ? "Automatische Erkennung nicht verfügbar - Foto kann trotzdem übernommen werden."
                                : isLoadingScanner
                                    ? "Dokumenterkennung wird geladen... Foto kann trotzdem übernommen werden."
                                    : scanHint}
                    </div>
                ) : null}

                {errorMessage && isVideoReady ? (
                    <div className="rounded-2xl border border-red-700 bg-red-950/70 px-4 py-3 text-sm font-bold text-red-200">
                        {errorMessage}
                    </div>
                ) : null}

                <DialogFooter className="sticky bottom-0 z-10 border-slate-700 bg-slate-900">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 border-slate-600 bg-slate-900 text-white hover:bg-slate-800"
                        onClick={handleCancel}
                    >
                        Abbrechen
                    </Button>
                    <Button
                        type="button"
                        disabled={!canCapturePhoto || isProcessingScan}
                        className="h-11 bg-cyan-600 text-white hover:bg-cyan-500"
                        onClick={() => void handlePrimaryAction()}
                    >
                        {isProcessingScan ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Camera className="size-4" />
                        )}
                        {primaryButtonLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

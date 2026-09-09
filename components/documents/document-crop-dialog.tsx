"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Crop, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type DocumentCropDialogProps = {
    open: boolean;
    imageFile: File | null;
    onOpenChange: (open: boolean) => void;
    onCropComplete: (file: File) => void;
};

type CropBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type ImageLayout = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type DragMode = "move" | "nw" | "ne" | "sw" | "se";

const minCropSize = 12;

function getCroppedFileName(fileName: string): string {
    const extension = fileName.split(".").pop()?.toLowerCase();
    const safeExtension = extension === "png" ? "png" : "jpg";
    const baseName = fileName.replace(/\.[^.]+$/, "").trim() || "dokument";

    return `${baseName}-cropped.${safeExtension}`;
}

function getOutputMimeType(file: File): "image/jpeg" | "image/png" {
    return file.type === "image/png" ? "image/png" : "image/jpeg";
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function fitCropBox(box: CropBox): CropBox {
    return {
        x: clamp(box.x, 0, 100 - box.width),
        y: clamp(box.y, 0, 100 - box.height),
        width: clamp(box.width, minCropSize, 100),
        height: clamp(box.height, minCropSize, 100),
    };
}

function canvasToBlob(
    canvas: HTMLCanvasElement,
    mimeType: "image/jpeg" | "image/png",
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("Das Zuschneiden konnte nicht abgeschlossen werden."));
                    return;
                }

                resolve(blob);
            },
            mimeType,
            mimeType === "image/jpeg" ? 0.9 : undefined,
        );
    });
}

export function DocumentCropDialog({
    open,
    imageFile,
    onOpenChange,
    onCropComplete,
}: DocumentCropDialogProps) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const dragRef = useRef<{
        mode: DragMode;
        pointerId: number;
        startX: number;
        startY: number;
        startBox: CropBox;
    } | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [cropBox, setCropBox] = useState<CropBox>({
        x: 8,
        y: 8,
        width: 84,
        height: 84,
    });
    const [imageLayout, setImageLayout] = useState<ImageLayout | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !imageFile) return;

        const objectUrl = URL.createObjectURL(imageFile);
        const timeoutId = window.setTimeout(() => {
            setImageUrl(objectUrl);
            setCropBox({ x: 8, y: 8, width: 84, height: 84 });
            setImageLayout(null);
            setErrorMessage(null);
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
            URL.revokeObjectURL(objectUrl);
        };
    }, [imageFile, open]);

    function closeDialog() {
        onOpenChange(false);
    }

    function updateImageLayout() {
        const stage = stageRef.current;
        const image = imageRef.current;

        if (!stage || !image) return;

        const stageRect = stage.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();

        setImageLayout({
            left: imageRect.left - stageRect.left,
            top: imageRect.top - stageRect.top,
            width: imageRect.width,
            height: imageRect.height,
        });
    }

    useEffect(() => {
        if (!open) return;

        const stage = stageRef.current;
        const image = imageRef.current;

        if (!stage || !image) return;

        const observer = new ResizeObserver(() => updateImageLayout());
        observer.observe(stage);
        observer.observe(image);
        window.addEventListener("resize", updateImageLayout);

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", updateImageLayout);
        };
    }, [open, imageUrl]);

    useEffect(() => {
        if (!open) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    if (!open || typeof document === "undefined") return null;

    function getRelativePointer(event: PointerEvent<HTMLDivElement>) {
        const stage = stageRef.current;

        if (!stage || !imageLayout) {
            return { x: 0, y: 0 };
        }

        return {
            x: ((event.clientX - stage.getBoundingClientRect().left - imageLayout.left) /
                imageLayout.width) *
                100,
            y: ((event.clientY - stage.getBoundingClientRect().top - imageLayout.top) /
                imageLayout.height) *
                100,
        };
    }

    function handlePointerDown(
        event: PointerEvent<HTMLDivElement>,
        mode: DragMode,
    ) {
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = getRelativePointer(event);
        dragRef.current = {
            mode,
            pointerId: event.pointerId,
            startX: point.x,
            startY: point.y,
            startBox: cropBox,
        };
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) return;

        const point = getRelativePointer(event);
        const deltaX = point.x - drag.startX;
        const deltaY = point.y - drag.startY;
        const start = drag.startBox;

        if (drag.mode === "move") {
            setCropBox(
                fitCropBox({
                    ...start,
                    x: start.x + deltaX,
                    y: start.y + deltaY,
                }),
            );
            return;
        }

        const next = { ...start };

        if (drag.mode.includes("w")) {
            next.x = clamp(start.x + deltaX, 0, start.x + start.width - minCropSize);
            next.width = start.width + start.x - next.x;
        }

        if (drag.mode.includes("e")) {
            next.width = clamp(start.width + deltaX, minCropSize, 100 - start.x);
        }

        if (drag.mode.includes("n")) {
            next.y = clamp(start.y + deltaY, 0, start.y + start.height - minCropSize);
            next.height = start.height + start.y - next.y;
        }

        if (drag.mode.includes("s")) {
            next.height = clamp(start.height + deltaY, minCropSize, 100 - start.y);
        }

        setCropBox(fitCropBox(next));
    }

    function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
        if (dragRef.current?.pointerId === event.pointerId) {
            dragRef.current = null;
        }
    }

    async function handleConfirmCrop() {
        const image = imageRef.current;

        if (!image || !imageFile) return;

        try {
            const sourceWidth = image.naturalWidth;
            const sourceHeight = image.naturalHeight;
            const sourceX = Math.round((cropBox.x / 100) * sourceWidth);
            const sourceY = Math.round((cropBox.y / 100) * sourceHeight);
            const sourceCropWidth = Math.round((cropBox.width / 100) * sourceWidth);
            const sourceCropHeight = Math.round((cropBox.height / 100) * sourceHeight);
            const canvas = document.createElement("canvas");

            canvas.width = sourceCropWidth;
            canvas.height = sourceCropHeight;

            const context = canvas.getContext("2d");

            if (!context) {
                setErrorMessage("Das Zuschneiden konnte nicht abgeschlossen werden.");
                return;
            }

            context.drawImage(
                image,
                sourceX,
                sourceY,
                sourceCropWidth,
                sourceCropHeight,
                0,
                0,
                sourceCropWidth,
                sourceCropHeight,
            );

            const mimeType = getOutputMimeType(imageFile);
            const blob = await canvasToBlob(canvas, mimeType);
            const croppedFile = new File([blob], getCroppedFileName(imageFile.name), {
                type: mimeType,
                lastModified: Date.now(),
            });

            onCropComplete(croppedFile);
            closeDialog();
        } catch {
            setErrorMessage("Das Zuschneiden konnte nicht abgeschlossen werden.");
        }
    }

    return createPortal((
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-2 sm:p-5">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="document-crop-title"
                className="flex h-[min(760px,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 sm:h-[min(900px,calc(100dvh-2.5rem))] sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-3xl"
            >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 sm:px-5">
                    <div className="min-w-0">
                        <h2 id="document-crop-title" className="text-lg font-extrabold text-slate-950">
                            Dokument zuschneiden
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                            Passe den sichtbaren Bereich an und bestätige anschließend.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Abbrechen"
                        onClick={closeDialog}
                    >
                        <X className="size-5" />
                    </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden bg-slate-50 p-3 sm:p-5">
                    {imageUrl ? (
                        <div className="mx-auto flex h-full min-h-0 w-full max-w-[980px]">
                            <div
                                ref={stageRef}
                                className="relative flex min-h-0 w-full flex-1 touch-none select-none items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:rounded-2xl"
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    ref={imageRef}
                                    src={imageUrl}
                                    alt=""
                                    className="block max-h-full max-w-full object-contain"
                                    draggable={false}
                                    onLoad={updateImageLayout}
                                />
                                {imageLayout ? (
                                    <>
                                        <div
                                            className="absolute bg-slate-950/45"
                                            style={{
                                                left: imageLayout.left,
                                                top: imageLayout.top,
                                                width: imageLayout.width,
                                                height: imageLayout.height,
                                            }}
                                        />
                                        <div
                                            className="absolute border-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.42)]"
                                            style={{
                                                left: imageLayout.left + (cropBox.x / 100) * imageLayout.width,
                                                top: imageLayout.top + (cropBox.y / 100) * imageLayout.height,
                                                width: (cropBox.width / 100) * imageLayout.width,
                                                height: (cropBox.height / 100) * imageLayout.height,
                                            }}
                                            onPointerDown={(event) => handlePointerDown(event, "move")}
                                        >
                                            {(["nw", "ne", "sw", "se"] as const).map((mode) => (
                                                <div
                                                    key={mode}
                                                    className="absolute size-9 rounded-full border-2 border-white bg-cyan-500 shadow-lg"
                                                    style={{
                                                        left: mode.endsWith("w") ? "-18px" : "auto",
                                                        right: mode.endsWith("e") ? "-18px" : "auto",
                                                        top: mode.startsWith("n") ? "-18px" : "auto",
                                                        bottom: mode.startsWith("s") ? "-18px" : "auto",
                                                    }}
                                                    onPointerDown={(event) => {
                                                        event.stopPropagation();
                                                        handlePointerDown(event, mode);
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <p className="rounded-2xl bg-white p-4 text-sm font-bold text-red-700">
                            Das Bild konnte nicht geladen werden.
                        </p>
                    )}

                    {errorMessage ? (
                        <p className="mx-auto mt-3 max-w-3xl rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                            {errorMessage}
                        </p>
                    ) : null}
                </div>

                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-5 sm:pb-4">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-2xl"
                        onClick={closeDialog}
                    >
                        Abbrechen
                    </Button>
                    <Button
                        type="button"
                        className="h-11 rounded-2xl bg-cyan-700 px-5 font-extrabold text-white hover:bg-cyan-800"
                        onClick={handleConfirmCrop}
                    >
                        <Crop className="mr-2 size-4" />
                        Zuschneiden übernehmen
                    </Button>
                </div>
            </div>
        </div>
    ), document.body);
}
